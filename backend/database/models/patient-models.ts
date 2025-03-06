/**
 * TypeScript interfaces for PostgreSQL database models
 * 
 * These interfaces represent the database tables defined in patient-schema.sql
 */

// Utility type for common fields
interface BaseModel {
  id: string; // UUID
  created_at: Date;
  updated_at: Date;
}

// Public schema models (Multi-tenant related)
export interface Tenant extends BaseModel {
  name: string;
  domain: string;
  subscription_plan: string;
  subscription_status: string;
  subscription_expires_at?: Date;
  max_users: number;
  is_active: boolean;
}

export interface TenantUser extends BaseModel {
  tenant_id: string; // UUID reference to Tenant
  email: string;
  role: string;
}

// Tenant-specific models (Patient related)
export interface Patient extends BaseModel {
  first_name: string;
  last_name: string;
  date_of_birth: Date;
  gender?: string;
  email?: string;
  phone?: string;
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  insurance_provider?: string;
  insurance_policy_number?: string;
  last_visit_date?: Date;
  next_appointment_date?: Date;
}

export interface Allergy extends BaseModel {
  patient_id: string; // UUID reference to Patient
  allergen: string;
  reaction_severity: 'Mild' | 'Moderate' | 'Severe';
  notes?: string;
  diagnosed_date?: Date;
}

export interface MedicalHistory extends BaseModel {
  patient_id: string; // UUID reference to Patient
  condition: string;
  status: string; // Active, Resolved, etc.
  diagnosis_date?: Date;
  treatment?: string;
  notes?: string;
}

export interface Medication extends BaseModel {
  patient_id: string; // UUID reference to Patient
  medication_name: string;
  dosage?: string;
  frequency?: string;
  start_date?: Date;
  end_date?: Date;
  prescribing_doctor?: string;
  reason?: string;
}

export interface DentalProcedure extends BaseModel {
  patient_id: string; // UUID reference to Patient
  procedure_type: string;
  procedure_date: Date;
  dentist: string;
  notes?: string;
  follow_up_required: boolean;
  follow_up_date?: Date;
}

export interface VoiceNote extends BaseModel {
  patient_id: string; // UUID reference to Patient
  procedure_id?: string; // UUID reference to DentalProcedure
  recording_url: string;
  transcription?: string;
  dentist: string;
  recorded_at: Date;
  duration_seconds?: number;
  is_processed: boolean;
}

export interface Appointment extends BaseModel {
  patient_id: string; // UUID reference to Patient
  appointment_type: string;
  start_time: Date;
  end_time: Date;
  dentist: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled' | 'No-show';
  notes?: string;
}

export interface Communication extends BaseModel {
  patient_id: string; // UUID reference to Patient
  communication_type: 'Email' | 'SMS' | 'Push';
  message: string;
  sent_at?: Date;
  status: 'Pending' | 'Sent' | 'Failed' | 'Delivered';
  related_appointment_id?: string; // UUID reference to Appointment
}

// Repository interfaces for database operations

export interface TenantRepository {
  create(tenant: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>): Promise<Tenant>;
  findById(id: string): Promise<Tenant | null>;
  findByDomain(domain: string): Promise<Tenant | null>;
  update(id: string, data: Partial<Tenant>): Promise<Tenant>;
  delete(id: string): Promise<boolean>;
  listAll(): Promise<Tenant[]>;
}

export interface PatientRepository {
  create(tenantId: string, patient: Omit<Patient, 'id' | 'created_at' | 'updated_at'>): Promise<Patient>;
  findById(tenantId: string, id: string): Promise<Patient | null>;
  findByName(tenantId: string, firstName: string, lastName: string): Promise<Patient[]>;
  update(tenantId: string, id: string, data: Partial<Patient>): Promise<Patient>;
  delete(tenantId: string, id: string): Promise<boolean>;
  listByTenant(tenantId: string, limit?: number, offset?: number): Promise<Patient[]>;
  countByTenant(tenantId: string): Promise<number>;
}

export interface AllergyRepository {
  create(tenantId: string, allergy: Omit<Allergy, 'id' | 'created_at' | 'updated_at'>): Promise<Allergy>;
  findById(tenantId: string, id: string): Promise<Allergy | null>;
  findByPatient(tenantId: string, patientId: string): Promise<Allergy[]>;
  update(tenantId: string, id: string, data: Partial<Allergy>): Promise<Allergy>;
  delete(tenantId: string, id: string): Promise<boolean>;
}

export interface MedicationRepository {
  create(tenantId: string, medication: Omit<Medication, 'id' | 'created_at' | 'updated_at'>): Promise<Medication>;
  findById(tenantId: string, id: string): Promise<Medication | null>;
  findByPatient(tenantId: string, patientId: string): Promise<Medication[]>;
  findActiveMedications(tenantId: string, patientId: string): Promise<Medication[]>;
  update(tenantId: string, id: string, data: Partial<Medication>): Promise<Medication>;
  delete(tenantId: string, id: string): Promise<boolean>;
}

export interface AppointmentRepository {
  create(tenantId: string, appointment: Omit<Appointment, 'id' | 'created_at' | 'updated_at'>): Promise<Appointment>;
  findById(tenantId: string, id: string): Promise<Appointment | null>;
  findByPatient(tenantId: string, patientId: string): Promise<Appointment[]>;
  findByDateRange(tenantId: string, startDate: Date, endDate: Date): Promise<Appointment[]>;
  findByDentist(tenantId: string, dentist: string, date: Date): Promise<Appointment[]>;
  update(tenantId: string, id: string, data: Partial<Appointment>): Promise<Appointment>;
  delete(tenantId: string, id: string): Promise<boolean>;
}

// Additional repository interfaces can be added as needed for other entities 