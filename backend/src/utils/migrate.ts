import * as fs from 'fs';
import * as path from 'path';
import { getDatabase, query } from './database';
import { logger } from './logger';

export async function runMigrations(): Promise<boolean> {
  try {
    logger.info('Starting database migration check...');

    // Check if merchants table exists (key table to determine if DB is initialized)
    const tableExists = await checkTableExists('merchants');
    
    if (tableExists) {
      logger.info('Database already initialized - skipping migration');
      return true;
    }

    logger.info('Database not initialized - running migrations...');
    
    // Read the SQL schema file - try multiple possible paths
    const possiblePaths = [
      path.join(__dirname, '../../sql/init.sql'),      // Development
      path.join(process.cwd(), 'sql/init.sql'),        // Production (Render)
      path.join(process.cwd(), 'backend/sql/init.sql'), // Production (with backend folder)
    ];
    
    let sqlPath = '';
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        sqlPath = testPath;
        break;
      }
    }
    
    if (!sqlPath) {
      logger.error('Migration failed: init.sql file not found. Tried paths:', possiblePaths);
      return false;
    }
    
    logger.info(`Using SQL schema file: ${sqlPath}`);

    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Split by semicolons and execute each statement
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    logger.info(`Executing ${statements.length} migration statements...`);

    // Execute each SQL statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        await query(statement);
        logger.debug(`Migration statement ${i + 1}/${statements.length} executed successfully`);
      } catch (error) {
        // Some statements might fail if they already exist (like CREATE EXTENSION)
        // Log as warning but continue
        logger.warn(`Migration statement ${i + 1} failed (may be expected):`, {
          statement: statement.substring(0, 100) + '...',
          error: (error as Error).message
        });
      }
    }

    // Verify migration was successful
    const verifyResult = await checkTableExists('merchants');
    if (!verifyResult) {
      logger.error('Migration verification failed - merchants table not found');
      return false;
    }

    logger.info('Database migration completed successfully');
    return true;

  } catch (error) {
    logger.error('Migration failed:', error);
    return false;
  }
}

async function checkTableExists(tableName: string): Promise<boolean> {
  try {
    const result = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );
    `, [tableName]);
    
    return result.rows[0]?.exists || false;
  } catch (error) {
    logger.error(`Error checking if table ${tableName} exists:`, error);
    return false;
  }
}

export async function getMigrationStatus(): Promise<{
  initialized: boolean;
  tables: string[];
}> {
  try {
    // Get list of tables in the database
    const result = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    const tables = result.rows.map((row: any) => row.table_name);
    const initialized = tables.includes('merchants');
    
    return { initialized, tables };
  } catch (error) {
    logger.error('Error getting migration status:', error);
    return { initialized: false, tables: [] };
  }
}