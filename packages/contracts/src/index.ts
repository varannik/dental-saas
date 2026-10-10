export { ERROR_CODES } from './errors.js';
export type { ErrorCode, ProblemDetails } from './errors.js';
export { isPermissionKey, PERMISSIONS } from './permissions.js';
export type { PermissionKey } from './permissions.js';
export { isSystemRole, MFA_REQUIRED_ROLES, ROLE_PERMISSIONS, SYSTEM_ROLES } from './roles.js';
export type { SystemRole } from './roles.js';
export {
  clinicOnboard,
  clinicUpdateSettings,
  diagnosisConfirm,
  diagnosisRecord,
  diagnosisReject,
  diagnosisRetract,
  diagnosisSuggest,
  findingAdd,
  historyAdd,
  historyEnd,
  noteAdd,
  patientCreate,
  patientUpdate,
  perioRecord,
  planAccept,
  planCancel,
  planCreate,
  planItemAdd,
  planItemCancel,
  planReorder,
  procedureCancel,
  procedureComplete,
  procedureStart,
  sessionAmend,
  sessionComplete,
  sessionSign,
  sessionStart,
  TOOTH_NOTATIONS,
  COMMAND_SOURCES,
  COMMANDS,
  isCommandType,
  RISK_TIERS,
} from './commands.js';
export type {
  ClinicOnboard,
  ClinicUpdateSettings,
  DiagnosisAdd,
  DiagnosisDecision,
  FindingAdd,
  HistoryAdd,
  HistoryEnd,
  NoteAdd,
  PatientCreate,
  PatientUpdate,
  PerioRecord,
  PlanCreate,
  PlanDecision,
  PlanItemAdd,
  PlanItemCancel,
  PlanReorder,
  ProcedureDecision,
  ProcedureStart,
  SessionAmend,
  SessionComplete,
  SessionSign,
  SessionStart,
  CommandDefinition,
  CommandSource,
  CommandType,
  RiskTier,
} from './commands.js';
export { CSRF_HEADER } from './auth.js';
export type {
  ClinicMembership,
  ClinicRequiredProblem,
  LoginResponse,
  MeResponse,
  MfaChallengeResponse,
  MfaEnrollmentResponse,
  SessionResponse,
} from './auth.js';
export { PATIENT_SEX } from './patients.js';
export type {
  DuplicateCandidate,
  Patient,
  PatientHit,
  PatientSearchResponse,
  PatientSex,
} from './patients.js';
export {
  ALLERGY_SEVERITIES,
  HISTORY_END_REASONS,
  HISTORY_GROUP,
  HISTORY_KINDS,
} from './history.js';
export type {
  AllergySeverity,
  HistoryEndReason,
  HistoryEntry,
  HistoryKind,
  PatientHistory,
} from './history.js';
export {
  AMENDMENT_ACTIONS,
  DIAGNOSIS_CERTAINTY,
  DIAGNOSIS_CODES,
  FINDING_CODES,
  FINDINGS,
  isAnterior,
  isValidFdi,
  NOTE_TYPES,
  PERIO_SITES,
  PERMANENT_TEETH,
  SURFACES,
  surfacesOf,
} from './chart.js';
export type {
  AmendmentAction,
  ChartEntry,
  ChartEvent,
  ClinicalNote,
  ClinicalSession,
  Diagnosis,
  DiagnosisCertainty,
  DiagnosisCode,
  DiagnosisStatus,
  Finding,
  FindingCode,
  NoteType,
  PatientChart,
  PerioMeasurement,
  PerioSite,
  Procedure,
  ProcedureStatus,
  SessionAmendment,
  SessionDetail,
  SessionStatus,
  Surface,
} from './chart.js';
export { PROCEDURE_CATEGORIES, PROCEDURE_SCOPES } from './plans.js';
export type {
  PlanItem,
  PlanItemStatus,
  PlanStatus,
  ProcedureCategory,
  ProcedureScope,
  ProcedureType,
  TreatmentPlan,
} from './plans.js';
export type {
  ActivityEntry,
  ActivityResponse,
  DashboardResponse,
  OpenSessionListing,
  PatientListing,
  RecentPatient,
} from './workspace.js';
export {
  AUDIO_FRAME,
  decodeAudioFrame,
  encodeAudioFrame,
  VOICE_CLOSE,
  VOICE_FRAME_SAMPLES,
  VOICE_PROTOCOL,
  VOICE_SAMPLE_RATE,
  VOICE_TICKET_PREFIX,
  VOICE_TICKET_SECONDS,
} from './voice.js';
export type {
  VoiceClientMessage,
  VoiceInterpretation,
  VoiceInterpretRequest,
  VoiceServerMessage,
  VoiceTicketResponse,
} from './voice.js';
export type {
  PendingProposal,
  VoiceContext,
  VoiceFocus,
  VoiceFocusUpdate,
} from './voice-context.js';
export { VOICE_COMMANDS } from './voice-commands.js';
export type { VoiceCommandSpec, VoiceEntity } from './voice-commands.js';
