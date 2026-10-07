# ADR 0004: Voice transport

- Status: Accepted
- Date: 2026-10-07
- Work package: V1 audio transport (implementation plan, milestone V)

## Context

The specification (sections H and L) describes one WebSocket per clinician: `AudioWorklet` capture at 16 kHz mono, voice-activity detection in the browser, Opus frames to the API, push-to-talk by default, and a single-use ticket from `POST /v1/voice/tickets` with a 30-second lifetime. V1's acceptance check: the stream survives a network blip, and an unauthenticated socket is refused.

## Decision

1. **Tickets** are 32 random bytes prefixed with the clinic id, stored as a SHA-256 hash in `voice.stream_tickets` under row-level security. They are marked used in the same statement that checks them, so one ticket opens one socket. The clinic id lets the socket find the ticket before any user is known, without a `SECURITY DEFINER` function. A ticket remembers when the access token that requested it expires, and the stream closes then (close code 4001), so a socket never outlives the sign-in behind it.
2. **The ticket travels as a WebSocket subprotocol** (`dental.voice.v1` plus `ticket.<value>`), not in the URL. A browser cannot set headers on a WebSocket, and a query string ends up in access logs and proxies. The server answers with `dental.voice.v1` only. Ticket, origin and subprotocol are checked before the upgrade, so a refused socket gets an HTTP 401 or 403 and never opens.
3. **Surviving a blip.** After `hello`, everything the client sends carries a sequence number, audio frames and control messages alike. The server applies each number once and in order, and acknowledges what it holds. A stream outlives its socket by a 30-second grace period. The client keeps everything not yet acknowledged, reconnects with a fresh ticket and `hello { streamId }`, and resends from the `nextSeq` the server reports. Nothing is lost or doubled. If the grace period has passed, the client is told it has a new stream, and reports the utterance in flight as lost. The client also treats a connection that has not acknowledged anything for 3 seconds as dead, because a browser can take much longer to notice a dropped connection.
4. **PCM16 instead of Opus, for now.** Frames are 20 ms of 16 kHz PCM16 (640 bytes, 32 kB/s), as in the spike. Opus would need the WebCodecs encoder, which not every target browser has, and its raw packets would have to be wrapped before Deepgram accepts them. At 32 kB/s, a clinic network has room. The frame header carries a type byte, so Opus can be added as a second frame type without breaking the protocol.
5. **An energy detector instead of Silero, for now.** Push-to-talk is the default, so voice-activity detection only has to drop silence between words. A detector with an adaptive noise floor, pre-roll and hangover does that in a few dozen lines with no model download. Silero (ONNX Runtime Web, about 2 MB plus WebAssembly) becomes worth its weight with hands-free mode and a wake phrase. The `VoiceActivityDetector` interface is what it will implement.
6. **Streams live in the API process.** Running several API processes will need sticky routing by stream id, or the stream state moved to Valkey (V3 adds the context store there).

## Consequences

- `apps/api/src/modules/voice/stream` holds the tickets, the stream registry and the routes. Speech-to-text attaches as a `StreamSink` in V2.
- The browser keeps one stream per tab across page changes (`VoiceProvider`). The microphone opens on the first push-to-talk and stays open until turned off, so later presses lose no speech to start-up.
- Up to 30 seconds of speech waits for the connection. Anything beyond that is dropped and the clinician is told to repeat it.
- Used and expired tickets accumulate in `voice.stream_tickets`. A retention job will remove them with the other retention work (milestone H).
