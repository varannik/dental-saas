/**
 * MongoDB Schemas for Voice Processing Service (TypeScript)
 * 
 * This file defines the MongoDB schemas used by the voice processing service
 * to store voice recordings, transcriptions, and extracted insights.
 */

import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * VoiceRecording Document Interface
 */
export interface IVoiceRecording extends Document {
  tenantId: string;
  fileName: string;
  fileSize: number;
  duration: number;
  mimeType: string;
  storagePath: string;
  storageUrl: string;
  dentistId: string;
  patientId: string;
  procedureId?: string;
  status: 'uploaded' | 'processing' | 'transcribed' | 'analyzed' | 'error';
  processingError?: string;
  recordedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Transcription Document Interface
 */
export interface ISegment {
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
}

export interface ITranscription extends Document {
  recordingId: mongoose.Types.ObjectId;
  tenantId: string;
  text: string;
  language: string;
  confidence: number;
  segments: ISegment[];
  processingTime?: number;
  provider?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Entity Position Interface
 */
export interface IPosition {
  start: number;
  end: number;
}

/**
 * Entity Interface
 */
export interface IEntity {
  entity: string;
  confidence: number;
  position: IPosition;
}

/**
 * Medication Entity Interface
 */
export interface IMedicationEntity extends Omit<IEntity, 'entity'> {
  name: string;
  dosage?: string;
  frequency?: string;
}

/**
 * Allergy Entity Interface
 */
export interface IAllergyEntity extends Omit<IEntity, 'entity'> {
  allergen: string;
  reaction?: string;
}

/**
 * Procedure Entity Interface
 */
export interface IProcedureEntity extends Omit<IEntity, 'entity'> {
  name: string;
  description?: string;
}

/**
 * Extracted Entities Document Interface
 */
export interface IExtractedEntities extends Document {
  transcriptionId: mongoose.Types.ObjectId;
  tenantId: string;
  patientId: string;
  diagnoses: IEntity[];
  treatments: IEntity[];
  medications: IMedicationEntity[];
  allergies: IAllergyEntity[];
  procedures: IProcedureEntity[];
  processingTime?: number;
  nlpProvider?: string;
  requiresReview: boolean;
  hasDrugInteractions: boolean;
  hasAllergyWarnings: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Recommendation Interface
 */
export interface IRecommendation {
  type: 'treatment' | 'medication' | 'followUp' | 'referral' | 'test';
  text: string;
  reasoning?: string;
  confidence?: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Warning Interface
 */
export interface IWarning {
  type: 'drugInteraction' | 'allergy' | 'contraindicatedProcedure' | 'medicalHistory';
  text: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence?: string;
}

/**
 * Action Item Interface
 */
export interface IActionItem {
  action: string;
  dueDate?: Date;
  assignedTo?: string;
  status: 'pending' | 'inProgress' | 'completed' | 'cancelled';
}

/**
 * AI Insights Document Interface
 */
export interface IAIInsights extends Document {
  entityExtractionId: mongoose.Types.ObjectId;
  tenantId: string;
  patientId: string;
  summary: string;
  recommendations: IRecommendation[];
  warnings: IWarning[];
  actionItems: IActionItem[];
  modelVersion?: string;
  confidenceScore?: number;
  processingTime?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Voice Recording Schema
 */
const VoiceRecordingSchema = new Schema<IVoiceRecording>({
  // Tenant information for multi-tenancy
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  
  // Recording metadata
  fileName: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  duration: {
    type: Number, // in seconds
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  
  // Storage information (in MinIO)
  storagePath: {
    type: String,
    required: true
  },
  storageUrl: {
    type: String,
    required: true
  },
  
  // Recording source information
  dentistId: {
    type: String,
    required: true,
    index: true
  },
  patientId: {
    type: String,
    required: true,
    index: true
  },
  procedureId: {
    type: String,
    index: true
  },
  
  // Processing status
  status: {
    type: String,
    enum: ['uploaded', 'processing', 'transcribed', 'analyzed', 'error'],
    default: 'uploaded',
    index: true
  },
  processingError: {
    type: String
  },
  
  // Timestamps
  recordedAt: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

/**
 * Transcription Schema
 */
const TranscriptionSchema = new Schema<ITranscription>({
  // Reference to the voice recording
  recordingId: {
    type: Schema.Types.ObjectId,
    ref: 'VoiceRecording',
    required: true,
    index: true
  },
  
  // Tenant information
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  
  // Transcription content
  text: {
    type: String,
    required: true
  },
  
  // Transcription metadata
  language: {
    type: String,
    default: 'en-US'
  },
  confidence: {
    type: Number, // 0-1 confidence score
    default: 0
  },
  
  // Timestamps and segments
  segments: [{
    startTime: Number,  // in seconds
    endTime: Number,    // in seconds
    text: String,
    confidence: Number
  }],
  
  // Processing information
  processingTime: {
    type: Number  // in milliseconds
  },
  provider: {
    type: String  // which ASR service was used
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

/**
 * Extracted Entities Schema
 */
const ExtractedEntitiesSchema = new Schema<IExtractedEntities>({
  // Reference to the transcription
  transcriptionId: {
    type: Schema.Types.ObjectId,
    ref: 'Transcription',
    required: true,
    index: true
  },
  
  // Tenant information
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  
  // Patient reference
  patientId: {
    type: String,
    required: true,
    index: true
  },
  
  // Extracted medical entities
  diagnoses: [{
    entity: String,
    confidence: Number,
    position: {
      start: Number,
      end: Number
    }
  }],
  
  treatments: [{
    entity: String,
    confidence: Number,
    position: {
      start: Number,
      end: Number
    }
  }],
  
  medications: [{
    name: String,
    dosage: String,
    frequency: String,
    confidence: Number,
    position: {
      start: Number,
      end: Number
    }
  }],
  
  allergies: [{
    allergen: String,
    reaction: String,
    confidence: Number,
    position: {
      start: Number,
      end: Number
    }
  }],
  
  procedures: [{
    name: String,
    description: String,
    confidence: Number,
    position: {
      start: Number,
      end: Number
    }
  }],
  
  // Processing metadata
  processingTime: {
    type: Number  // in milliseconds
  },
  nlpProvider: {
    type: String
  },
  
  // Action flags for integrations
  requiresReview: {
    type: Boolean,
    default: false
  },
  hasDrugInteractions: {
    type: Boolean,
    default: false
  },
  hasAllergyWarnings: {
    type: Boolean,
    default: false
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

/**
 * AI Insights Schema
 */
const AIInsightsSchema = new Schema<IAIInsights>({
  // References
  entityExtractionId: {
    type: Schema.Types.ObjectId,
    ref: 'ExtractedEntities',
    required: true,
    index: true
  },
  
  // Tenant information
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  
  // Patient reference
  patientId: {
    type: String,
    required: true,
    index: true
  },
  
  // AI generated insights
  summary: {
    type: String,
    required: true
  },
  
  recommendations: [{
    type: {
      type: String,
      enum: ['treatment', 'medication', 'followUp', 'referral', 'test']
    },
    text: String,
    reasoning: String,
    confidence: Number,
    urgency: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    }
  }],
  
  warnings: [{
    type: {
      type: String,
      enum: ['drugInteraction', 'allergy', 'contraindicatedProcedure', 'medicalHistory']
    },
    text: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    },
    evidence: String
  }],
  
  // Action items
  actionItems: [{
    action: String,
    dueDate: Date,
    assignedTo: String,
    status: {
      type: String,
      enum: ['pending', 'inProgress', 'completed', 'cancelled']
    }
  }],
  
  // AI metadata
  modelVersion: String,
  confidenceScore: Number,
  processingTime: Number,
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

// Create indexes for better performance
VoiceRecordingSchema.index({ tenantId: 1, patientId: 1, recordedAt: -1 });
VoiceRecordingSchema.index({ tenantId: 1, dentistId: 1, recordedAt: -1 });
VoiceRecordingSchema.index({ status: 1, createdAt: 1 });

TranscriptionSchema.index({ tenantId: 1, recordingId: 1 });

ExtractedEntitiesSchema.index({ tenantId: 1, patientId: 1, createdAt: -1 });
ExtractedEntitiesSchema.index({ requiresReview: 1, tenantId: 1 });
ExtractedEntitiesSchema.index({ hasDrugInteractions: 1, tenantId: 1 });
ExtractedEntitiesSchema.index({ hasAllergyWarnings: 1, tenantId: 1 });

AIInsightsSchema.index({ tenantId: 1, patientId: 1, createdAt: -1 });
AIInsightsSchema.index({ 'warnings.severity': 1, tenantId: 1 });
AIInsightsSchema.index({ 'actionItems.status': 1, tenantId: 1 });

// Create models with TypeScript interfaces
const VoiceRecording = mongoose.model<IVoiceRecording>('VoiceRecording', VoiceRecordingSchema);
const Transcription = mongoose.model<ITranscription>('Transcription', TranscriptionSchema);
const ExtractedEntities = mongoose.model<IExtractedEntities>('ExtractedEntities', ExtractedEntitiesSchema);
const AIInsights = mongoose.model<IAIInsights>('AIInsights', AIInsightsSchema);

// Export models
export {
  VoiceRecording,
  Transcription,
  ExtractedEntities,
  AIInsights
}; 