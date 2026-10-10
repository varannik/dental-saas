import {
  COMMANDS,
  FINDINGS,
  fdiToUniversal,
  type CommandType,
  type ProposalField,
  type ResolvedProposal,
  type VoiceContext,
} from '@dental/contracts';
import type { PoolClient } from '../../../platform/db.js';
import { resolveProcedure, type CatalogProcedure } from '../catalog.js';
import { parseTooth, type ToothNotation } from '../tooth.js';
import { EN_DIAGNOSES, EN_FINDINGS, EN_SURFACES } from '../vocabulary.js';
import { parseReadings } from './perio.js';
import { parseSurfaces } from './surfaces.js';
import { allergySeverity, diagnosisCode, findingCode, historyKind } from './terms.js';

/**
 * Entity resolution (V5, spec section H, stage 5): an interpretation's entities, as spoken,
 * become the command's payload: tooth codes in the clinic's notation, surfaces, finding and
 * diagnosis codes, catalog procedures, planned items, depths. What the clinician did not say but
 * the screen makes clear (the session, the patient, the tooth in focus, the procedure in
 * progress) is filled in openly, marked as taken from context. The result is ready only when
 * nothing is missing or ambiguous and the payload passes the command's own schema.
 */

export interface ResolveInput {
  command: CommandType;
  entities: Record<string, string>;
  context: VoiceContext;
  notation: ToothNotation;
  /** A connection scoped to the clinic, for the catalog, plans and procedures. */
  client: PoolClient;
}

interface CatalogRow {
  code: string;
  name: string;
  aliases: string[];
  scope: 'tooth' | 'surfaces' | 'mouth';
}

/** Root canal treatments are named by tooth class; the tooth settles which one was meant. */
const TOOTH_CLASS: [RegExp, (position: number) => boolean][] = [
  [/\banterior\b/i, (position) => position <= 3],
  [/\bpremolar\b/i, (position) => position === 4 || position === 5],
  [/\bmolar\b/i, (position) => position >= 6],
];

class Builder {
  readonly payload: Record<string, unknown> = {};
  readonly fields: ProposalField[] = [];
  readonly missing: string[] = [];
  readonly problems: string[] = [];
  readonly alternatives: { key: string; options: string[] }[] = [];

  constructor(readonly input: ResolveInput) {}

  get entities() {
    return this.input.entities;
  }

  field(key: string, value: string, said?: string) {
    this.fields.push(
      said === undefined
        ? { key, value, resolvedFrom: 'context' }
        : { key, value, resolvedFrom: 'speech', said }
    );
  }

  /** How a tooth is shown to this clinic: its own notation, FDI otherwise. */
  showTooth(code: string) {
    return this.input.notation === 'Universal' ? String(fdiToUniversal(code) ?? code) : code;
  }

  session(): boolean {
    const id = this.input.context.sessionId;
    if (!id) {
      this.problems.push('No session is open.');
      return false;
    }
    this.payload.sessionId = id;
    return true;
  }

  patient(): boolean {
    const id = this.input.context.patientId;
    if (!id) {
      this.problems.push('No patient is open.');
      return false;
    }
    this.payload.patientId = id;
    return true;
  }

  /**
   * The tooth: as said, in the clinic's notation; otherwise the tooth in focus when allowed,
   * labelled as taken from context; otherwise missing when required.
   */
  tooth(options: { required: boolean; fromContext: boolean }): string | null {
    const said = this.entities.tooth;
    if (said) {
      const code = parseTooth(said, this.input.notation);
      if (!code) {
        this.problems.push(`"${said}" is not a tooth in ${this.input.notation} notation.`);
        return null;
      }
      this.payload.tooth = code;
      this.field('tooth', this.showTooth(code), said);
      return code;
    }
    const focus = this.input.context.tooth;
    if (options.fromContext && focus) {
      this.payload.tooth = focus;
      this.field('tooth', this.showTooth(focus));
      return focus;
    }
    if (options.required) this.missing.push('tooth');
    return null;
  }

  surfaces(tooth: string | null, required: boolean) {
    const said = this.entities.surfaces;
    if (!said) {
      if (required) this.missing.push('surfaces');
      return;
    }
    const parsed = parseSurfaces(said, tooth);
    if (!parsed) {
      this.problems.push(`"${said}" names no surface.`);
    } else if ('problem' in parsed) {
      this.problems.push(parsed.problem);
    } else {
      this.payload.surfaces = parsed.surfaces;
      this.field(
        'surfaces',
        parsed.surfaces.map((surface) => EN_SURFACES[surface][0]).join(', '),
        said
      );
    }
  }

  async catalog(): Promise<CatalogRow[]> {
    const { rows } = await this.input.client.query<CatalogRow>(
      'SELECT code, name, aliases, scope FROM catalog.procedure_types WHERE active'
    );
    return rows;
  }

  /**
   * The catalog procedures the words can mean, narrowed by the tooth's class when the words are
   * shared (such as "root canal"). Empty when nothing matches.
   */
  matchProcedures(said: string, rows: CatalogRow[], tooth: string | null): CatalogRow[] {
    const catalog: CatalogProcedure[] = rows.map((row) => ({
      id: row.code,
      name: row.name,
      aliases: row.aliases,
      requiresTooth: row.scope !== 'mouth',
    }));
    const found = resolveProcedure(said, catalog);
    if (found.status === 'unknown') return [];
    let candidates = [found.match.procedure, ...found.alternatives].map((procedure) =>
      rows.find((row) => row.code === procedure.id)!
    );
    if (candidates.length > 1 && tooth) {
      const position = Number(tooth[1]);
      const fitting = candidates.filter((row) =>
        TOOTH_CLASS.every(([pattern, fits]) => !pattern.test(row.name) || fits(position))
      );
      if (fitting.length) candidates = fitting;
    }
    return candidates;
  }

  async openPlan(): Promise<string | null> {
    const { rows } = await this.input.client.query<{ id: string }>(
      `SELECT id FROM clinical.treatment_plans
       WHERE patient_id = $1 AND status IN ('proposed', 'accepted')`,
      [this.input.context.patientId]
    );
    return rows[0]?.id ?? null;
  }

  async planItems(planId: string) {
    const { rows } = await this.input.client.query<{
      id: string;
      sequence: number;
      tooth: string | null;
      code: string;
      name: string;
      aliases: string[];
      status: string;
    }>(
      `SELECT i.id, i.sequence, i.tooth, i.status, t.code, t.name, t.aliases
       FROM clinical.treatment_plan_items AS i
       JOIN catalog.procedure_types AS t ON t.id = i.procedure_type_id
       WHERE i.plan_id = $1 AND i.status <> 'cancelled'
       ORDER BY i.sequence`,
      [planId]
    );
    return rows;
  }

  finish(): ResolvedProposal {
    const command = this.input.command;
    if (this.missing.length === 0 && this.problems.length === 0) {
      const parsed = COMMANDS[command].payload.safeParse(this.payload);
      if (!parsed.success) {
        this.problems.push(...parsed.error.issues.slice(0, 2).map((issue) => issue.message));
      }
    }
    return {
      command,
      payload: this.payload,
      fields: this.fields,
      missing: this.missing,
      problems: this.problems,
      alternatives: this.alternatives,
      ready:
        this.missing.length === 0 && this.problems.length === 0 && this.alternatives.length === 0,
    };
  }
}

const AFTERWARD = /^(afterwards?|after (that|it|this)|next|then|later)$/i;

type Resolver = (b: Builder) => Promise<void>;

const RESOLVERS: Partial<Record<CommandType, Resolver>> = {
  'session.start': async (b) => {
    if (!b.patient()) return;
    if (b.entities.chiefComplaint) {
      b.payload.chiefComplaint = b.entities.chiefComplaint;
      b.field('chiefComplaint', b.entities.chiefComplaint, b.entities.chiefComplaint);
    }
  },

  'session.complete': async (b) => {
    b.session();
  },

  'session.sign': async (b) => {
    b.session();
  },

  'finding.add': async (b) => {
    b.session();
    const tooth = b.tooth({ required: true, fromContext: true });
    const said = b.entities.finding;
    const code = said ? findingCode(said) : null;
    if (!said) b.missing.push('finding');
    else if (!code) b.problems.push(`"${said}" is not a finding I know.`);
    else {
      b.payload.code = code;
      b.field('code', EN_FINDINGS[code][0]!, said);
      const scope = FINDINGS[code].scope;
      if (scope === 'tooth' && b.entities.surfaces) {
        b.problems.push(
          `A ${code.replaceAll('_', ' ')} finding is for the whole tooth, not surfaces.`
        );
      } else if (scope !== 'tooth') {
        b.surfaces(tooth, scope === 'surface');
      }
    }
    if (b.entities.detail) {
      b.payload.value = b.entities.detail.slice(0, 50);
      b.field('value', b.entities.detail, b.entities.detail);
    }
  },

  'perio.record': async (b) => {
    b.session();
    const tooth = b.tooth({ required: true, fromContext: true });
    const said = b.entities.readings;
    if (!said) {
      b.missing.push('readings');
      return;
    }
    const parsed = parseReadings(said, b.entities.bleeding);
    if ('problem' in parsed) {
      b.problems.push(parsed.problem);
      return;
    }
    // The tooth belongs to each measurement, not to the command.
    delete b.payload.tooth;
    if (tooth) b.payload.measurements = parsed.readings.map((reading) => ({ tooth, ...reading }));
    b.field(
      'measurements',
      parsed.readings
        .map((r) => `${r.site} ${r.pocketDepth}${r.bleeding ? ' bleeding' : ''}`)
        .join(', '),
      said
    );
  },

  'note.add': async (b) => {
    b.session();
    const body = b.entities.body;
    if (!body) {
      b.missing.push('body');
      return;
    }
    b.payload.type = 'clinical';
    b.payload.body = body;
    b.field('body', body, body);
  },

  'diagnosis.record': async (b) => diagnosis(b),
  'diagnosis.suggest': async (b) => diagnosis(b),

  'history.add': async (b) => {
    b.patient();
    const kind = b.entities.kind ? historyKind(b.entities.kind) : null;
    if (!b.entities.kind) b.missing.push('kind');
    else if (!kind) b.problems.push(`"${b.entities.kind}" is not a kind of history entry.`);
    else {
      b.payload.kind = kind;
      b.field('kind', kind, b.entities.kind);
    }
    if (!b.entities.name) b.missing.push('name');
    else {
      b.payload.label = b.entities.name;
      b.field('label', b.entities.name, b.entities.name);
    }
    if (b.entities.severity) {
      const severity = allergySeverity(b.entities.severity);
      if (kind === 'allergy' && severity) {
        b.payload.severity = severity;
        b.field('severity', severity, b.entities.severity);
      }
    }
  },

  'plan_item.add': async (b) => {
    if (!b.patient()) return;
    delete b.payload.patientId;
    const planId = await b.openPlan();
    if (!planId) {
      b.problems.push('There is no open treatment plan; create one first.');
      return;
    }
    b.payload.planId = planId;
    const said = b.entities.procedure;
    if (!said) {
      b.missing.push('procedure');
      return;
    }
    const rows = await b.catalog();
    // A tooth said with the procedure settles a shared name ("root canal on 16").
    const spokenTooth = b.entities.tooth ? parseTooth(b.entities.tooth, b.input.notation) : null;
    let candidates = b.matchProcedures(said, rows, spokenTooth ?? null);
    if (candidates.length === 0) {
      b.problems.push(`"${said}" is not a procedure in the catalog.`);
      return;
    }
    const scopeNeedsTooth = candidates.every((row) => row.scope !== 'mouth');
    const tooth = scopeNeedsTooth ? b.tooth({ required: true, fromContext: true }) : null;
    if (candidates.length > 1 && tooth) candidates = b.matchProcedures(said, rows, tooth);
    if (candidates.length > 1) {
      b.alternatives.push({ key: 'procedureCode', options: candidates.map((row) => row.name) });
      b.problems.push(`"${said}" could be ${candidates.map((row) => row.name).join(' or ')}.`);
      return;
    }
    const procedure = candidates[0]!;
    b.payload.procedureCode = procedure.code;
    b.field('procedureCode', procedure.name, said);
    if (procedure.scope === 'surfaces') b.surfaces(tooth, true);

    const position = b.entities.position;
    if (position) {
      const items = (await b.planItems(planId)).filter((item) => item.status === 'planned');
      const text = position.trim();
      let after: (typeof items)[number] | undefined;
      if (AFTERWARD.test(text)) {
        // "Afterward": after the last item on the same tooth, or else after the last item.
        after = [...items].reverse().find((item) => tooth && item.tooth === tooth) ?? items.at(-1);
      } else {
        const match = /^(after|before)\s+(.+)$/i.exec(text);
        const target = match
          ? b
              .matchProcedures(
                match[2]!,
                items.map((item) => ({
                  code: item.id,
                  name: item.name,
                  aliases: item.aliases,
                  scope: 'tooth' as const,
                })),
                tooth
              )
              .map((row) => items.find((item) => item.id === row.code)!)
          : [];
        if (!match || target.length === 0) {
          b.problems.push(`"${text}" does not name an item in the plan.`);
          return;
        }
        const anchor = target.find((item) => !tooth || item.tooth === tooth) ?? target[0]!;
        if (match[1]!.toLowerCase() === 'after') after = anchor;
        else {
          const index = items.indexOf(anchor);
          if (index === 0) {
            b.problems.push('An item cannot be placed first yet; add it and reorder the plan.');
            return;
          }
          after = items[index - 1];
        }
      }
      if (after) {
        b.payload.afterItemId = after.id;
        b.field('afterItemId', `after ${after.sequence}. ${after.name}`, position);
      }
    }
  },

  'procedure.start': async (b) => {
    if (!b.session()) return;
    const said = b.entities.procedure;
    if (!said) {
      b.missing.push('procedure');
      return;
    }
    const rows = await b.catalog();
    const spokenTooth = b.entities.tooth ? parseTooth(b.entities.tooth, b.input.notation) : null;
    const toothForMatch = spokenTooth ?? b.input.context.tooth;
    const candidates = b.matchProcedures(said, rows, null);
    if (candidates.length === 0) {
      b.problems.push(`"${said}" is not a procedure in the catalog.`);
      return;
    }
    // A planned item comes first: "start the root canal" means the one in the plan.
    const planId = b.input.context.patientId ? await b.openPlan() : null;
    if (planId) {
      const codes = new Set(candidates.map((row) => row.code));
      const planned = (await b.planItems(planId)).filter(
        (item) =>
          item.status === 'planned' &&
          codes.has(item.code) &&
          (!toothForMatch || !item.tooth || item.tooth === toothForMatch)
      );
      if (planned.length === 1) {
        const item = planned[0]!;
        b.payload.planItemId = item.id;
        b.field(
          'planItemId',
          `${item.sequence}. ${item.name}${item.tooth ? ` ${b.showTooth(item.tooth)}` : ''} (planned)`,
          said
        );
        return;
      }
      if (planned.length > 1) {
        b.alternatives.push({
          key: 'planItemId',
          options: planned.map((item) => `${item.name}${item.tooth ? ` ${item.tooth}` : ''}`),
        });
        b.problems.push('More than one planned item matches; say which tooth.');
        return;
      }
    }
    const scopeNeedsTooth = candidates.every((row) => row.scope !== 'mouth');
    const tooth = scopeNeedsTooth ? b.tooth({ required: true, fromContext: true }) : null;
    const narrowed = b.matchProcedures(said, rows, tooth);
    if (narrowed.length > 1) {
      b.alternatives.push({ key: 'procedureCode', options: narrowed.map((row) => row.name) });
      b.problems.push(`"${said}" could be ${narrowed.map((row) => row.name).join(' or ')}.`);
      return;
    }
    const procedure = narrowed[0]!;
    b.payload.procedureCode = procedure.code;
    b.field('procedureCode', procedure.name, said);
    if (procedure.scope === 'surfaces') b.surfaces(tooth, true);
  },

  'procedure.complete': async (b) => finishing(b),
  'procedure.cancel': async (b) => {
    await finishing(b);
    if (b.entities.reason) {
      b.payload.reason = b.entities.reason;
      b.field('reason', b.entities.reason, b.entities.reason);
    }
  },
};

async function diagnosis(b: Builder) {
  b.session();
  const said = b.entities.diagnosis;
  if (!said) b.missing.push('diagnosis');
  else {
    const { code, label } = diagnosisCode(said);
    b.payload.code = code;
    if (label) b.payload.label = label;
    b.field('code', label ?? (code === 'other' ? said : EN_DIAGNOSES[code][0]!), said);
  }
  // A diagnosis can be for the whole mouth, so the tooth in focus is not assumed.
  b.tooth({ required: false, fromContext: false });
}

/** The procedure in progress: the one named, or the only one. */
async function finishing(b: Builder) {
  if (!b.session()) return;
  delete b.payload.sessionId;
  const { rows } = await b.input.client.query<{
    id: string;
    name: string;
    aliases: string[];
    tooth: string | null;
  }>(
    `SELECT p.id, t.name, t.aliases, p.tooth FROM clinical.procedures AS p
     JOIN catalog.procedure_types AS t ON t.id = p.procedure_type_id
     WHERE p.session_id = $1 AND p.status = 'in_progress' ORDER BY p.started_at`,
    [b.input.context.sessionId]
  );
  let candidates = rows;
  const said = b.entities.procedure;
  if (said && rows.length > 1) {
    const matched = b
      .matchProcedures(
        said,
        rows.map((row) => ({
          code: row.id,
          name: row.name,
          aliases: row.aliases,
          scope: 'tooth' as const,
        })),
        null
      )
      .map((row) => rows.find((candidate) => candidate.id === row.code)!);
    if (matched.length) candidates = matched;
  }
  if (candidates.length === 0) {
    b.problems.push('No procedure is in progress.');
    return;
  }
  if (candidates.length > 1) {
    b.alternatives.push({
      key: 'procedureId',
      options: candidates.map((row) => `${row.name} ${row.tooth ?? ''}`.trim()),
    });
    b.problems.push('More than one procedure is in progress; say which.');
    return;
  }
  const procedure = candidates[0]!;
  b.payload.procedureId = procedure.id;
  const name = `${procedure.name}${procedure.tooth ? ` ${b.showTooth(procedure.tooth)}` : ''}`;
  if (said) b.field('procedureId', name, said);
  else b.field('procedureId', name);
}

/** Resolves an interpretation into a proposal for its command. */
export async function resolveProposal(input: ResolveInput): Promise<ResolvedProposal> {
  const builder = new Builder(input);
  const resolver = RESOLVERS[input.command];
  if (!resolver) {
    builder.problems.push(`${input.command} cannot be given by voice yet.`);
    return builder.finish();
  }
  await resolver(builder);
  return builder.finish();
}
