import { COMMANDS, ROLE_PERMISSIONS, VOICE_COMMANDS, type CommandType } from '@dental/contracts';
import { describe, expect, it } from 'vitest';
import { PROMPT_VERSION, SYSTEM_PROMPT, userMessage } from './prompt.js';
import { buildTools, fingerprint, NO_COMMAND, toolName } from './tools.js';
import { validateReply } from './validate.js';

const dentist = buildTools(ROLE_PERMISSIONS.dentist);
const assistant = buildTools(ROLE_PERMISSIONS.assistant);
const names = (set: ReturnType<typeof buildTools>) => set.tools.map((tool) => tool.name);

describe('tools generated from the command registry', () => {
  it('offer each voice command the clinician may run, named after it, plus no_command', () => {
    const expected = (Object.keys(VOICE_COMMANDS) as CommandType[])
      .filter((type) =>
        (ROLE_PERMISSIONS.dentist as readonly string[]).includes(COMMANDS[type].permission)
      )
      .filter((type) => type !== 'diagnosis.suggest')
      .map(toolName);
    expect(names(dentist).sort()).toEqual([...expected, NO_COMMAND].sort());
    for (const [name, type] of dentist.commands) {
      expect(name).toMatch(/^[a-z_]+$/);
      expect(COMMANDS[type]).toBeDefined();
    }
  });

  it('never offer what the role may not do', () => {
    expect(names(assistant)).toContain(toolName('finding.add'));
    expect(names(assistant)).toContain(toolName('diagnosis.suggest'));
    for (const forbidden of [
      'diagnosis.record',
      'procedure.start',
      'session.sign',
      'plan_item.add',
    ] as const) {
      expect(names(assistant)).not.toContain(toolName(forbidden));
    }
    expect(names(buildTools(ROLE_PERMISSIONS.receptionist))).toEqual([NO_COMMAND]);
  });

  it('offer a dentist recording a diagnosis, not suggesting one', () => {
    expect(names(dentist)).toContain(toolName('diagnosis.record'));
    expect(names(dentist)).not.toContain(toolName('diagnosis.suggest'));
  });

  it('describe entities as spoken text, closed to anything else', () => {
    const finding = dentist.tools.find((tool) => tool.name === toolName('finding.add'))!;
    expect(Object.keys(finding.parameters.properties).sort()).toEqual(
      ['confidence', 'detail', 'finding', 'surfaces', 'tooth'].sort()
    );
    expect(finding.parameters.additionalProperties).toBe(false);
    expect(finding.description).toContain(COMMANDS['finding.add'].description);
  });

  it('fingerprint the exact prompt and tools', () => {
    expect(fingerprint(SYSTEM_PROMPT, dentist.tools)).toBe(
      fingerprint(SYSTEM_PROMPT, dentist.tools)
    );
    expect(fingerprint(SYSTEM_PROMPT, dentist.tools)).not.toBe(
      fingerprint(SYSTEM_PROMPT, assistant.tools)
    );
    expect(PROMPT_VERSION).toBeGreaterThan(1);
  });
});

describe('validating model output (V4 acceptance: output outside the registry is rejected)', () => {
  const tool = (name: string, input: unknown) => ({ kind: 'tool' as const, name, input });
  /** An utterance containing every entity value used below. */
  const SAID = 'root canal caries crown pulpitis small talk ' + 'x'.repeat(900);

  it('turns an offered tool with valid entities into an intent, listing what is missing', () => {
    expect(
      validateReply(
        tool('procedure__start', { procedure: 'root canal', confidence: 0.93 }),
        dentist,
        SAID
      )
    ).toEqual({
      outcome: 'intent',
      command: 'procedure.start',
      entities: { procedure: 'root canal' },
      confidence: 0.93,
      missing: [],
      dropped: [],
    });
    expect(
      validateReply(tool('finding__add', { finding: 'caries', confidence: 0.8 }), dentist, SAID)
    ).toMatchObject({
      outcome: 'intent',
      missing: ['tooth'],
    });
  });

  it('rejects a tool that is not in the registry', () => {
    expect(validateReply(tool('patient__delete', { confidence: 1 }), dentist, SAID)).toMatchObject({
      outcome: 'rejected',
      reason: expect.stringContaining('patient__delete'),
    });
  });

  it('rejects a registry command that was not offered to this clinician', () => {
    expect(
      validateReply(
        tool('diagnosis__record', { diagnosis: 'caries', confidence: 0.9 }),
        assistant,
        SAID
      )
    ).toMatchObject({
      outcome: 'rejected',
    });
    expect(
      validateReply(tool('clinic__update_settings', { confidence: 0.9 }), dentist, SAID)
    ).toMatchObject({
      outcome: 'rejected',
    });
  });

  it('rejects unknown fields, wrong types, out-of-range confidence and implausible values', () => {
    const cases: unknown[] = [
      { procedure: 'crown', confidence: 0.9, patientId: 'x' },
      { procedure: 16, confidence: 0.9 },
      { procedure: 'crown', confidence: 1.4 },
      { procedure: 'crown' },
      { procedure: '   ', confidence: 0.9 },
      { procedure: 'x'.repeat(301), confidence: 0.9 },
      'not an object',
      null,
    ];
    for (const input of cases) {
      expect(validateReply(tool('plan_item__add', input), dentist, SAID).outcome).toBe('rejected');
    }
  });

  it('allows a long dictated note, within limits', () => {
    expect(
      validateReply(tool('note__add', { body: 'x'.repeat(900), confidence: 0.9 }), dentist, SAID)
        .outcome
    ).toBe('intent');
    expect(
      validateReply(tool('note__add', { body: 'x'.repeat(1_001), confidence: 0.9 }), dentist, SAID)
        .outcome
    ).toBe('rejected');
  });

  it('treats no_command, plain text and refusals as no command', () => {
    expect(validateReply(tool(NO_COMMAND, { reason: 'small talk' }), dentist, SAID)).toEqual({
      outcome: 'none',
      reason: 'small talk',
    });
    expect(validateReply({ kind: 'text' }, dentist, SAID).outcome).toBe('none');
    expect(validateReply({ kind: 'refusal' }, dentist, SAID).outcome).toBe('none');
  });
});

describe('the user message', () => {
  it('describes the situation without names or ids, and fences the utterance', () => {
    const message = userMessage('add a crown afterward', {
      patientOpen: true,
      session: 'open',
      toothInFocus: '16',
      procedureInProgress: 'Root canal treatment, molar 16',
      pending: { command: 'plan_item.add', missing: ['tooth'] },
    });
    expect(message).toContain('Tooth in focus: 16');
    expect(message).toContain('missing tooth');
    expect(message).toMatch(/<utterance>\nadd a crown afterward\n<\/utterance>$/);
  });
});

describe('grounding: entities must be in what was said', () => {
  const tool = (name: string, input: unknown) => ({ kind: 'tool' as const, name, input });

  it('drops a tooth the model took from context, and asks for it instead', () => {
    // The case seen in the browser: tooth 16 in focus, "occlusal caries" said.
    expect(
      validateReply(
        tool('finding__add', {
          tooth: '16',
          finding: 'caries',
          surfaces: 'occlusal',
          confidence: 0.9,
        }),
        dentist,
        'occlusal caries'
      )
    ).toMatchObject({
      outcome: 'intent',
      entities: { finding: 'caries', surfaces: 'occlusal' },
      missing: ['tooth'],
      dropped: ['tooth'],
    });
  });

  it('keeps entities however the numbers and sites were written', () => {
    const said = 'Tooth sixteen mesio-buccal bleeding, three two four';
    expect(
      validateReply(
        tool('perio__record', {
          tooth: '16',
          readings: '3 2 4',
          bleeding: 'mesiobuccal',
          confidence: 0.9,
        }),
        dentist,
        said
      )
    ).toMatchObject({
      dropped: [],
      entities: { tooth: '16', readings: '3 2 4', bleeding: 'mesiobuccal' },
    });
    expect(
      validateReply(
        tool('finding__add', { tooth: 'one six', finding: 'caries', confidence: 0.9 }),
        dentist,
        'caries on 16'
      ).outcome
    ).toBe('intent');
  });

  it('accepts a classification chosen from a list, and a word with the same stem', () => {
    expect(
      validateReply(
        tool('history__add', {
          kind: 'allergy',
          name: 'penicillin',
          severity: 'severe',
          confidence: 0.9,
        }),
        dentist,
        'Patient is allergic to penicillin, severe'
      )
    ).toMatchObject({ dropped: [], missing: [] });
  });

  it('ignores filler words the model adds, but not invented ones', () => {
    const said = 'start root canal';
    expect(
      validateReply(
        tool('procedure__start', { procedure: 'the root canal', confidence: 0.9 }),
        dentist,
        said
      )
    ).toMatchObject({ dropped: [] });
    expect(
      validateReply(
        tool('procedure__start', { procedure: 'root canal molar', confidence: 0.9 }),
        dentist,
        said
      )
    ).toMatchObject({ dropped: ['procedure'], missing: ['procedure'] });
  });
});
