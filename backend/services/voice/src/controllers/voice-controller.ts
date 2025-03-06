import { Request, Response } from 'express';
import { Client as MinioClient } from 'minio';
import { VoiceRecording, Transcription, ExtractedEntities, AIInsights } from '../../../../database/schemas/voice-schema';
import { createLogger } from '../utils/logger';

const logger = createLogger('VoiceController');

/**
 * Voice Processing Controller
 * Handles voice recording uploads, transcription, and analysis
 */
export class VoiceController {
  private minioClient: MinioClient;
  private bucketName: string;

  constructor(minioClient: MinioClient, bucketName: string) {
    this.minioClient = minioClient;
    this.bucketName = bucketName;
  }

  /**
   * Upload a voice recording
   */
  public uploadRecording = async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId, dentistId, patientId, procedureId } = req.body;
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      if (!tenantId || !dentistId || !patientId) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      // Generate a unique object name for MinIO
      const objectName = `${tenantId}/${patientId}/${Date.now()}-${file.originalname}`;
      
      // Upload file to MinIO
      await this.minioClient.putObject(
        this.bucketName,
        objectName,
        file.buffer,
        file.size,
        { 'Content-Type': file.mimetype }
      );

      // Generate URL for the uploaded file
      const fileUrl = await this.minioClient.presignedGetObject(this.bucketName, objectName, 24 * 60 * 60); // 24 hours expiry

      // Create recording metadata in MongoDB
      const recording = new VoiceRecording({
        tenantId,
        fileName: file.originalname,
        fileSize: file.size,
        duration: 0, // Will be updated after processing
        mimeType: file.mimetype,
        storagePath: objectName,
        storageUrl: fileUrl,
        dentistId,
        patientId,
        procedureId: procedureId || undefined,
        recordedAt: new Date(),
        status: 'uploaded'
      });

      await recording.save();

      // Queue the recording for processing (in a real implementation, this would use a message queue)
      this.queueRecordingForProcessing(recording._id.toString());

      res.status(201).json({
        id: recording._id,
        status: recording.status,
        message: 'Recording uploaded successfully and queued for processing'
      });
    } catch (error) {
      logger.error('Error uploading recording:', error);
      res.status(500).json({ error: 'Failed to upload recording' });
    }
  };

  /**
   * Get recording details
   */
  public getRecording = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { tenantId } = req.query;

      if (!tenantId) {
        res.status(400).json({ error: 'Missing tenantId parameter' });
        return;
      }

      const recording = await VoiceRecording.findOne({ 
        _id: id, 
        tenantId: tenantId.toString() 
      });

      if (!recording) {
        res.status(404).json({ error: 'Recording not found' });
        return;
      }

      // Get the transcription if available
      let transcription = null;
      if (recording.status === 'transcribed' || recording.status === 'analyzed') {
        transcription = await Transcription.findOne({ recordingId: recording._id });
      }

      // Get the analysis if available
      let analysis = null;
      if (recording.status === 'analyzed') {
        const entities = await ExtractedEntities.findOne({ transcriptionId: transcription?._id });
        if (entities) {
          analysis = await AIInsights.findOne({ entityExtractionId: entities._id });
        }
      }

      res.status(200).json({
        recording,
        transcription: transcription ? {
          text: transcription.text,
          confidence: transcription.confidence,
          segments: transcription.segments
        } : null,
        analysis: analysis ? {
          summary: analysis.summary,
          recommendations: analysis.recommendations,
          warnings: analysis.warnings,
          actionItems: analysis.actionItems
        } : null
      });
    } catch (error) {
      logger.error('Error retrieving recording:', error);
      res.status(500).json({ error: 'Failed to retrieve recording' });
    }
  };

  /**
   * List recordings for a patient
   */
  public listPatientRecordings = async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId, patientId } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      if (!tenantId || !patientId) {
        res.status(400).json({ error: 'Missing required parameters' });
        return;
      }

      const recordings = await VoiceRecording.find({ 
        tenantId: tenantId.toString(),
        patientId: patientId.toString()
      })
      .sort({ recordedAt: -1 })
      .skip(skip)
      .limit(limit);

      const total = await VoiceRecording.countDocuments({
        tenantId: tenantId.toString(),
        patientId: patientId.toString()
      });

      res.status(200).json({
        recordings,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Error listing recordings:', error);
      res.status(500).json({ error: 'Failed to list recordings' });
    }
  };

  /**
   * Queue a recording for processing
   * In a real implementation, this would publish to a message queue
   */
  private queueRecordingForProcessing(recordingId: string): void {
    // Simulate async processing
    setTimeout(async () => {
      try {
        // Update status to processing
        const recording = await VoiceRecording.findByIdAndUpdate(
          recordingId,
          { status: 'processing' },
          { new: true }
        );

        if (!recording) {
          logger.error(`Recording ${recordingId} not found for processing`);
          return;
        }

        logger.info(`Processing recording ${recordingId}`);

        // In a real implementation, this would be handled by a separate worker process
        // that subscribes to a message queue

        // Simulate transcription process
        // In production, this would call a speech-to-text service
        const transcriptionText = "This is a simulated transcription. In a real implementation, this would be the result of a speech-to-text service.";
        
        const transcription = new Transcription({
          recordingId: recording._id,
          tenantId: recording.tenantId,
          text: transcriptionText,
          language: 'en-US',
          confidence: 0.95,
          segments: [{
            startTime: 0,
            endTime: 5,
            text: "This is a simulated transcription.",
            confidence: 0.95
          }, {
            startTime: 5,
            endTime: 10,
            text: "In a real implementation, this would be the result of a speech-to-text service.",
            confidence: 0.95
          }],
          processingTime: 1500,
          provider: 'simulation'
        });

        await transcription.save();

        // Update recording status
        await VoiceRecording.findByIdAndUpdate(
          recordingId,
          { 
            status: 'transcribed',
            duration: 10 // Simulated duration in seconds
          }
        );

        // Simulate entity extraction
        const entities = new ExtractedEntities({
          transcriptionId: transcription._id,
          tenantId: recording.tenantId,
          patientId: recording.patientId,
          diagnoses: [{
            entity: "Dental caries",
            confidence: 0.9,
            position: { start: 10, end: 22 }
          }],
          treatments: [{
            entity: "Filling",
            confidence: 0.85,
            position: { start: 30, end: 37 }
          }],
          medications: [{
            name: "Ibuprofen",
            dosage: "400mg",
            frequency: "every 6 hours",
            confidence: 0.95,
            position: { start: 45, end: 54 }
          }],
          allergies: [],
          procedures: [{
            name: "Dental filling",
            description: "Composite resin filling",
            confidence: 0.9,
            position: { start: 60, end: 73 }
          }],
          processingTime: 800,
          nlpProvider: 'simulation',
          requiresReview: false,
          hasDrugInteractions: false,
          hasAllergyWarnings: false
        });

        await entities.save();

        // Simulate AI insights
        const insights = new AIInsights({
          entityExtractionId: entities._id,
          tenantId: recording.tenantId,
          patientId: recording.patientId,
          summary: "Patient has dental caries requiring a filling. Ibuprofen 400mg prescribed for pain management.",
          recommendations: [{
            type: 'treatment',
            text: "Schedule follow-up in 2 weeks to check filling",
            reasoning: "Standard follow-up procedure for new fillings",
            confidence: 0.9,
            urgency: 'medium'
          }],
          warnings: [],
          actionItems: [{
            action: "Schedule follow-up appointment",
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
            status: 'pending'
          }],
          modelVersion: 'simulation-1.0',
          confidenceScore: 0.9,
          processingTime: 1200
        });

        await insights.save();

        // Update recording status to analyzed
        await VoiceRecording.findByIdAndUpdate(
          recordingId,
          { status: 'analyzed' }
        );

        logger.info(`Completed processing recording ${recordingId}`);
      } catch (error) {
        logger.error(`Error processing recording ${recordingId}:`, error);
        
        // Update recording status to error
        await VoiceRecording.findByIdAndUpdate(
          recordingId,
          { 
            status: 'error',
            processingError: error instanceof Error ? error.message : 'Unknown error'
          }
        );
      }
    }, 5000); // Simulate 5 second processing delay
  }
} 