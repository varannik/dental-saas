# ADR 0001: Voice providers and the 2-second target

- Status: Accepted, provisional. Revisit after the real-recording and browser runs listed under Open items.
- Date: 2026-10-04
- Work package: F7 voice spike (implementation plan, milestone F)

## Context

The specification sets a voice round trip, from end of speech to a proposed action on screen, of under 2 seconds at the 95th percentile (requirement N2). It calls this the least-proven number in the design, because speech-to-text and interpretation use external APIs from a CPU-only server. The implementation plan moved a spike to week 2 to decide the target and the providers before the voice layer is built.

The spike is described in [docs/spikes/voice-spike.md](../spikes/voice-spike.md). It streams 16 kHz audio to the speech provider while the clinician talks, then measures from the end of speech: final transcript, interpretation into one registered command (`procedure.add` or `no_command`), and resolution and validation in code.

## Method

- 13 phrases (`tests/voice/spike/manifest.json`): procedures with numeric, spoken and descriptive tooth references, a tooth taken from context, a missing tooth, an ambiguous procedure, and two non-commands.
- Audio generated with macOS text-to-speech, streamed at real-time pace, with 300 ms of trailing silence to stand in for the pause before releasing push-to-talk.
- Three runs per phrase (39 utterances) for the main configurations, two for the alternatives.
- Measured from a developer machine on a mobile network. The Deepgram handshake from this network takes about 1.8 s.
- Anthropic and OpenAI could not be measured directly: both accounts had valid keys but no credits. All interpretation results below go through the Run BiOS gateway's OpenAI-compatible API.

## Results

Full audio path, Deepgram `nova-3` then `openai/gpt-4.1-mini` through Run BiOS, 39 utterances, all correct:

| Stage                 | p50      | p95      | max      |
| --------------------- | -------- | -------- | -------- |
| Final transcript      | 494 ms   | 648 ms   | 671 ms   |
| Interpretation        | 1,051 ms | 1,294 ms | 1,307 ms |
| Resolve and validate  | 0.2 ms   | 1.4 ms   | 2.1 ms   |
| **Server total**      | **1,601 ms** | **1,835 ms** | 1,943 ms |

Interpretation only, from the manifest transcripts:

| Model through Run BiOS        | Accuracy | p50      | p95      | Verdict                         |
| ----------------------------- | -------- | -------- | -------- | ------------------------------- |
| `openai/gpt-4.1-mini`         | 100%     | 982 ms   | 1,710 ms | Chosen                          |
| `openai/gpt-4.1-nano`         | 80.8%    | 957 ms   | 1,390 ms | Rejected: misses descriptive teeth and scaling, barely faster |
| `anthropic/claude-sonnet-5-5` | 100%     | 1,680 ms | 3,662 ms | Rejected: too slow for the target |
| `deepseek/deepseek-v4-flash`  | 100%     | 1,917 ms | 5,141 ms | Rejected: too slow and erratic  |

### Findings that changed the code

1. **Idle connections cost a second handshake.** Node drops an idle HTTPS connection after about 4 seconds. Between utterances that is always the case, so each interpretation paid a new TLS handshake: interpretation p50 rose from about 1.0 s to 2.0 s, and the server total p95 to 3.96 s. Warming the interpreter connection when the clinician presses talk brought it back to the numbers above. The `Interpreter` interface now has an optional `warm()`.
2. **The speech handshake must not be in the path.** The Deepgram handshake (about 1.8 s here) outlasted the finalize timeout and showed as "Speech recognition failed". The server now keeps a connected Deepgram stream ready per client, with KeepAlive, and the finalize timeout starts only once Finalize is sent.
3. **Forced tool choice is not portable.** Run BiOS rejects `tool_choice: "required"` for newer Claude models. Both adapters now use `auto` with the prompt's one-tool instruction; a reply without a tool call becomes "no command". Accuracy with `gpt-4.1-mini` stayed at 100%.
4. **Recordings that stop at the last word lose it.** Without trailing audio Deepgram dropped "sixteen" from "tooth sixteen". A real push-to-talk release has a short pause; the benchmark adds 300 ms.

## Decision

- **Go** on the 2-second target, provisionally: the server-side p95 is 1.84 s with about 160 ms of headroom for the network and the browser.
- **Speech-to-text:** Deepgram `nova-3` streaming, with a warm standby stream and keyterm biasing.
- **Interpreter:** `gpt-4.1-mini`, a model that answers without a reasoning phase. Larger and reasoning models were accurate but too slow; the smaller model lost accuracy.
- **Route:** Run BiOS for now, because it is the only provider that could be measured. The interpreter registry keeps Anthropic and OpenAI direct as selectable alternatives.
- **SDKs:** the providers' official SDKs (`@anthropic-ai/sdk`, `openai`) behind the project's own `Interpreter` interface, instead of the Vercel AI SDK named in the implementation plan. The interface already gives provider independence, and both SDKs are permissively licensed.
- **Prompt and tools are shared** by every adapter (`modules/voice/interpreter-spec.ts`), so a provider comparison compares models.

## Consequences

- The voice gateway (V1 to V4) builds on the spike's adapters, the warm standby stream and the press-time warm-up.
- Headroom is small. Before the voice layer adds work after release, the first optimisation to try is starting interpretation on the stable partial transcript before release.
- Run BiOS becomes an external processor of clinician speech transcripts. Spec section L requires zero-retention agreements and a data-processing review for every external AI provider; Run BiOS documents neither retention nor hosting regions.

## Open items

1. **Real recordings.** At least 30 utterances from more than one clinician in surgery noise, ideally through a mask. Synthetic speech is clean and evenly paced, so these results are a best case.
2. **Browser round trip** from the clinic's network on the spike page, which adds the network and the last audio frame to the server total.
3. **Direct providers.** Add credits to the Anthropic and OpenAI accounts and run the same benchmarks direct, including `claude-haiku-4-5`, which Run BiOS does not offer, to measure what the gateway hop costs.
4. **Run BiOS data processing.** Ask contact@runbios.ai for retention, hosting region and processor terms. Without acceptable answers, production uses a direct provider.
5. **Repeat on the staging server** once F9 exists. Server-to-provider latency from the Ubuntu host will differ from a laptop on a mobile network.
