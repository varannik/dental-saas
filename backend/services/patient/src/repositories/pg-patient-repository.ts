import { Pool, QueryResult } from 'pg';
import { Patient, PatientRepository } from '../../../../database/models/patient-models';

/**
 * PostgreSQL implementation of the Patient Repository
 */
export class PgPatientRepository implements PatientRepository {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Create a new patient record
   */
  async create(tenantId: string, patient: Omit<Patient, 'id' | 'created_at' | 'updated_at'>): Promise<Patient> {
    const schemaName = `tenant_${tenantId}`;
    const query = `
      INSERT INTO ${schemaName}.patients (
        first_name, 
        last_name, 
        date_of_birth, 
        gender, 
        email, 
        phone, 
        address, 
        emergency_contact_name, 
        emergency_contact_phone, 
        insurance_provider, 
        insurance_policy_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `;

    const values = [
      patient.first_name,
      patient.last_name,
      patient.date_of_birth,
      patient.gender || null,
      patient.email || null,
      patient.phone || null,
      patient.address || null,
      patient.emergency_contact_name || null,
      patient.emergency_contact_phone || null,
      patient.insurance_provider || null,
      patient.insurance_policy_number || null
    ];

    try {
      const result: QueryResult = await this.pool.query(query, values);
      return this.mapRowToPatient(result.rows[0]);
    } catch (error) {
      console.error('Error creating patient:', error);
      throw new Error(`Failed to create patient: ${error.message}`);
    }
  }

  /**
   * Find a patient by ID
   */
  async findById(tenantId: string, id: string): Promise<Patient | null> {
    const schemaName = `tenant_${tenantId}`;
    const query = `
      SELECT * FROM ${schemaName}.patients
      WHERE id = $1;
    `;

    try {
      const result: QueryResult = await this.pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToPatient(result.rows[0]);
    } catch (error) {
      console.error(`Error finding patient with id ${id}:`, error);
      throw new Error(`Failed to find patient: ${error.message}`);
    }
  }

  /**
   * Find patients by name
   */
  async findByName(tenantId: string, firstName: string, lastName: string): Promise<Patient[]> {
    const schemaName = `tenant_${tenantId}`;
    const query = `
      SELECT * FROM ${schemaName}.patients
      WHERE first_name ILIKE $1 AND last_name ILIKE $2
      ORDER BY last_name, first_name;
    `;

    try {
      const result: QueryResult = await this.pool.query(query, [`%${firstName}%`, `%${lastName}%`]);
      return result.rows.map(this.mapRowToPatient);
    } catch (error) {
      console.error(`Error finding patients with name ${firstName} ${lastName}:`, error);
      throw new Error(`Failed to find patients by name: ${error.message}`);
    }
  }

  /**
   * Update a patient record
   */
  async update(tenantId: string, id: string, data: Partial<Patient>): Promise<Patient> {
    const schemaName = `tenant_${tenantId}`;
    
    // Build dynamic update query based on provided fields
    const setClause: string[] = [];
    const values: any[] = [];
    let paramCounter = 1;

    // Add each field to update
    Object.entries(data).forEach(([key, value]) => {
      // Skip id and timestamps as they shouldn't be manually updated
      if (!['id', 'created_at', 'updated_at'].includes(key)) {
        setClause.push(`${key} = $${paramCounter}`);
        values.push(value);
        paramCounter++;
      }
    });

    // Always update the updated_at timestamp
    setClause.push(`updated_at = CURRENT_TIMESTAMP`);
    
    // Add the ID as the last parameter for the WHERE clause
    values.push(id);

    const query = `
      UPDATE ${schemaName}.patients
      SET ${setClause.join(', ')}
      WHERE id = $${paramCounter}
      RETURNING *;
    `;

    try {
      const result: QueryResult = await this.pool.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error(`Patient with ID ${id} not found`);
      }
      
      return this.mapRowToPatient(result.rows[0]);
    } catch (error) {
      console.error(`Error updating patient with id ${id}:`, error);
      throw new Error(`Failed to update patient: ${error.message}`);
    }
  }

  /**
   * Delete a patient record
   */
  async delete(tenantId: string, id: string): Promise<boolean> {
    const schemaName = `tenant_${tenantId}`;
    const query = `
      DELETE FROM ${schemaName}.patients
      WHERE id = $1
      RETURNING id;
    `;

    try {
      const result: QueryResult = await this.pool.query(query, [id]);
      return result.rowCount > 0;
    } catch (error) {
      console.error(`Error deleting patient with id ${id}:`, error);
      throw new Error(`Failed to delete patient: ${error.message}`);
    }
  }

  /**
   * List patients for a tenant
   */
  async listByTenant(tenantId: string, limit: number = 50, offset: number = 0): Promise<Patient[]> {
    const schemaName = `tenant_${tenantId}`;
    const query = `
      SELECT * FROM ${schemaName}.patients
      ORDER BY last_name, first_name
      LIMIT $1 OFFSET $2;
    `;

    try {
      const result: QueryResult = await this.pool.query(query, [limit, offset]);
      return result.rows.map(this.mapRowToPatient);
    } catch (error) {
      console.error(`Error listing patients for tenant ${tenantId}:`, error);
      throw new Error(`Failed to list patients: ${error.message}`);
    }
  }

  /**
   * Count total patients for a tenant
   */
  async countByTenant(tenantId: string): Promise<number> {
    const schemaName = `tenant_${tenantId}`;
    const query = `
      SELECT COUNT(*) as count FROM ${schemaName}.patients;
    `;

    try {
      const result: QueryResult = await this.pool.query(query);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      console.error(`Error counting patients for tenant ${tenantId}:`, error);
      throw new Error(`Failed to count patients: ${error.message}`);
    }
  }

  /**
   * Helper method to map database row to Patient interface
   */
  private mapRowToPatient(row: any): Patient {
    return {
      id: row.id,
      first_name: row.first_name,
      last_name: row.last_name,
      date_of_birth: row.date_of_birth,
      gender: row.gender,
      email: row.email,
      phone: row.phone,
      address: row.address,
      emergency_contact_name: row.emergency_contact_name,
      emergency_contact_phone: row.emergency_contact_phone,
      insurance_provider: row.insurance_provider,
      insurance_policy_number: row.insurance_policy_number,
      last_visit_date: row.last_visit_date,
      next_appointment_date: row.next_appointment_date,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
} 