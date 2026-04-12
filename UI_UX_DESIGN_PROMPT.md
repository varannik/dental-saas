# UI Design Brief: AI Voice Assistant for Dental Practice

## The Vision

Design a voice-first dental practice management system where dentists work hands-free chairside. They speak naturally—"Mark tooth fourteen as missing" or "Schedule follow-up in two weeks"—and the system understands, confirms intelligently, and executes with absolute clinical safety.

This is not traditional software with forms and dropdowns. It's an AI-powered clinical companion that combines medical-grade precision with conversational fluidity. The visual interface exists only to confirm voice commands, display AI detections, and present analytics—never to slow down clinical work.

---

## Core Design Principles

**Safety First**

- Never auto-execute critical actions
- Always show what was understood before executing
- Require explicit confirmation for high-risk commands
- Provide 5-minute undo window for all actions

**Voice-First, Visual-Second**

- Interface supports voice, doesn't replace it
- Visual confirmations are fast and glanceable
- Large touch targets for gloved hands
- Minimal keyboard/mouse required

**Transparent Intelligence**

- Show AI confidence scores on all detections
- Display exact voice transcription for verification
- Make reasoning visible, not a black box
- Allow human override always

**Professional Polish**

- Clean, modern aesthetic (Tesla dashboard meets healthcare)
- Trustworthy blues, clinical whites, intelligent teals
- Generous spacing, excellent readability
- Premium feel matching dental expertise

---

## Key Components

### Voice Confirmation System

**Routine Actions (Quick Confirm)**
A clean card appears showing what was heard, patient context, and what will change. Green confirm button, gray cancel. Tap to approve, executes immediately.

**Critical Actions (Required Review)**
Larger dialog with warning indicator. Shows full clinical context, patient ID, tooth details, current vs. new status, and what else is affected. Requires checkbox acknowledgment before confirm button activates.

### AI Detection Overlays

Radiographs display color-coded AI findings directly on images:

- Green overlays: High confidence (>95%)
- Yellow overlays: Medium confidence (85-95%)
- Orange/Red overlays: Low confidence (<85%)

Side panel lists all findings with accept/dismiss actions. Hoverable tooltips show details and measurements.

### Undo Notification

Bottom-corner notification after every action showing what was done, countdown timer (5:00 → 0:00), and prominent undo button. Stays visible until timeout or manual dismiss.

### Practice Dashboard

Clean cards showing key metrics with trend indicators. Charts for production, case acceptance, scheduling. Interactive drill-downs. Exportable reports.

---

## The Experience Flow

**Morning:** Voice login → Dashboard shows schedule, overnight messages, key metrics

**During Exam:** Radiograph loads → AI detections appear → Voice commands for charting → Quick confirmations → Everything recorded

**Critical Moments:** "Extract tooth 28" → Detailed confirmation dialog → Explicit checkbox → Execute → Undo notification appears

**End of Day:** "Show today's production" → Summary dashboard → "End session"

---

## Emotional Goals

**Dentists feel:** Empowered, confident, efficient, professionally supported

**Staff feel:** Capable, organized, efficient with automation

**Patients see:** Modern, high-tech, impressive care quality

---

## What to Design

1. **Voice confirmation cards** (routine and critical variants)
2. **Radiograph viewer** with AI overlay system
3. **Undo notification** with countdown
4. **Analytics dashboard** with KPI cards
5. **Patient chart** with dental diagram

Make it feel like the future of dental practice—intelligent, efficient, safe, and absolutely reliable.
