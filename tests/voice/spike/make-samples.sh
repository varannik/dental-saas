#!/usr/bin/env bash
# Generates synthetic WAV files for every sample in manifest.json with macOS text-to-speech.
# Synthetic speech is clean and evenly paced; it checks the pipeline and gives a latency floor.
# Real recordings in clinic conditions decide the go or no-go (see docs/spikes/voice-spike.md).
set -euo pipefail
cd "$(dirname "$0")"
command -v say >/dev/null || { echo "This script needs macOS 'say'. Record the files instead." >&2; exit 1; }
node -e '
  const { samples } = require("./manifest.json");
  for (const s of samples) if (s.file && s.transcript) console.log(s.file + "\t" + s.transcript);
' | while IFS=$'\t' read -r file text; do
  say -o "$file" --file-format=WAVE --data-format=LEI16@16000 "$text"
  echo "wrote $file"
done
