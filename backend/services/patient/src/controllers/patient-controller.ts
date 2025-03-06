import { Request, Response } from 'express';
import { PatientRepository, Patient } from '../../../../database/models/patient-models';
import { createLogger } from '../utils/logger';

const logger = createLogger('PatientController');

/**
 * Patient Controller
 * Handles patient CRUD operations and related functionality
 */
export class PatientController {
  private patientRepository: PatientRepository;

  constructor(patientRepository: PatientRepository) {
    this.patientRepository = patientRepository;
  }

  /**
   * Create a new patient
   */
  public createPatient = async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId } = req.params;
      const patientData = req.body;

      // Validate required fields
      if (!patientData.first_name || !patientData.last_name || !patientData.date_of_birth) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      // Convert date string to Date object if needed
      if (typeof patientData.date_of_birth === 'string') {
        patientData.date_of_birth = new Date(patientData.date_of_birth);
      }

      const patient = await this.patientRepository.create(tenantId, patientData);

      res.status(201).json(patient);
    } catch (error) {
      logger.error('Error creating patient:', error);
      res.status(500).json({ error: 'Failed to create patient' });
    }
  };

  /**
   * Get a patient by ID
   */
  public getPatient = async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId, patientId } = req.params;

      const patient = await this.patientRepository.findById(tenantId, patientId);

      if (!patient) {
        res.status(404).json({ error: 'Patient not found' });
        return;
      }

      res.status(200).json(patient);
    } catch (error) {
      logger.error('Error retrieving patient:', error);
      res.status(500).json({ error: 'Failed to retrieve patient' });
    }
  };

  /**
   * Update a patient
   */
  public updatePatient = async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId, patientId } = req.params;
      const patientData = req.body;

      // Convert date strings to Date objects if needed
      if (patientData.date_of_birth && typeof patientData.date_of_birth === 'string') {
        patientData.date_of_birth = new Date(patientData.date_of_birth);
      }
      
      if (patientData.last_visit_date && typeof patientData.last_visit_date === 'string') {
        patientData.last_visit_date = new Date(patientData.last_visit_date);
      }
      
      if (patientData.next_appointment_date && typeof patientData.next_appointment_date === 'string') {
        patientData.next_appointment_date = new Date(patientData.next_appointment_date);
      }

      const updatedPatient = await this.patientRepository.update(tenantId, patientId, patientData);

      res.status(200).json(updatedPatient);
    } catch (error) {
      logger.error('Error updating patient:', error);
      
      if ((error as Error).message.includes('not found')) {
        res.status(404).json({ error: 'Patient not found' });
      } else {
        res.status(500).json({ error: 'Failed to update patient' });
      }
    }
  };

  /**
   * Delete a patient
   */
  public deletePatient = async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId, patientId } = req.params;

      const deleted = await this.patientRepository.delete(tenantId, patientId);

      if (!deleted) {
        res.status(404).json({ error: 'Patient not found' });
        return;
      }

      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting patient:', error);
      res.status(500).json({ error: 'Failed to delete patient' });
    }
  };

  /**
   * List patients with pagination
   */
  public listPatients = async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const patients = await this.patientRepository.listByTenant(tenantId, limit, offset);
      const total = await this.patientRepository.countByTenant(tenantId);

      res.status(200).json({
        patients,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + patients.length < total
        }
      });
    } catch (error) {
      logger.error('Error listing patients:', error);
      res.status(500).json({ error: 'Failed to list patients' });
    }
  };

  /**
   * Search patients by name
   */
  public searchPatients = async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId } = req.params;
      const { firstName, lastName } = req.query;

      if (!firstName && !lastName) {
        res.status(400).json({ error: 'At least one search parameter is required' });
        return;
      }

      const patients = await this.patientRepository.findByName(
        tenantId, 
        (firstName as string) || '', 
        (lastName as string) || ''
      );

      res.status(200).json({ patients });
    } catch (error) {
      logger.error('Error searching patients:', error);
      res.status(500).json({ error: 'Failed to search patients' });
    }
  };
} 