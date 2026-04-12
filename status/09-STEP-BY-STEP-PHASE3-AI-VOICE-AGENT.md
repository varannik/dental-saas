# Step-by-Step: Phase 3 — AI Voice Agent (Core Product)

**Goal:** Dentist can speak commands chairside and the system understands, confirms, and executes them.

**Time Estimate:** 6 weeks (Weeks 9-14)

---

## Week 9: Voice Infrastructure

### Step 1: Create Voice Agent Service

```bash
mkdir -p services/voice-agent/src/{routes,services,workflows,tools,schemas,__tests__}
cd services/voice-agent && pnpm init
```

```json
{
  "name": "@dental/voice-agent",
  "dependencies": {
    "@dental/config": "workspace:*",
    "@dental/types": "workspace:*",
    "fastify": "^5.0.0",
    "@fastify/websocket": "^11.0.0",
    "@deepgram/sdk": "^3.0.0",
    "@langchain/langgraph": "^0.2.0",
    "@langchain/openai": "^0.4.0",
    "ioredis": "^5.4.0",
    "drizzle-orm": "^0.36.0",
    "pg": "^8.13.0"
  }
}
```

### Step 2: WebSocket Voice Streaming Server

```typescript
// services/voice-agent/src/routes/voice-stream.ts

import { FastifyInstance } from 'fastify';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';

export async function voiceStreamRoute(app: FastifyInstance) {
  app.get('/voice/stream', { websocket: true }, (socket, req) => {
    const userId = req.user.id; // From JWT
    const tenantId = req.user.tenantId;
    const patientId = req.query.patientId;
    const encounterId = req.query.encounterId;

    // 1. Create voice session in DB
    const session = await createVoiceSession({
      tenantId,
      userId,
      patientId,
      encounterId,
      channel: 'BROWSER',
    });

    // 2. Connect to Deepgram streaming ASR
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
    const dgConnection = deepgram.listen.live({
      model: 'nova-3',
      language: 'en-US',
      smart_format: true,
      punctuate: true,
      interim_results: true,
      utterance_end_ms: 1500,
      keywords: [
        'tooth:5',
        'caries:5',
        'composite:3',
        'crown:3',
        'extraction:3',
        'prophylaxis:3',
        'periapical:3',
      ],
    });

    // 3. Handle transcription results
    dgConnection.on(LiveTranscriptionEvents.Transcript, async (data) => {
      const transcript = data.channel.alternatives[0].transcript;
      if (!transcript) return;

      if (data.is_final) {
        // Final transcript — save to DB and process
        const utterance = await saveUtterance({
          sessionId: session.id,
          speaker: 'USER',
          transcript,
          isFinal: true,
        });

        // Send to intent processing
        await processUtterance(utterance, session);

        // Send final transcript to client
        socket.send(
          JSON.stringify({
            type: 'transcript_final',
            text: transcript,
            utteranceId: utterance.id,
          })
        );
      } else {
        // Partial transcript — send to client for real-time display
        socket.send(
          JSON.stringify({
            type: 'transcript_partial',
            text: transcript,
          })
        );
      }
    });

    // 4. Receive audio from client and forward to Deepgram
    socket.on('message', (data) => {
      if (data instanceof Buffer) {
        dgConnection.send(data);
      } else {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'end_session') {
          dgConnection.finish();
        }
      }
    });

    // 5. Cleanup on disconnect
    socket.on('close', async () => {
      dgConnection.finish();
      await endVoiceSession(session.id);
    });
  });
}
```

### Step 3: Client-Side Audio Capture

```typescript
// apps/web/src/hooks/use-voice-stream.ts

export function useVoiceStream(patientId: string, encounterId: string) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [partialTranscript, setPartialTranscript] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);

  const startListening = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    const ws = new WebSocket(
      `ws://localhost:4004/voice/stream?patientId=${patientId}&encounterId=${encounterId}`
    );
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'transcript_partial':
          setPartialTranscript(msg.text);
          break;
        case 'transcript_final':
          setTranscript((prev) => prev + ' ' + msg.text);
          setPartialTranscript('');
          break;
        case 'confirmation_required':
          // Show confirmation card
          break;
        case 'action_completed':
          // Show success toast
          break;
      }
    };

    ws.onopen = () => {
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      recorder.ondataavailable = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(e.data);
        }
      };
      recorder.start(100); // Send audio every 100ms
      mediaRef.current = recorder;
      setIsListening(true);
    };
  };

  const stopListening = () => {
    mediaRef.current?.stop();
    wsRef.current?.send(JSON.stringify({ type: 'end_session' }));
    wsRef.current?.close();
    setIsListening(false);
  };

  return { isListening, transcript, partialTranscript, startListening, stopListening };
}
```

### Step 4: Voice UI Components

```
apps/web/src/components/voice/
├── voice-button.tsx          # Mic button (press to talk / always on)
├── voice-waveform.tsx        # Audio waveform visualization
├── transcript-display.tsx    # Real-time transcript showing
├── voice-status-bar.tsx      # "Listening..." / "Processing..." indicator
└── voice-panel.tsx           # Combined voice control panel
```

**Voice Button:** Large, circular, color-coded:

- Gray: Idle (tap to start)
- Blue pulsing: Listening
- Yellow: Processing
- Green: Action completed

### Step 5: Verify Real-Time Transcription

```
1. Start voice agent service: cd services/voice-agent && pnpm dev
2. Open web app encounter page
3. Click mic button
4. Speak: "The patient has caries on tooth number three"
5. See real-time partial transcripts appear
6. See final transcript saved
7. Check voice_utterances table has the entry
```

---

## Week 10: Intent & Entity Extraction

### Step 1: Define Dental Intent Taxonomy

```typescript
// services/voice-agent/src/intents.ts

export const DENTAL_INTENTS = {
  // Charting
  CHART_UPDATE: 'chart_update', // "Mark tooth 14 as missing"
  CHART_ADD_FINDING: 'chart_add_finding', // "Caries on tooth 3 MO"

  // Notes
  CREATE_NOTE: 'create_note', // "Create a note for this visit"
  DICTATE_NOTE: 'dictate_note', // "Patient presents with..."

  // Treatment
  CREATE_TREATMENT_PLAN: 'create_treatment_plan',
  ADD_TREATMENT_ITEM: 'add_treatment_item',

  // Scheduling
  SCHEDULE_APPOINTMENT: 'schedule_appointment',
  CANCEL_APPOINTMENT: 'cancel_appointment',

  // Imaging
  ORDER_IMAGING: 'order_imaging', // "Order a panoramic X-ray"

  // Navigation
  OPEN_PATIENT: 'open_patient', // "Open John Doe's chart"
  SHOW_DASHBOARD: 'show_dashboard',

  // System
  UNDO_ACTION: 'undo_action', // "Undo" / "Undo last action"
  CONFIRM_ACTION: 'confirm_action', // "Confirm" / "Yes"
  CANCEL_ACTION: 'cancel_action', // "Cancel" / "No"

  // Query
  GET_PATIENT_INFO: 'get_patient_info', // "What allergies does this patient have?"
} as const;
```

### Step 2: LLM-Based Intent Parser

```typescript
// services/voice-agent/src/services/intent-parser.ts

import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

const intentSchema = z.object({
  intent: z.string(),
  confidence: z.number().min(0).max(1),
  entities: z.object({
    toothNumber: z.string().optional(),
    surface: z.string().optional(),
    condition: z.string().optional(),
    cdtCode: z.string().optional(),
    patientName: z.string().optional(),
    procedureName: z.string().optional(),
    date: z.string().optional(),
    noteContent: z.string().optional(),
  }),
  requiresConfirmation: z.boolean(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
});

const llm = new ChatOpenAI({
  model: 'gpt-4.1-mini',
  temperature: 0,
});

export async function parseIntent(
  transcript: string,
  context: { patientId?: string; encounterId?: string }
) {
  const response = await llm.invoke([
    {
      role: 'system',
      content: `You are a dental voice command parser. Extract the intent and entities from the dentist's spoken command.

Available intents: ${Object.values(DENTAL_INTENTS).join(', ')}

Risk levels:
- low: queries, navigation
- medium: creating notes, scheduling
- high: charting changes, treatment plans
- critical: extractions, irreversible changes

Return structured JSON matching the schema.`,
    },
    {
      role: 'user',
      content: `Transcript: "${transcript}"\nPatient context: ${JSON.stringify(context)}`,
    },
  ]);

  return intentSchema.parse(JSON.parse(response.content));
}
```

### Step 3: Dental Entity Normalizer

```typescript
// services/voice-agent/src/services/entity-normalizer.ts

export function normalizeToothNumber(raw: string): string | null {
  // Handle spoken forms: "fourteen" → "14", "upper right second molar" → "2"
  const numberMap: Record<string, string> = {
    one: '1',
    two: '2',
    three: '3' /* ... etc ... */,
    fourteen: '14',
    'twenty-eight': '28',
  };

  // Handle FDI notation: "tooth 11" (FDI) → "8" (Universal)
  // Handle quadrant notation: "upper right first molar" → "3"

  return normalized;
}

export function normalizeSurface(raw: string): string | null {
  const surfaceMap: Record<string, string> = {
    mesial: 'M',
    occlusal: 'O',
    distal: 'D',
    buccal: 'B',
    lingual: 'L',
    facial: 'F',
    incisal: 'I',
  };
  // Handle compound: "mesial-occlusal" → "MO"
  return normalized;
}
```

### Step 4: Connect Intent Parser to Voice Pipeline

```typescript
// In voice-stream.ts, after saving final utterance:

async function processUtterance(utterance: VoiceUtterance, session: VoiceSession) {
  const parsed = await parseIntent(utterance.transcript, {
    patientId: session.patientId,
    encounterId: session.encounterId,
  });

  // Update utterance with intent and entities
  await updateUtterance(utterance.id, {
    intent: parsed.intent,
    entities: parsed.entities,
  });

  // Route to appropriate workflow
  if (parsed.confidence < 0.7) {
    // Low confidence — ask for clarification
    socket.send(
      JSON.stringify({
        type: 'clarification_needed',
        message: `I heard "${utterance.transcript}". Did you mean to ${parsed.intent}?`,
      })
    );
  } else {
    // Trigger workflow execution
    await triggerWorkflow(parsed, session);
  }
}
```

---

## Week 11: LangGraph Workflow Engine

### Step 1: Define Core Workflow

```typescript
// services/voice-agent/src/workflows/chart-update.workflow.ts

import { StateGraph, END } from '@langchain/langgraph';

interface ChartUpdateState {
  sessionId: string;
  patientId: string;
  utterance: string;
  intent: ParsedIntent;
  patientContext: any;
  confirmationRequired: boolean;
  confirmed: boolean;
  result: any;
  error: string | null;
}

const workflow = new StateGraph<ChartUpdateState>({
  channels: {
    sessionId: null,
    patientId: null,
    utterance: null,
    intent: null,
    patientContext: null,
    confirmationRequired: null,
    confirmed: null,
    result: null,
    error: null,
  },
});

// Node 1: Retrieve patient context
workflow.addNode('retrieve_context', async (state) => {
  const history = await getPatientHistory(state.patientId);
  return { ...state, patientContext: history };
});

// Node 2: Validate the action
workflow.addNode('validate_action', async (state) => {
  const isValid = validateChartUpdate(state.intent.entities);
  if (!isValid) return { ...state, error: 'Invalid chart update parameters' };

  const riskLevel = assessRisk(state.intent);
  return {
    ...state,
    confirmationRequired: riskLevel !== 'low',
  };
});

// Node 3: Request confirmation
workflow.addNode('request_confirmation', async (state) => {
  // Send confirmation card to client via WebSocket
  await sendConfirmationRequest(state.sessionId, {
    action: `Update dental chart: tooth ${state.intent.entities.toothNumber}`,
    details: state.intent.entities,
    riskLevel: state.intent.riskLevel,
  });

  // Create approval request in DB
  await createApprovalRequest(state);

  // Wait for confirmation (checkpoint-based)
  return { ...state, confirmed: false }; // Will be resumed after approval
});

// Node 4: Execute the chart update
workflow.addNode('execute_action', async (state) => {
  const result = await updateDentalChart({
    patientId: state.patientId,
    toothNumber: state.intent.entities.toothNumber,
    surface: state.intent.entities.surface,
    condition: state.intent.entities.condition,
  });

  // Record in action_history for undo
  await recordActionHistory({
    entityType: 'DENTAL_CHART',
    entityId: result.entryId,
    actionType: 'CREATE',
    newState: result,
    userId: state.intent.userId,
  });

  return { ...state, result };
});

// Define edges
workflow.addEdge('retrieve_context', 'validate_action');
workflow.addConditionalEdges('validate_action', (state) => {
  if (state.error) return END;
  if (state.confirmationRequired) return 'request_confirmation';
  return 'execute_action';
});
workflow.addEdge('request_confirmation', 'execute_action'); // After confirmation
workflow.addEdge('execute_action', END);

workflow.setEntryPoint('retrieve_context');

export const chartUpdateWorkflow = workflow.compile({
  checkpointer: redisCheckpointer, // For pause/resume
});
```

### Step 2: Tool Registry

```typescript
// services/voice-agent/src/tools/registry.ts

import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const getPatientHistoryTool = tool(
  async ({ patientId }) => {
    const history = await db.query.patients.findFirst({
      where: eq(patients.id, patientId),
      with: { encounters: { limit: 5 }, chartEntries: true },
    });
    return JSON.stringify(history);
  },
  {
    name: 'get_patient_history',
    description: 'Retrieve patient medical/dental history',
    schema: z.object({ patientId: z.string().uuid() }),
  }
);

export const updateDentalChartTool = tool(
  async ({ patientId, toothNumber, surface, condition, cdtCode }) => {
    const entry = await db
      .insert(dentalChartEntries)
      .values({
        patientId,
        toothNumber,
        surface,
        condition,
        cdtCode,
      })
      .returning();
    return JSON.stringify(entry);
  },
  {
    name: 'update_dental_chart',
    description: 'Update dental chart entry for a specific tooth',
    schema: z.object({
      patientId: z.string().uuid(),
      toothNumber: z.string(),
      surface: z.string().optional(),
      condition: z.string(),
      cdtCode: z.string().optional(),
    }),
  }
);

export const createClinicalNoteTool = tool(/* ... */);
export const scheduleAppointmentTool = tool(/* ... */);

// Register all tools in agent_tools table on service startup
export const ALL_TOOLS = [
  getPatientHistoryTool,
  updateDentalChartTool,
  createClinicalNoteTool,
  scheduleAppointmentTool,
];
```

### Step 3: Persist Workflow State

Every workflow execution maps to your schema:

```
agent_workflows → Workflow definition (graph_definition JSON)
agent_executions → Runtime instance (state_snapshot, current_node)
agent_steps → Each node execution (LLM calls, tool calls)
tool_executions → Individual tool invocations
agent_metrics → Performance data
```

---

## Week 12: Voice Confirmation & HITL

### Step 1: Confirmation UI Components

```
apps/web/src/components/voice/
├── confirmation-card.tsx      # Base confirmation card
├── quick-confirm.tsx          # Tier 1: Simple action, one-tap approve
├── standard-confirm.tsx       # Tier 2: Shows details, confirm/cancel
├── critical-confirm.tsx       # Tier 3: Checkbox + details + confirm
└── confirmation-queue.tsx     # Stack of pending confirmations
```

**Quick Confirm (Tier 1):**

```
┌─────────────────────────────────────────┐
│ 🔵 Chart Update                        │
│ "Mark tooth #3 as caries (MO surface)" │
│                                         │
│  [Cancel]  [✓ Confirm]                  │
└─────────────────────────────────────────┘
```

**Critical Confirm (Tier 3):**

```
┌─────────────────────────────────────────┐
│ ⚠️ Critical Action                     │
│ "Mark tooth #28 as EXTRACTED"           │
│                                         │
│ Patient: John Doe (ID: #12345)          │
│ Current: Present, healthy               │
│ Change to: Extracted                    │
│ Reason: Non-restorable caries           │
│                                         │
│ ☐ I confirm this is correct             │
│                                         │
│  [Cancel]  [Confirm Extraction]         │
└─────────────────────────────────────────┘
```

### Step 2: Voice-Based Confirmation

```typescript
// Allow dentist to confirm by voice:
// "Confirm" / "Yes" / "Approve" → triggers confirmation
// "Cancel" / "No" / "Stop" → cancels the action

// In intent parser, prioritize confirmation intents when
// there's a pending approval
```

### Step 3: Approval Request API

```
GET  /approvals/pending           # My pending approvals
POST /approvals/:id/approve       # Approve action
POST /approvals/:id/reject        # Reject action
POST /approvals/:id/escalate      # Escalate to supervisor
```

---

## Week 13: Undo & Safety

### Step 1: Action History Recording

Every mutation triggered by voice/agent records to `action_history`:

```typescript
async function recordActionHistory(params: {
  tenantId: string;
  userId: string;
  voiceSessionId?: string;
  entityType: string;
  entityId: string;
  actionType: 'CREATE' | 'UPDATE' | 'DELETE';
  previousState: any;
  newState: any;
  changeSummary: string;
}) {
  await db.insert(actionHistory).values({
    ...params,
    undoExpiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
  });
}
```

### Step 2: Undo Mechanism

```typescript
async function undoLastAction(userId: string, tenantId: string) {
  const lastAction = await db.query.actionHistory.findFirst({
    where: and(
      eq(actionHistory.userId, userId),
      eq(actionHistory.tenantId, tenantId),
      eq(actionHistory.isUndone, false),
      gt(actionHistory.undoExpiresAt, new Date())
    ),
    orderBy: [desc(actionHistory.createdAt)],
  });

  if (!lastAction) throw new Error('No undoable action found');

  // Restore previous state
  switch (lastAction.actionType) {
    case 'CREATE':
      await deleteEntity(lastAction.entityType, lastAction.entityId);
      break;
    case 'UPDATE':
      await restoreEntity(lastAction.entityType, lastAction.entityId, lastAction.previousState);
      break;
    case 'DELETE':
      await recreateEntity(lastAction.entityType, lastAction.previousState);
      break;
  }

  // Mark as undone
  await db
    .update(actionHistory)
    .set({ isUndone: true, undoneAt: new Date(), undoneByUserId: userId })
    .where(eq(actionHistory.id, lastAction.id));

  return lastAction;
}
```

### Step 3: Undo Toast UI

```typescript
// apps/web/src/components/voice/undo-toast.tsx

export function UndoToast({ action, expiresAt }: UndoToastProps) {
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft(expiresAt));

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = calculateTimeLeft(expiresAt);
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white p-4 rounded-lg shadow-xl">
      <div className="flex items-center gap-3">
        <span>{action.changeSummary}</span>
        <span className="text-gray-400">{formatTime(timeLeft)}</span>
        <button onClick={handleUndo} className="bg-blue-500 px-3 py-1 rounded">
          Undo
        </button>
      </div>
    </div>
  );
}
```

### Step 4: Background Cleanup Job

```typescript
// Runs every minute to clean up expired undo windows
async function cleanupExpiredActions() {
  await db
    .delete(actionHistory)
    .where(and(eq(actionHistory.isUndone, false), lt(actionHistory.undoExpiresAt, new Date())));
}
```

---

## Week 14: Voice Agent Polish

### Step 1: TTS for Agent Responses

```typescript
// When agent responds, generate speech and stream back
async function speakResponse(text: string, ws: WebSocket) {
  const audioStream = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'nova',
    input: text,
    response_format: 'opus',
  });

  // Stream audio chunks to client
  for await (const chunk of audioStream.body) {
    ws.send(chunk);
  }
}
```

### Step 2: Ambient Listening Mode

```
- Always-on mic with VAD (Silero)
- Only streams audio when speech detected
- Wake word optional: "Hey dental" or just starts on speech
- Visual indicator: subtle pulse when listening
- Clear indicator: waveform when speech detected
```

### Step 3: Multi-Command Sequences

```
Dentist: "Tooth three has MO caries, tooth five has a buccal lesion,
          and tooth fourteen needs a crown"

→ Parse as 3 separate commands
→ Queue and execute sequentially
→ Show confirmation for each
→ Record all in action_history (batch undo available)
```

### Step 4: Performance Target

```
Voice-to-action latency breakdown:
- Audio capture → ASR transcript: ~500ms (Deepgram streaming)
- Transcript → Intent parsing: ~300ms (GPT-4.1-mini)
- Workflow execution: ~500ms (tool calls to DB)
- Confirmation display: ~100ms (WebSocket to UI)
- Total target: < 2 seconds for routine, < 5 seconds for complex
```

---

## Verification Checklist

At the end of Phase 3:

- [ ] Can speak into microphone and see real-time transcription
- [ ] "Mark tooth 14 as missing" → correct intent parsed → chart updated
- [ ] "Create a note for this visit" → SOAP note created from dictation
- [ ] Confirmation cards appear for all mutations
- [ ] Critical actions (extractions) require checkbox confirmation
- [ ] Can confirm actions by voice ("confirm") or touch
- [ ] Undo toast appears after every action with countdown
- [ ] "Undo" / "Undo last action" reverses the last change
- [ ] Agent speaks responses back via TTS
- [ ] Voice waveform/indicator shows listening status
- [ ] Voice commands work during active encounter
- [ ] All actions recorded in audit_events
- [ ] Performance: <3 seconds voice-to-action for routine commands
- [ ] Works on Chrome, Safari, Edge (WebSocket + MediaRecorder support)
