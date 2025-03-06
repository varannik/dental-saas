-- Patient Management Schema
-- This file defines the database schema for the patient management service

-- Enable UUID extension for generating unique IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create a schema for tenant isolation
CREATE SCHEMA IF NOT EXISTS tenant_${tenant_id};

-- TENANTS table (in public schema)
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    subscription_plan VARCHAR(50) NOT NULL,
    subscription_status VARCHAR(50) NOT NULL,
    subscription_expires_at TIMESTAMP WITH TIME ZONE,
    max_users INTEGER NOT NULL DEFAULT 5,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- TENANT USERS table (in public schema)
CREATE TABLE IF NOT EXISTS public.tenant_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, email)
);

-- The following tables will be created in each tenant's schema during tenant creation

-- PATIENTS table
CREATE TABLE IF NOT EXISTS tenant_${tenant_id}.patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(20),
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    emergency_contact_name VARCHAR(200),
    emergency_contact_phone VARCHAR(20),
    insurance_provider VARCHAR(100),
    insurance_policy_number VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_visit_date TIMESTAMP WITH TIME ZONE,
    next_appointment_date TIMESTAMP WITH TIME ZONE
);

-- ALLERGIES table
CREATE TABLE IF NOT EXISTS tenant_${tenant_id}.allergies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES tenant_${tenant_id}.patients(id) ON DELETE CASCADE,
    allergen VARCHAR(100) NOT NULL,
    reaction_severity VARCHAR(20) NOT NULL, -- Mild, Moderate, Severe
    notes TEXT,
    diagnosed_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- MEDICAL HISTORY table
CREATE TABLE IF NOT EXISTS tenant_${tenant_id}.medical_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES tenant_${tenant_id}.patients(id) ON DELETE CASCADE,
    condition VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL, -- Active, Resolved, etc.
    diagnosis_date DATE,
    treatment TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- MEDICATIONS table
CREATE TABLE IF NOT EXISTS tenant_${tenant_id}.medications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES tenant_${tenant_id}.patients(id) ON DELETE CASCADE,
    medication_name VARCHAR(100) NOT NULL,
    dosage VARCHAR(50),
    frequency VARCHAR(50),
    start_date DATE,
    end_date DATE,
    prescribing_doctor VARCHAR(100),
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- DENTAL PROCEDURES table
CREATE TABLE IF NOT EXISTS tenant_${tenant_id}.dental_procedures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES tenant_${tenant_id}.patients(id) ON DELETE CASCADE,
    procedure_type VARCHAR(100) NOT NULL,
    procedure_date TIMESTAMP WITH TIME ZONE NOT NULL,
    dentist VARCHAR(100) NOT NULL,
    notes TEXT,
    follow_up_required BOOLEAN DEFAULT FALSE,
    follow_up_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- VOICE NOTES table
CREATE TABLE IF NOT EXISTS tenant_${tenant_id}.voice_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES tenant_${tenant_id}.patients(id) ON DELETE CASCADE,
    procedure_id UUID REFERENCES tenant_${tenant_id}.dental_procedures(id),
    recording_url VARCHAR(255) NOT NULL,
    transcription TEXT,
    dentist VARCHAR(100) NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_seconds INTEGER,
    is_processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- APPOINTMENTS table
CREATE TABLE IF NOT EXISTS tenant_${tenant_id}.appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES tenant_${tenant_id}.patients(id) ON DELETE CASCADE,
    appointment_type VARCHAR(50) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    dentist VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL, -- Scheduled, Completed, Cancelled, No-show
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- COMMUNICATIONS table
CREATE TABLE IF NOT EXISTS tenant_${tenant_id}.communications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES tenant_${tenant_id}.patients(id) ON DELETE CASCADE,
    communication_type VARCHAR(50) NOT NULL, -- Email, SMS, Push
    message TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL, -- Pending, Sent, Failed, Delivered
    related_appointment_id UUID REFERENCES tenant_${tenant_id}.appointments(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_patients_name ON tenant_${tenant_id}.patients(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_allergies_patient ON tenant_${tenant_id}.allergies(patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_history_patient ON tenant_${tenant_id}.medical_history(patient_id);
CREATE INDEX IF NOT EXISTS idx_medications_patient ON tenant_${tenant_id}.medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_procedures_patient ON tenant_${tenant_id}.dental_procedures(patient_id);
CREATE INDEX IF NOT EXISTS idx_voice_notes_patient ON tenant_${tenant_id}.voice_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON tenant_${tenant_id}.appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_time ON tenant_${tenant_id}.appointments(start_time);
CREATE INDEX IF NOT EXISTS idx_communications_patient ON tenant_${tenant_id}.communications(patient_id); 