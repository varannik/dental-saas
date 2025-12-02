# Voice Command Confirmation - UX Guidelines

## Overview

This document defines the user experience and interaction patterns for voice command confirmation in the dental SaaS platform. Voice commands that modify clinical data **must** be confirmed by the user before execution to ensure clinical safety, regulatory compliance, and user trust.

---

## Core Principles

### 1. **Safety First** 🏥
- Never auto-execute data modifications without confirmation
- Make it impossible to accidentally confirm
- Provide clear visual feedback of what will change

### 2. **Speed & Efficiency** ⚡
- Confirmation should be fast (< 3 seconds)
- Support keyboard shortcuts
- Allow batch confirmations when appropriate

### 3. **Clarity & Transparency** 🔍
- Show exactly what was heard
- Display what will change
- Indicate confidence level
- Provide context (patient, tooth, etc.)

### 4. **Error Prevention** 🛡️
- Highlight low-confidence interpretations
- Allow easy editing before confirmation
- Support undo for recent actions

---

## Approval Tiers

### Tier 1: Auto-Execute (No Confirmation)
**Read-only operations that don't modify data**

✅ Examples:
- View patient history
- Search clinical knowledge base
- Calculate risk scores
- Generate reports
- Display imaging studies

**UI Pattern:** Show subtle notification, no blocking dialog

```
┌────────────────────────────────┐
│ 🔍 Searching patient history... │
└────────────────────────────────┘
```

---

### Tier 2: Quick Confirmation (Standard)
**Data modifications with high confidence (>95%)**

⚠️ Examples:
- Create clinical notes
- Schedule appointments
- Send patient messages
- Update non-critical fields

**UI Pattern:** Inline confirmation with quick approve/reject

```
┌─────────────────────────────────────────┐
│ 🎤 "Schedule appointment for John Doe"  │
│                                         │
│ ✓ Tomorrow at 2:00 PM                  │
│                                         │
│ [✓ Confirm] [✗ Cancel]                 │
└─────────────────────────────────────────┘
```

---

### Tier 3: Detailed Confirmation (High-Risk)
**Critical data modifications**

🔴 Examples:
- Update dental chart
- Create/modify treatment plans
- Order imaging
- Prescribe medications
- Submit insurance claims
- Mark tooth as extracted/missing

**UI Pattern:** Modal dialog with detailed preview

```
┌──────────────────────────────────────────┐
│  ⚠️  Confirm Critical Action             │
├──────────────────────────────────────────┤
│                                          │
│  I heard:                                │
│  "Mark tooth 14 as missing"              │
│                                          │
│  Patient: John Doe (#12345)              │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  🦷 Tooth #14                      │  │
│  │  Upper Right First Molar           │  │
│  │                                    │  │
│  │  Current Status: ✓ Present         │  │
│  │  New Status:     ✗ Missing         │  │
│  │                                    │  │
│  │  This change is permanent!         │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Confidence: 98% ✓                       │
│                                          │
│  [✓ Confirm & Apply]  [✎ Edit]  [✗ Cancel] │
└──────────────────────────────────────────┘
```

---

## UI Components

### 1. Voice Command Card

**Purpose:** Display voice input and extracted information

```tsx
<VoiceCommandCard>
  <VoiceInput>
    <MicrophoneIcon />
    <Transcript>"Mark tooth 14 as missing"</Transcript>
    <ConfidenceScore value={0.98} />
  </VoiceInput>
  
  <ExtractedData>
    <DataItem label="Action" value="Update Dental Chart" />
    <DataItem label="Tooth" value="#14 (Upper Right 1st Molar)" />
    <DataItem label="Change" value="Set status to MISSING" />
  </ExtractedData>
</VoiceCommandCard>
```

**Visual Example:**

```
┌────────────────────────────────────────┐
│ 🎤 Voice Command                       │
├────────────────────────────────────────┤
│ "Mark tooth 14 as missing"             │
│ Confidence: 98% ●●●●●●●●●○             │
├────────────────────────────────────────┤
│ Action:  Update Dental Chart           │
│ Tooth:   #14 (Upper Right 1st Molar)   │
│ Change:  Set status to MISSING         │
└────────────────────────────────────────┘
```

---

### 2. Confidence Indicator

**Purpose:** Show how confident the AI is about the interpretation

**Color Coding:**
- 🟢 Green (95-100%): High confidence, safe to proceed
- 🟡 Yellow (85-94%): Medium confidence, review carefully
- 🔴 Red (<85%): Low confidence, likely incorrect

```tsx
<ConfidenceIndicator value={0.98}>
  <ProgressBar color="green" value={98} />
  <Label>98% Confident ✓</Label>
</ConfidenceIndicator>
```

**Visual Examples:**

```
High Confidence (98%):
┌────────────────────────────┐
│ Confidence: 98% ✓          │
│ ████████████████████░░     │
└────────────────────────────┘

Medium Confidence (87%):
┌────────────────────────────┐
│ ⚠️ Confidence: 87%          │
│ █████████████████░░░░░     │
│ Please review carefully    │
└────────────────────────────┘

Low Confidence (62%):
┌────────────────────────────┐
│ ⚠️ Confidence: 62%          │
│ ████████████░░░░░░░░░░     │
│ ⚠️ This may be incorrect!   │
└────────────────────────────┘
```

---

### 3. Visual Preview

**Purpose:** Show exactly what will change with visual context

#### Dental Chart Preview

```
┌──────────────────────────────────────┐
│  Tooth #14 - Upper Right 1st Molar   │
├──────────────────────────────────────┤
│                                      │
│  Current State:                      │
│  ┌────────────────────────────────┐  │
│  │         [Tooth Icon]           │  │
│  │      Status: ✓ Present         │  │
│  │      Condition: Healthy        │  │
│  └────────────────────────────────┘  │
│                                      │
│              ↓ Changes to            │
│                                      │
│  New State:                          │
│  ┌────────────────────────────────┐  │
│  │      [Crossed Tooth Icon]      │  │
│  │      Status: ✗ Missing         │  │
│  │      Reason: [To be entered]   │  │
│  └────────────────────────────────┘  │
│                                      │
│  ⚠️ This change is permanent!        │
└──────────────────────────────────────┘
```

#### Treatment Plan Preview

```
┌──────────────────────────────────────┐
│  New Treatment Plan Item             │
├──────────────────────────────────────┤
│  Procedure: Composite Filling        │
│  Tooth: #14                          │
│  Surfaces: MOD (3 surfaces)          │
│  Estimated Cost: $350                │
│  Insurance Coverage: $280 (80%)      │
│  Patient Portion: $70                │
│                                      │
│  Will be added to:                   │
│  Treatment Plan #TP-2024-001         │
│  Patient: John Doe                   │
└──────────────────────────────────────┘
```

---

### 4. Action Buttons

**Purpose:** Provide clear, accessible confirmation options

#### Button Hierarchy

1. **Primary Action (Confirm)** - Green, prominent
2. **Secondary Action (Edit)** - Gray, medium prominence
3. **Destructive Action (Cancel)** - Red outline, low prominence

```tsx
<ActionButtons>
  <Button variant="primary" color="green" icon="check">
    Confirm & Apply
  </Button>
  
  <Button variant="secondary" color="gray" icon="edit">
    Edit Details
  </Button>
  
  <Button variant="outline" color="red" icon="x">
    Cancel
  </Button>
</ActionButtons>
```

**Visual Layout:**

```
┌────────────────────────────────────────────────┐
│  [✓ Confirm & Apply]  [✎ Edit]  [✗ Cancel]   │
└────────────────────────────────────────────────┘
     Primary (Green)    Secondary   Destructive
```

#### Keyboard Shortcuts

- **Enter** or **Space**: Confirm
- **E**: Edit
- **Escape**: Cancel
- **Tab**: Navigate between buttons

---

### 5. Timeout Indicator

**Purpose:** Show how much time remains to confirm

```tsx
<TimeoutIndicator timeout={60}>
  <ProgressRing value={45} max={60} />
  <Label>45s remaining</Label>
</TimeoutIndicator>
```

**Visual Example:**

```
┌────────────────────────────┐
│        ⏱️ 45s              │
│      ◐ ━━━━━━━━━━          │
│   Auto-cancel in 45s       │
└────────────────────────────┘
```

**Behavior:**
- Start at 60 seconds
- Show warning at 10 seconds (turn orange)
- Auto-cancel at 0 seconds
- Play subtle sound at 10s warning

---

## Interaction Patterns

### Pattern 1: Standard Confirmation Flow

```
User speaks → AI processes → Show confirmation → User confirms → Execute
```

**Timeline:**
```
0s    User: "Mark tooth 14 as missing"
      ↓
1s    [Processing voice...]
      ↓
2s    [Show confirmation dialog]
      ↓
5s    User clicks "Confirm"
      ↓
6s    [Executing action...]
      ↓
7s    ✓ "Tooth #14 marked as missing"
```

---

### Pattern 2: Low Confidence Flow

```
User speaks → AI processes → Detect low confidence → Request clarification
```

**Example:**

```
┌──────────────────────────────────────────┐
│  ⚠️ Please Clarify                       │
├──────────────────────────────────────────┤
│  I'm not sure I understood correctly.    │
│                                          │
│  I heard: "Mark tooth 40 as missing"     │
│  Confidence: 62% ⚠️                       │
│                                          │
│  Did you mean:                           │
│  ○ Tooth #14 (Upper Right 1st Molar)     │
│  ○ Tooth #4 (Upper Right 2nd Premolar)   │
│  ○ Something else                        │
│                                          │
│  [Select] or [Try Again 🎤]              │
└──────────────────────────────────────────┘
```

---

### Pattern 3: Batch Confirmation

**For multiple related actions**

```
┌──────────────────────────────────────────┐
│  Confirm 3 Actions                       │
├──────────────────────────────────────────┤
│  ☑ Mark tooth #14 as missing             │
│  ☑ Add note: "Extracted due to caries"   │
│  ☑ Update treatment plan status          │
│                                          │
│  [✓ Confirm All]  [Review Each]  [✗ Cancel] │
└──────────────────────────────────────────┘
```

---

### Pattern 4: Edit Before Confirm

**Allow users to correct misinterpretations**

```
┌──────────────────────────────────────────┐
│  Edit Voice Command                      │
├──────────────────────────────────────────┤
│  Original: "Mark tooth 14 as missing"    │
│                                          │
│  Tooth Number:                           │
│  [14 ▼] Upper Right 1st Molar            │
│                                          │
│  Status:                                 │
│  [Missing ▼]                             │
│                                          │
│  Reason (optional):                      │
│  [Extracted due to caries_____________]  │
│                                          │
│  [✓ Apply Changes]  [✗ Cancel]           │
└──────────────────────────────────────────┘
```

---

## Mobile Considerations

### Touch-Optimized Buttons

```
┌────────────────────────────────────┐
│                                    │
│  [    ✓ Confirm & Apply    ]      │
│       (Tap to confirm)             │
│                                    │
│  [       ✎ Edit Details     ]      │
│                                    │
│  [       ✗ Cancel           ]      │
│                                    │
└────────────────────────────────────┘
```

**Requirements:**
- Minimum button height: 44px (iOS) / 48px (Android)
- Minimum spacing between buttons: 8px
- Large tap targets for easy thumb access
- Swipe gestures for quick actions

### Voice Confirmation

**Allow voice confirmation on mobile**

```
User: "Mark tooth 14 as missing"
      ↓
App: [Shows confirmation]
     "Say 'confirm' to proceed or 'cancel' to abort"
      ↓
User: "Confirm"
      ↓
App: ✓ Executed
```

---

## Accessibility

### Screen Reader Support

```tsx
<ConfirmationDialog
  role="alertdialog"
  aria-labelledby="dialog-title"
  aria-describedby="dialog-description"
>
  <h2 id="dialog-title">Confirm Voice Command</h2>
  <p id="dialog-description">
    You said "Mark tooth 14 as missing". 
    This will permanently change the status of tooth 14 
    to missing in the patient's dental chart.
  </p>
  
  <button aria-label="Confirm and apply changes">
    Confirm
  </button>
</ConfirmationDialog>
```

### Keyboard Navigation

- **Tab**: Move between elements
- **Shift + Tab**: Move backwards
- **Enter/Space**: Activate button
- **Escape**: Close dialog (same as Cancel)
- **Arrow keys**: Navigate options in lists

### Visual Indicators

- High contrast mode support
- Focus indicators on all interactive elements
- Color + icon + text (never color alone)
- Sufficient text size (minimum 16px)

---

## Error Handling

### 1. Timeout Error

```
┌────────────────────────────────────┐
│  ⏱️ Confirmation Timeout            │
├────────────────────────────────────┤
│  No action was taken.              │
│                                    │
│  The voice command has been        │
│  cancelled for safety.             │
│                                    │
│  [Try Again 🎤]  [Dismiss]         │
└────────────────────────────────────┘
```

### 2. Execution Error

```
┌────────────────────────────────────┐
│  ❌ Action Failed                   │
├────────────────────────────────────┤
│  Could not update dental chart.    │
│                                    │
│  Error: Database connection lost   │
│                                    │
│  [Retry]  [Cancel]  [Report Issue] │
└────────────────────────────────────┘
```

### 3. Conflict Error

```
┌────────────────────────────────────┐
│  ⚠️ Conflict Detected               │
├────────────────────────────────────┤
│  Tooth #14 was recently updated    │
│  by Dr. Smith (2 minutes ago).     │
│                                    │
│  Current status: Present           │
│  Your change: Missing              │
│                                    │
│  [View Recent Changes]             │
│  [Override]  [Cancel]              │
└────────────────────────────────────┘
```

---

## Success Feedback

### Immediate Confirmation

```
┌────────────────────────────────────┐
│  ✓ Action Completed                │
├────────────────────────────────────┤
│  Tooth #14 marked as missing       │
│                                    │
│  Updated by: Dr. Smith (voice)     │
│  Time: 2:45 PM                     │
│                                    │
│  [Undo] (available for 5 minutes)  │
└────────────────────────────────────┘
```

### Toast Notification

```
┌────────────────────────────────┐
│ ✓ Tooth #14 marked as missing  │
│   [Undo]                       │
└────────────────────────────────┘
```

**Auto-dismiss after 5 seconds unless user hovers/taps**

---

## Undo Functionality

### Undo Button

```
┌────────────────────────────────────┐
│  Recent Voice Actions              │
├────────────────────────────────────┤
│  ✓ Tooth #14 marked as missing     │
│     2 minutes ago                  │
│     [↶ Undo]                       │
│                                    │
│  ✓ Created note for John Doe       │
│     5 minutes ago                  │
│     [↶ Undo]                       │
└────────────────────────────────────┘
```

### Undo Confirmation

```
┌────────────────────────────────────┐
│  Undo Action?                      │
├────────────────────────────────────┤
│  This will restore tooth #14 to    │
│  its previous status: Present      │
│                                    │
│  [✓ Yes, Undo]  [✗ Cancel]         │
└────────────────────────────────────┘
```

**Undo Window:** 5 minutes after action

---

## Best Practices Summary

### ✅ Do's

1. **Always show what was heard**
   - Display the exact transcript
   - Show confidence score

2. **Provide visual context**
   - Show tooth diagrams for dental changes
   - Display patient info
   - Preview the change

3. **Make confirmation easy**
   - Large, clear buttons
   - Keyboard shortcuts
   - Voice confirmation option

4. **Handle errors gracefully**
   - Clear error messages
   - Suggest solutions
   - Allow retry

5. **Support undo**
   - 5-minute undo window
   - Clear undo UI
   - Confirm before undoing

6. **Be accessible**
   - Screen reader support
   - Keyboard navigation
   - High contrast mode

### ❌ Don'ts

1. **Never auto-execute critical actions**
   - Always require explicit confirmation
   - No "silent" modifications

2. **Don't hide information**
   - Show confidence scores
   - Display all extracted data
   - Reveal what will change

3. **Don't use unclear language**
   - Avoid technical jargon
   - Be specific and concrete
   - Use plain English

4. **Don't make it hard to cancel**
   - Cancel should be easy
   - Timeout should be reasonable
   - No confirmation for cancellation

5. **Don't ignore low confidence**
   - Flag uncertain interpretations
   - Request clarification
   - Allow manual correction

6. **Don't skip audit trails**
   - Log every action
   - Track who confirmed
   - Record timestamps

---

## Implementation Checklist

### Phase 1: Core Confirmation (Week 1)
- [ ] Voice command card component
- [ ] Confidence indicator
- [ ] Basic confirmation dialog
- [ ] Approve/Cancel buttons
- [ ] Timeout mechanism
- [ ] Success/error notifications

### Phase 2: Enhanced UX (Week 2)
- [ ] Visual previews (dental chart)
- [ ] Edit before confirm
- [ ] Batch confirmations
- [ ] Keyboard shortcuts
- [ ] Mobile optimization
- [ ] Voice confirmation

### Phase 3: Safety Features (Week 3)
- [ ] Undo functionality
- [ ] Conflict detection
- [ ] Double confirmation for critical actions
- [ ] Audit logging
- [ ] Error recovery

### Phase 4: Accessibility (Week 4)
- [ ] Screen reader support
- [ ] Keyboard navigation
- [ ] High contrast mode
- [ ] Focus indicators
- [ ] ARIA labels

---

## Metrics to Track

### User Experience Metrics
- **Confirmation Time**: Average time from voice input to confirmation
  - Target: < 5 seconds
- **Cancellation Rate**: % of confirmations cancelled
  - Target: < 10%
- **Edit Rate**: % of confirmations that require editing
  - Target: < 15%
- **Timeout Rate**: % of confirmations that timeout
  - Target: < 2%

### Safety Metrics
- **False Positive Rate**: Incorrect confirmations
  - Target: < 1%
- **Undo Rate**: % of actions that are undone
  - Target: < 5%
- **Error Rate**: Failed executions after confirmation
  - Target: < 0.5%

### Confidence Metrics
- **Average Confidence**: Mean confidence score
  - Target: > 90%
- **Low Confidence Rate**: % of commands with < 85% confidence
  - Target: < 10%

---

## Related Documentation

- **[schema-agent-extensions.yaml](../architecture/schema-agent-extensions.yaml)** - Database schema for approval requests
- **[agent-implementation-guide.md](../architecture/agent-implementation-guide.md)** - Technical implementation guide
- **[schema-core.yaml](../architecture/schema-core.yaml)** - Core data schema

---

## Version History

- **v1.0.0** (2024-12-02) - Initial UX guidelines for voice command confirmation

---

**Last Updated:** December 2, 2024  
**Maintained By:** UX Team  
**Status:** ✅ Active

