# Step-by-Step: Phase 2 — Dental Core

**Goal:** Patient management, dental charting, clinical notes via API + working web UI.

**Time Estimate:** 4 weeks (Weeks 5-8)

---

## Week 5: Patient Management (API Layer)

### Step 1: Create Clinical Service

This is the core service handling patients, encounters, and clinical notes. It can either be a new service or added to the users service.

**Recommended:** Create a dedicated `services/clinical` service.

```bash
mkdir -p services/clinical/src/{routes,services,schemas,__tests__}
cd services/clinical && pnpm init
```

**File structure:**

```
services/clinical/src/
├── index.ts
├── routes/
│   ├── patients.ts           # Patient CRUD + search
│   ├── encounters.ts         # Encounter lifecycle
│   ├── clinical-notes.ts     # SOAP notes
│   ├── dental-chart.ts       # Tooth-level charting
│   └── treatment-plans.ts    # Treatment plan management
├── services/
│   ├── patient.service.ts    # Patient business logic
│   ├── encounter.service.ts  # Encounter state machine
│   ├── note.service.ts       # Note creation/signing
│   ├── chart.service.ts      # Dental chart updates
│   └── treatment.service.ts  # Treatment planning
├── schemas/
│   ├── patient.schema.ts     # Zod validation
│   ├── encounter.schema.ts
│   ├── note.schema.ts
│   ├── chart.schema.ts
│   └── treatment.schema.ts
└── __tests__/
    ├── patient.service.test.ts
    ├── encounter.service.test.ts
    └── routes/
        └── patients.test.ts
```

### Step 2: Patient API Endpoints

```
POST   /patients              # Create patient (tenant-scoped)
GET    /patients              # List patients (paginated, searchable)
GET    /patients/:id          # Get patient details
PATCH  /patients/:id          # Update patient
DELETE /patients/:id          # Soft-delete patient
GET    /patients/:id/history  # Full encounter/note history
GET    /patients/search       # Search by name, DOB, phone
```

**Implementation priorities:**

1. Create with all fields from `schema-core.yaml` patients entity
2. Search by `last_name + dob` (indexed in schema)
3. Pagination with cursor-based pagination (better than offset for large datasets)
4. All queries scoped by `tenant_id` from JWT context

### Step 3: Encounter API Endpoints

```
POST   /encounters                    # Create encounter
GET    /encounters/:id                # Get encounter details
PATCH  /encounters/:id/check-in       # Check in patient
PATCH  /encounters/:id/check-out      # Check out patient
GET    /patients/:id/encounters       # List encounters for patient
```

**Encounter State Machine:**

```
SCHEDULED → CHECKED_IN → IN_PROGRESS → COMPLETED → BILLED
                                    └→ CANCELLED
```

### Step 4: Clinical Notes API

```
POST   /encounters/:id/notes         # Create note
GET    /encounters/:id/notes         # List notes for encounter
GET    /notes/:id                    # Get specific note
PATCH  /notes/:id                    # Update note (before signing)
POST   /notes/:id/sign              # Sign note (lock from editing)
```

**Note types:** SOAP, PROGRESS, RADIOLOGY_REPORT, TREATMENT_NARRATIVE

### Step 5: Add Routes to API Gateway

Update `apps/api-gateway` to proxy clinical service routes:

```typescript
// /api/v1/patients/* → services/clinical:4003/patients/*
// /api/v1/encounters/* → services/clinical:4003/encounters/*
// /api/v1/notes/* → services/clinical:4003/notes/*
```

---

## Week 6: Dental Charting & Treatment Plans

### Step 1: Dental Chart API

This is a core dental-specific feature. Each patient has a dental chart with entries per tooth.

```
GET    /patients/:id/chart            # Get full dental chart (32 teeth)
POST   /patients/:id/chart/entries    # Add chart entry
PATCH  /chart-entries/:id             # Update entry
DELETE /chart-entries/:id             # Remove entry
GET    /patients/:id/chart/history    # Chart change history
```

**Dental Chart Data Model:**

```typescript
interface DentalChartEntry {
  id: string;
  patientId: string;
  toothNumber: string; // 1-32 (universal numbering)
  surface: string | null; // M, O, D, B, L (mesial, occlusal, distal, buccal, lingual)
  condition: string; // HEALTHY, CARIES, FILLING, CROWN, MISSING, IMPLANT, etc.
  cdtCode: string | null; // CDT procedure code
  notes: string | null;
  diagnosedAt: Date;
  diagnosedById: string; // Provider who diagnosed
  encounterId: string | null; // Which visit this was found
}
```

### Step 2: Treatment Plan API

```
POST   /patients/:id/treatment-plans          # Create plan
GET    /patients/:id/treatment-plans          # List plans
GET    /treatment-plans/:id                   # Get plan with items
POST   /treatment-plans/:id/items             # Add procedure to plan
PATCH  /treatment-plans/:id/items/:itemId     # Update procedure
DELETE /treatment-plans/:id/items/:itemId     # Remove procedure
POST   /treatment-plans/:id/present           # Mark as presented to patient
POST   /treatment-plans/:id/accept            # Patient accepts plan
```

### Step 3: CDT Code Reference Data

Load CDT (Current Dental Terminology) codes as reference data:

```bash
# Create seed file with common CDT codes
# D0120 - Periodic oral evaluation
# D0150 - Comprehensive oral evaluation
# D0220 - Intraoral periapical first film
# D1110 - Prophylaxis adult
# D2391 - Resin-based composite - one surface
# D2740 - Crown porcelain/ceramic substrate
# D7210 - Extraction, erupted tooth with bone removal
# ... etc.
```

### Step 4: Test Full Clinical Workflow via API

```bash
# Create patient
PATIENT_ID=$(curl -s -X POST http://localhost:4000/api/v1/patients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "dob": "1985-03-15",
    "contactEmail": "john@example.com",
    "phoneMobile": "+1234567890"
  }' | jq -r '.id')

# Create encounter
ENCOUNTER_ID=$(curl -s -X POST http://localhost:4000/api/v1/encounters \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"patientId\": \"$PATIENT_ID\",
    \"encounterType\": \"EXAM\",
    \"scheduledStartAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
  }" | jq -r '.id')

# Add dental chart finding
curl -X POST "http://localhost:4000/api/v1/patients/$PATIENT_ID/chart/entries" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"toothNumber\": \"3\",
    \"surface\": \"MO\",
    \"condition\": \"CARIES\",
    \"cdtCode\": \"D0220\",
    \"encounterId\": \"$ENCOUNTER_ID\"
  }"

# Create clinical note
curl -X POST "http://localhost:4000/api/v1/encounters/$ENCOUNTER_ID/notes" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "noteType": "SOAP",
    "content": "S: Patient reports pain in upper right quadrant.\nO: Caries on tooth #3 MO surface.\nA: Caries D0220.\nP: Recommend resin-based composite D2391."
  }'

# Create treatment plan
curl -X POST "http://localhost:4000/api/v1/patients/$PATIENT_ID/treatment-plans" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"cdtCode": "D2391", "toothNumber": "3", "surface": "MO", "estimatedFee": 250.00, "phase": 1}
    ]
  }'
```

---

## Week 7: Web App Foundation

### Step 1: Initialize Next.js App

```bash
cd apps/web
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*"
```

Update `apps/web/package.json`:

```json
{
  "name": "@dental/web",
  "dependencies": {
    "@dental/types": "workspace:*",
    "@dental/ui": "workspace:*",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^5.0.0",
    "socket.io-client": "^4.7.0",
    "next": "^15.0.0",
    "react": "^19.0.0"
  }
}
```

Install shadcn/ui:

```bash
cd apps/web
npx shadcn@latest init
npx shadcn@latest add button card dialog input label table toast
```

### Step 2: App Layout & Auth

```
apps/web/src/
├── app/
│   ├── layout.tsx              # Root layout with providers
│   ├── page.tsx                # Landing / redirect to dashboard
│   ├── (auth)/
│   │   ├── login/page.tsx      # Login page
│   │   └── register/page.tsx   # Registration page
│   ├── (dashboard)/
│   │   ├── layout.tsx          # Dashboard layout (sidebar + header)
│   │   ├── page.tsx            # Dashboard home
│   │   ├── patients/
│   │   │   ├── page.tsx        # Patient list
│   │   │   └── [id]/
│   │   │       ├── page.tsx    # Patient detail (chart + notes)
│   │   │       └── encounters/
│   │   │           └── [encId]/page.tsx  # Encounter detail
│   │   └── settings/
│   │       └── page.tsx        # Practice settings
│   └── api/                    # Next.js API routes (optional proxy)
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx         # Navigation sidebar
│   │   ├── header.tsx          # Top bar with user menu
│   │   └── breadcrumbs.tsx     # Breadcrumb navigation
│   ├── patients/
│   │   ├── patient-list.tsx    # Searchable patient table
│   │   ├── patient-card.tsx    # Patient summary card
│   │   └── patient-form.tsx    # Create/edit patient form
│   ├── dental-chart/
│   │   ├── chart-view.tsx      # Full mouth SVG diagram
│   │   ├── tooth.tsx           # Individual tooth component
│   │   └── chart-legend.tsx    # Color-coded legend
│   └── voice/
│       ├── voice-indicator.tsx # Listening/processing indicator
│       └── voice-toast.tsx     # Confirmation toast (future)
├── hooks/
│   ├── use-auth.ts             # Auth state and actions
│   ├── use-patients.ts         # Patient data queries
│   └── use-dental-chart.ts     # Chart data queries
├── lib/
│   ├── api-client.ts           # Fetch wrapper with auth
│   ├── query-client.ts         # TanStack Query setup
│   └── auth.ts                 # Token management
└── stores/
    ├── auth.store.ts           # Zustand auth store
    └── encounter.store.ts      # Current encounter state
```

### Step 3: Key UI Components

**Dashboard Layout:**

- Collapsible sidebar with: Patients, Schedule, Reports, Settings
- Top header with: Practice name, notification bell, user menu
- Breadcrumb navigation

**Patient List Page:**

- Searchable table (name, phone, last visit)
- Click row to open patient detail
- Quick-add patient button
- Pagination controls

**Dental Chart View:**

- SVG-based odontogram (adult 32 teeth)
- Click tooth to see/edit conditions
- Color coding: white=healthy, red=caries, blue=filling, gray=missing
- Hover tooltip showing details

### Step 4: Design System

Match the UI/UX Design Brief vision:

- **Colors:** Clinical blues (#1E3A5F), trust teal (#0EA5E9), clean white
- **Typography:** Inter for UI, JetBrains Mono for clinical data
- **Spacing:** Generous (for gloved-hand touch targets)
- **Cards:** Rounded, subtle shadows, clear hierarchy

---

## Week 8: Clinical Note UI + File Uploads

### Step 1: Clinical Note Editor

Build a SOAP note editor:

- Template-based (sections for S, O, A, P)
- Auto-populated from dental chart findings
- Draft → Sign workflow
- Rich text with dental terminology autocomplete

### Step 2: Encounter Workflow UI

Full encounter lifecycle in the UI:

```
Schedule → Check In → Exam (chart + notes + images) → Check Out → Bill
```

Each step as a visual progress indicator at top of encounter page.

### Step 3: File Upload Service

Create `services/files` for image management:

```
POST   /files/upload          # Upload image (returns URL)
GET    /files/:id             # Get file metadata
DELETE /files/:id             # Delete file
GET    /files/:id/download    # Download file
```

Use MinIO locally, S3 in production. Store metadata in `imaging_objects` table.

### Step 4: Image Viewer (Basic)

For now, simple image gallery in encounter view. The full Cornerstone.js DICOM viewer comes in Phase 4 with AI overlay.

---

## Verification Checklist

At the end of Phase 2:

- [ ] Patient CRUD works through API and web UI
- [ ] Can search patients by name/DOB
- [ ] Encounter lifecycle (schedule → check-in → complete) works
- [ ] Dental chart displays 32 teeth with color-coded conditions
- [ ] Can add/edit chart entries per tooth
- [ ] Clinical notes (SOAP) can be created and signed
- [ ] Treatment plans with CDT codes and cost estimates work
- [ ] Web app: login → dashboard → patient list → patient detail → dental chart
- [ ] File upload works (images to MinIO)
- [ ] All views are tenant-scoped (multi-tenant working)
- [ ] Responsive design works on tablet (for chairside use)
- [ ] All API endpoints have Zod validation

---

## What This Enables

After Phase 2:

- A working dental practice management system (no voice yet)
- Can onboard a dental practice for manual data entry
- Foundation for voice commands (chart updates, note creation)
- Can demo to potential users/investors
- Ready for AI voice layer (Phase 3)
