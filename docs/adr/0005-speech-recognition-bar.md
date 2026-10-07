# ADR 0005: Speech recognition bar and vocabulary biasing

- Status: Accepted, provisional. The bar is not met on the primary condition (see Results); on 2026-10-07 the product owner accepted the measured rates for now and closed V2. The same bar is applied again to real recordings (open item 1 of ADR 0001).
- Date: 2026-10-07
- Work package: V2 speech adapter (implementation plan, milestone V)

## Context

V2's acceptance check is "word error rate on a recorded dental phrase set meets the bar set in F7". F7 did not set one. The spike judged whether each command was interpreted correctly (13 of 13), not how accurately words were transcribed. The specification asks for "word error rate on dental terms and numbers" on recordings in clinic noise (section N), and names vocabulary biasing as the mitigation for the highest-rated risk: weak recognition of dental terms, numbers and names in noise.

This record sets the bar **before** the first measurement, so the bar is not chosen to fit the result.

## What is measured

- **Phrase set:** `tests/voice/corpus/en/manifest.json`, about 45 phrases written the way clinicians speak to the system. It covers findings with surfaces, perio readings, diagnoses, procedures in every catalog category, notation variants ("sixteen", "one six", "upper right first molar"), and navigation and notes.
- **Audio:** until real recordings exist, synthetic speech in three accents (US, UK and Indian English voices), mixed with synthetic surgery noise (broadband hiss, suction and a drill whine) at a 10 dB signal-to-noise ratio. The mix is generated in code with a fixed seed, so every run hears the same thing.
- **Normalisation** before scoring: case, punctuation and filler words are ignored; number words and digits compare equal, digit by digit, so "sixteen", "16" and "one six" all score as `1 6`; spelling variants such as "generalised" and "generalized", and "mesio-buccal" and "mesiobuccal", compare equal.
- **Word error rate (WER):** substitutions, deletions and insertions over reference words.
- **Critical-term error rate:** the share of critical reference words that were not transcribed correctly. Critical words are digits, surface and site names, and the words of catalog procedures, findings and diagnoses. A wrong critical word becomes a wrong field on the proposal card, so these count most.

## The bar

On the primary condition (noise at 10 dB SNR, with vocabulary biasing):

| Measure                    | Bar         |
| -------------------------- | ----------- |
| Critical-term error rate   | 5% or less  |
| Word error rate            | 10% or less |

In addition, biasing must not make critical terms worse than no biasing in the same noise.

These are set for the confirmation-card design: every field is shown, editable and confirmed before anything is written (section H), so recognition errors cost time, not record integrity. Under 5% critical errors means a correction on fewer than about one proposal in six, for a proposal with three critical words. That is tolerable while the corpus is synthetic, and to be tightened on real data.

## Vocabulary biasing

Deepgram `nova-3` keyterm prompting gets terms from the clinic's catalog (procedure names and spoken aliases), the finding and diagnosis names, the surface and site names, and perio words. Keyterms are capped to stay within the provider's prompt limit. They are built per clinic, so a clinic's own procedures are recognised too. Patient names in context (section H, stage 2) are added in V5, when the patient resolver exists.

## Results

Deepgram `nova-3`, 47 phrases in four synthetic voices (US, UK, Australian and Irish English), 188 utterances per condition, streamed in real time through the production adapter. Every result file is in `tests/voice/corpus/en/results/`.

**Final run** (`2026-10-07-nova-3-snr10.json`; no provider failures):

| Condition               | WER   | Critical-term error rate | Bar                         |
| ----------------------- | ----- | ------------------------ | --------------------------- |
| Noise 10 dB, biased     | 10.4% | 9.8%                     | **Not met** (10% and 5%)    |
| Noise 10 dB, not biased | 14.8% | 17.0%                    | Biasing helps: met          |
| Clean, biased           | 3.4%  | 2.4%                     | (would meet)                |

The same vocabulary at other noise levels (`-snr15`, `-snr20`):

| Noise, biased | WER  | Critical-term error rate |
| ------------- | ---- | ------------------------ |
| 15 dB         | 7.3% | 6.6%                     |
| 20 dB         | 6.4% | 4.5% (meets the bar)     |

`nova-3-medical` was worse in every condition (6.9% critical errors even on clean audio) and is not used.

### What changed on the way, and why

The bar above was written before the first run. Several things found during the runs were fixed. Each is a defect in the pipeline or the harness, not a change to the bar:

1. **The last words were lost after a burst of audio** (production defect). When audio reaches Deepgram faster than real time (buffered during a slow provider handshake, or resent after a network blip), a Finalize sent straight after it finalises before the end has been processed: "Mobility grade two on ~~thirty one~~". The adapter now holds Finalize until the audio has had time to play out. In a direct test, 12 of 12 phrases came back whole, against 9 of 12 without the hold.
2. **A broken synthetic voice.** The first run used macOS's Indian-English voice, `Aman`. Its audio is malformed ("Bitewing radiographs" lasts 0.2 s, against 1.5 s in other voices), so it measured the synthesiser, not recognition. It was replaced, and the benchmark now leaves out synthetic files with an implausible speaking rate and lists them. Indian-English speakers must be part of the real recordings.
3. **The drill always covered the first word.** The generated drill noise started at time zero in every file, so it masked the first word of every phrase. It now starts at a point seeded per file. This made the noise harder overall, not easier: run 1 (drill at the start, old vocabulary) gave 7.4% critical errors, and the old vocabulary under the new noise gives 11.3%.
4. **Provider failures were scored as silence.** On a flaky network, failed connections came back as empty transcripts and counted as errors. The benchmark now retries, then reports failed utterances separately instead of scoring them.
5. **Vocabulary.** The first list spent its 100 slots on everyday words ("sound", "watch", "pull", "post") and unspoken qualifiers ("Root canal treatment, molar"). The list now leaves everyday words out as keyterms (they are still scored), drops the qualifiers, and adds "tooth", after "tooth sixteen" was heard as "two sixteen". Against the same noise, critical errors went from 11.3% (old list) to 9.8% to 9.9% (new list, two runs).

### Where the errors are

At 10 dB the errors are mostly short phrases masked by the drill ("~~Veneer~~ on eleven", an empty transcript for "Bitewing radiographs"), "tooth" heard as "two", and near-homophones ("buckle" for "buccal", "Pale and polish" for "Scale and polish"). Clean audio errs on little but "Complete it" heard as "Completed".

### What this means

At 10 dB the bar is missed. The benchmark is pessimistic in one known way: in the browser, Chrome's noise suppression runs before audio is sent, and the benchmark adds noise after it. Whether real conditions are nearer 10 dB or 20 dB depends mostly on the microphone. A close headset microphone usually gives well over 20 dB in a surgery, and at 20 dB the bar is met.

Options, for the product owner to choose:

1. **Require a close-talking headset microphone** and accept the bar on the 20 dB evidence, confirming with real recordings.
2. **Keep the bar at 10 dB** and try further: server-side noise suppression before recognition, other providers (Anthropic and OpenAI could not be measured for lack of credit, ADR 0001), or a dental-specific language-model correction step.
3. **Record real audio first** (open item 1 of ADR 0001) and judge the bar on it, since synthetic speech and synthetic noise are both stand-ins.

**Decision (2026-10-07):** the product owner accepted the current rates for now and closed V2. The bar stays in place, and is judged again on real recordings when they exist.
