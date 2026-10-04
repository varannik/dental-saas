# Voice spike (F7)

The spike answers one question before the voice layer is built: can a spoken command become a proposal on screen in under 2 seconds at the 95th percentile, using external speech and LLM APIs from a CPU-only server? It also confirms the provider choice. The result is recorded in [ADR 0001](../adr/0001-voice-providers-and-latency.md).

The code is deliberately narrow: one intent (`procedure.add`), a fixed seven-item catalog, no authentication, nothing saved. The reusable parts live in `apps/api/src/modules/voice` (tooth parser, catalog resolver, proposal builder, provider adapters). The throwaway parts live in `apps/api/src/spikes/voice` and `apps/web/src/app/spike/voice`.

## What is measured

The clock starts when the clinician releases push-to-talk, which is the end of speech, and stops when the proposal is ready.

| Stage                 | Measured where | What it covers                                                              |
| --------------------- | -------------- | --------------------------------------------------------------------------- |
| Final transcript      | Server         | Deepgram `Finalize` to the finalised transcript                             |
| Interpretation        | Server         | One Claude Messages API call with two tools, `procedure_add` and `no_command` |
| Resolve and validate  | Server         | Procedure alias match, tooth parsing in FDI, risk tier, proposal            |
| Server total          | Server         | The three stages above                                                      |
| Release to proposal   | Browser        | The whole round trip, including network and the last audio frame            |
| Network and browser   | Derived        | Release to proposal minus server total                                      |

Audio streams while the clinician talks, so recognition overlaps speech. Only the work after release counts towards the target.

## Providers

| Role           | Providers                                   | Settings                                                   |
| -------------- | ------------------------------------------- | ---------------------------------------------------------- |
| Speech-to-text | Deepgram `nova-3`                           | `DEEPGRAM_API_KEY`, `DEEPGRAM_MODEL`                       |
| Interpreter    | Anthropic Claude (default `claude-haiku-4-5`) | `ANTHROPIC_API_KEY`, `VOICE_LLM_MODEL`                     |
| Interpreter    | OpenAI (default `gpt-4.1-mini`)             | `OPENAI_API_KEY`, `OPENAI_MODEL`                           |
| Interpreter    | Run BiOS gateway (default `openai/gpt-4.1-mini`) | `RUNBIOS_API_KEY`, `RUNBIOS_MODEL`, `RUNBIOS_BASE_URL` |

Every interpreter with a key is registered at start-up, and the spike page lets you pick one per utterance under Settings. `VOICE_INTERPRETER` (`anthropic` or `openai`) is the default when the client does not choose; its key is required. Both interpreters send the same prompt and tool definitions (`modules/voice/interpreter-spec.ts`) and go through the same validation, so a comparison measures the model, not the prompt.

Run BiOS is a gateway to many providers' models. The spike calls it through its OpenAI-compatible API with any model from its catalog (`https://api.runbios.ai/v1/models`), for example `anthropic/claude-sonnet-5-5` or `deepseek/deepseek-v4-flash`. Running the same model directly and through Run BiOS shows what the extra hop costs in latency. Run BiOS does not document data retention or hosting regions; review that before any real patient speech goes through it (spec section L).

The OpenAI default is a model that does not reason before answering, chosen for latency. A reasoning model such as `gpt-5.4-mini` can be set with `OPENAI_MODEL`; the adapter leaves room for its reasoning tokens.

Adding a provider means one adapter implementing `Interpreter` and one entry in `modules/voice/interpreters.ts`. Both adapters use the providers' official SDKs rather than the Vercel AI SDK named in the implementation plan; the shared interface already gives provider independence. Record that choice in the ADR.

## Running it

1. Copy `.env.example` to `.env` at the repository root (or `apps/api/.env`, which wins) and set `VOICE_SPIKE_ENABLED=true`, `DEEPGRAM_API_KEY`, and the key of each interpreter you want to compare. The API refuses to start with the spike on and the Deepgram key or the default interpreter's key missing, and refuses the spike in production.
2. Start the API and the web app in two terminals:

   ```bash
   pnpm --filter @dental/api dev
   pnpm --filter @dental/web dev
   ```

3. Open http://localhost:3000/spike/voice in Chrome or Firefox. Hold the button or the space bar, say a command such as "add a root canal on tooth sixteen", and let go. Pick the interpreter under Settings; the choice is remembered in this browser. The page shows the transcript, the proposal card with the interpreter used, and the timings. It keeps p50 and p95 across attempts, and a table by interpreter compares interpretation and round-trip times. "Copy results as JSON" exports them for the ADR.

The page talks to `NEXT_PUBLIC_API_URL`, which defaults to `http://localhost:4000`.

## Benchmark from recordings

The benchmark streams WAV files to Deepgram at real-time pace, then runs the same pipeline as the WebSocket route, so results are repeatable.

```bash
# Synthetic samples from macOS text-to-speech: checks the pipeline and gives a latency floor.
tests/voice/spike/make-samples.sh

# Interpreter only, from the transcripts in the manifest; run once per provider to compare.
pnpm --filter @dental/api voice:bench --dir ../../tests/voice/spike --text --runs 5 --interpreter anthropic
pnpm --filter @dental/api voice:bench --dir ../../tests/voice/spike --text --runs 5 --interpreter openai
pnpm --filter @dental/api voice:bench --dir ../../tests/voice/spike --text --runs 5 --interpreter runbios

# Full audio path.
pnpm --filter @dental/api voice:bench --dir ../../tests/voice/spike --runs 5
```

Each run prints per-utterance timings, p50, p95 and max per stage, and accuracy against the expected command in `manifest.json`. It writes a JSON results file next to the manifest. Recordings and results are not committed.

Files must be 16-bit PCM, mono, 16 kHz. Convert other recordings with `ffmpeg -i in.wav -ac 1 -ar 16000 -sample_fmt s16 out.wav`. To add a sample, add an entry to `manifest.json` with its file, transcript, optional `context.activeTooth` and expected command.

## Deciding go or no-go

Synthetic speech is clean, so it shows only the best case. The decision needs:

- **Real recordings**: at least 30 utterances from more than one clinician, recorded in a surgery with suction or handpiece noise and, ideally, through a mask. The manifest's phrases are a starting set; add the names and numbers clinicians actually say.
- **Browser runs** from the clinic's network to the API host, because network time is part of the target.
- **Several runs** per sample. Twenty samples give a rough p95 at best; treat it as a direction, not a guarantee.

Record in the ADR: p50 and p95 for each stage and for release to proposal, transcript errors on tooth numbers and procedure names, interpretation accuracy, the provider and model versions, and the decision.

If the target is missed, the levers in order of expected gain are: start interpretation on the stable partial transcript before release; prompt caching once the tool list and catalog are long enough to pass the cache minimum; a provider region closer to the server; and a different speech model.
