/** The dashboard and the activity rail (C7, spec section K). */

/** A patient as listed on the dashboard. */
export interface PatientListing {
  id: string;
  fileNumber: number;
  givenName: string;
  familyName: string;
  birthDate: string;
}

/** An open session in the clinic, for "Resume session for …". */
export interface OpenSessionListing {
  id: string;
  patient: PatientListing;
  chiefComplaint: string | null;
  startedAt: string;
  /** Whether the signed-in clinician is its provider. */
  mine: boolean;
}

/** A patient the signed-in user opened recently. */
export interface RecentPatient extends PatientListing {
  lastOpenedAt: string;
}

/** GET /v1/dashboard. Open sessions need session.read and are empty without it. */
export interface DashboardResponse {
  openSessions: OpenSessionListing[];
  recentPatients: RecentPatient[];
}

/** One executed command of the signed-in user, for the activity rail. */
export interface ActivityEntry {
  id: string;
  type: string;
  source: 'gui' | 'voice' | 'system';
  at: string;
  patientId: string | null;
  sessionId: string | null;
  tooth: string | null;
}

/** GET /v1/activity: the signed-in user's last ten executed commands, newest first. */
export interface ActivityResponse {
  entries: ActivityEntry[];
}
