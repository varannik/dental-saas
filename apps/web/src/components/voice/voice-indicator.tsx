'use client';

import { Mic } from 'lucide-react';

export function VoiceIndicator() {
  return (
    <div className="bg-muted/50 border-border flex items-center gap-3 rounded-lg border border-dashed p-4">
      <Mic className="text-muted-foreground size-8" aria-hidden />
      <div>
        <p className="text-sm font-medium">Voice capture</p>
        <p className="text-muted-foreground text-xs">
          Idle — streaming transcription and confirmation toasts will plug in here.
        </p>
      </div>
    </div>
  );
}
