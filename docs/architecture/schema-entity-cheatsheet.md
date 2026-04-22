# Schema Entity Cheat Sheet

Quick onboarding reference for what each schema entity is used for.

## Tenancy & Identity

- `Tenant` - top-level organization (practice/DSO/payer/etc.).
- `Location` - clinic/site under a tenant.
- `TenantSetting` - tenant operational defaults and regional policy knobs.
- `TenantBranding` - white-label visual/communication identity.
- `SubscriptionPlan` - plan catalog definition.
- `TenantSubscription` - tenant active subscription instance.
- `TenantFeature` - feature flags/capability assignments per tenant.
- `TenantQuota` - usage and capacity limits per tenant.
- `Team` - organizational grouping inside tenant.
- `TeamMember` - membership of users in teams.
- `UserAuthIdentity` - auth provider identity mapping for a user.
- `UserRole` - scoped role assignment record.
- `User` - platform user profile.
- `ApiClient` - machine-to-machine client identity.
- `Session` - auth session/audit session record.
- `UserTenant` - user membership in a tenant.
- `Role` - role definition.
- `Permission` - atomic permission capability.
- `RolePermission` - role-to-permission mapping.
- `AuditEvent` - immutable audit trail event.

## Compliance & Governance

- `Consent` - consent state for AI/clinical/privacy actions.
- `PHIAccessLog` - PHI access tracking for compliance.
- `DataRetentionPolicy` - retention/archival/deletion rules.
- `LegalHold` - legal hold policy record.
- `LegalHoldLink` - links hold to affected resources.

## Clinical Core

- `Patient` - core patient demographic record.
- `Encounter` - visit/appointment episode.
- `ClinicalNote` - clinician-authored encounter/patient note.
- `ToothChartSnapshot` - point-in-time odontogram/tooth chart.
- `PerioMeasurement` - periodontal measurements per tooth/site.

## Clinical Context

- `PatientIdentifier` - MRN/external IDs.
- `PatientAddress` - patient address records.
- `PatientInsurancePolicy` - insurance coverage details.
- `PatientRelationship` - relationship graph (guardian/family).
- `PatientCondition` - problem list/conditions.
- `PatientMedication` - medication history.
- `PatientAllergy` - allergy records.
- `PatientSocialHistory` - social/behavioral context.
- `EncounterDiagnosis` - diagnosis captured in encounter.
- `VitalSign` - measured vitals.

## Procedures & AI Governance

- `Procedure` - performed clinical procedure event.
- `ProcedureMaterial` - materials consumed by procedures.
- `ClinicalOutcome` - outcome observation linked to care.
- `ImagingSeries` - imaging series grouping.
- `AIModelDeployment` - deployed model instance/version context.
- `AIReviewEvent` - human review of AI outputs.
- `AIOutcomeLink` - link between AI predictions and real outcomes.

## Imaging & AI Inference

- `ImagingStudy` - study-level imaging metadata.
- `ImagingObject` - individual image/object asset metadata.
- `ImageAnnotation` - annotation overlays/findings.
- `AIModel` - model family registry.
- `AIModelVersion` - versioned model artifact record.
- `AIInferenceJob` - model execution job.
- `AIPrediction` - prediction output artifact.

## Billing

- `TreatmentPlan` - proposed course of treatment.
- `TreatmentPlanItem` - line items within treatment plan.
- `Claim` - insurance claim header.
- `ClaimLine` - claim line detail.

## Billing Operations

- `BillingPlan` - billable commercial plan config.
- `TenantBillingAccount` - tenant billing account and processor linkage.
- `UsageMeter` - metric definition for usage billing.
- `UsageMeterReading` - captured usage events/aggregates.
- `Invoice` - invoice header.
- `InvoiceLineItem` - invoice line detail.
- `ClaimStatusEvent` - claim status transition history.

## Integrations

- `ExternalSystem` - external vendor/system catalog.
- `TenantIntegration` - tenant-specific integration configuration.
- `IntegrationCredential` - secure integration credential references.
- `SyncJob` - integration sync run.
- `SyncJobLog` - sync job logs/events.
- `FhirResource` - persisted FHIR payload metadata.
- `DicomTransaction` - DICOM exchange transaction record.
- `WebhookSubscription` - outbound event subscription config.

## Knowledge & Communication

- `KnowledgeDocument` - canonical knowledge content record.
- `KnowledgeVersion` - versioned document body.
- `KnowledgeLocalization` - localized document variants.
- `Conversation` - conversation thread.
- `ConversationParticipant` - participants in thread.
- `Message` - message event within conversation.
- `Notification` - user notification delivery record.
- `Document` - uploaded/managed file metadata.
- `Referral` - referral workflow record.

## Reference Data

- `CodeSystem` - clinical/billing code system.
- `CodeValue` - individual code entries.
- `ProcedureCatalog` - curated procedure definitions.
- `FeeSchedule` - fee schedule header.
- `FeeScheduleItem` - fee schedule line entries.

## Extensibility

- `DrugReference` - drug dictionary/reference row.
- `CustomFieldDefinition` - custom field schema definition.
- `CustomFieldValue` - custom field value storage.
- `Workflow` - automation workflow definition.
- `WorkflowInstance` - workflow runtime execution state.

## Voice

- `VoiceSession` - voice interaction session.
- `VoiceUtterance` - utterance/transcript segment.
- `VoiceRecording` - stored audio artifact metadata.

## Agent Runtime

- `AgentWorkflow` - reusable agent graph/workflow template.
- `AgentExecution` - runtime execution of workflow.
- `AgentStep` - per-step execution trace.
- `AgentTool` - tool registry entry.
- `ToolExecution` - specific tool call execution log.
- `AgentConversation` - agent-centered conversation context.
- `AgentMessage` - agent message event.
- `AgentMemory` - persistent memory chunks for retrieval.
- `AgentContextWindow` - bounded context snapshot for inference.
- `AgentApprovalRequest` - human approval gate event.
- `AgentIntervention` - manual override/intervention record.
- `ActionHistory` - undo/audit timeline for agent actions.
- `AgentMetric` - performance/quality metrics for agent operations.
