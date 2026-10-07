#!/usr/bin/env bash
# Synthesises every phrase in manifest.json with each listed macOS voice, as 16 kHz 16-bit mono
# WAV under audio/<voice>/<phrase>.wav. Synthetic speech stands in until real recordings exist
# (ADR 0005); noise is mixed in by the benchmark, not here. Audio is not committed.
set -euo pipefail
cd "$(dirname "$0")"
command -v say >/dev/null || { echo "This script needs macOS 'say'. Record the files instead." >&2; exit 1; }
node -e '
  const { voices, phrases } = require("./manifest.json");
  for (const v of voices) for (const p of phrases) console.log([v.id, v.say, p.id, p.text].join("\t"));
' | while IFS=$'\t' read -r voice say_voice id text; do
  mkdir -p "audio/$voice"
  say -v "$say_voice" -o "audio/$voice/$id.wav" --file-format=WAVE --data-format=LEI16@16000 "$text"
done
echo "wrote $(find audio -name '*.wav' | wc -l | tr -d ' ') files"
