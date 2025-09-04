import { Pool, PoolClient } from 'pg';

export { PoolClient };
import { logger } from './logger';

let pool: Pool;

export async function connectDatabase(): Promise<Pool | null> {
  // Skip database connection if not available
  if (!process.env.DATABASE_URL) {
    logger.warn('Database connection skipped - DATABASE_URL not set');
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
    });

    // Handle pool errors
    pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
    });

    // Test the connection
    try {
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      logger.info('Database connection established successfully');
    } catch (error) {
      logger.error('Failed to establish database connection:', error);
      throw error;
    }
  }

  return pool;
}

export function getDatabase(): Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call connectDatabase() first.');
  }
  return pool;
}

export async function query(text: string, params?: any[]): Promise<any> {
  const db = getDatabase();
  const start = Date.now();
  
  try {
    const result = await db.query(text, params);
    const duration = Date.now() - start;
    
    logger.debug('Database query executed', {
      query: text,
      duration: `${duration}ms`,
      rows: result.rowCount,
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('Database query failed', {
      query: text,
      params,
      duration: `${duration}ms`,
      error: (error as Error).message,
    });
    throw error;
  }
}

export async function getClient(): Promise<PoolClient> {
  const db = getDatabase();
  return db.connect();
}

export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Graceful shutdown
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    logger.info('Database connection pool closed');
  }
}