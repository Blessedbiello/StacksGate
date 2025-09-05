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
    
    // Parse SQL statements properly handling multi-line statements and dollar quotes
    const statements = parseSQLStatements(sqlContent);

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

function parseSQLStatements(sqlContent: string): string[] {
  const statements: string[] = [];
  let currentStatement = '';
  let inDollarQuote = false;
  let dollarQuoteTag = '';
  let inSingleLineComment = false;
  let inMultiLineComment = false;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  
  const lines = sqlContent.split('\n');
  
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    let line = lines[lineNum];
    
    // Skip empty lines when not inside a statement
    if (!currentStatement.trim() && !line.trim()) {
      continue;
    }
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1] || '';
      const prevChar = line[i - 1] || '';
      
      // Handle single line comments
      if (!inDollarQuote && !inSingleQuote && !inDoubleQuote && !inMultiLineComment) {
        if (char === '-' && nextChar === '-') {
          inSingleLineComment = true;
          continue;
        }
      }
      
      // Handle multi-line comments
      if (!inDollarQuote && !inSingleQuote && !inDoubleQuote && !inSingleLineComment) {
        if (char === '/' && nextChar === '*') {
          inMultiLineComment = true;
          i++; // skip next char
          continue;
        }
      }
      
      if (inMultiLineComment && char === '*' && nextChar === '/') {
        inMultiLineComment = false;
        i++; // skip next char
        continue;
      }
      
      // Skip if in comment
      if (inSingleLineComment || inMultiLineComment) {
        continue;
      }
      
      // Handle dollar quotes
      if (!inSingleQuote && !inDoubleQuote && char === '$') {
        if (!inDollarQuote) {
          // Start of dollar quote - find the tag
          const dollarEnd = line.indexOf('$', i + 1);
          if (dollarEnd !== -1) {
            dollarQuoteTag = line.substring(i, dollarEnd + 1);
            inDollarQuote = true;
            currentStatement += char;
            continue;
          }
        } else {
          // Check if this ends the dollar quote
          const possibleEndTag = line.substring(i, i + dollarQuoteTag.length);
          if (possibleEndTag === dollarQuoteTag) {
            inDollarQuote = false;
            currentStatement += dollarQuoteTag;
            i += dollarQuoteTag.length - 1; // Skip the tag
            dollarQuoteTag = '';
            continue;
          }
        }
      }
      
      // Handle regular quotes (only if not in dollar quote)
      if (!inDollarQuote) {
        if (char === "'" && prevChar !== '\\') {
          inSingleQuote = !inSingleQuote;
        } else if (char === '"' && prevChar !== '\\') {
          inDoubleQuote = !inDoubleQuote;
        }
        
        // Handle statement termination
        if (char === ';' && !inSingleQuote && !inDoubleQuote) {
          currentStatement += char;
          const statement = currentStatement.trim();
          if (statement && !statement.startsWith('--')) {
            statements.push(statement);
          }
          currentStatement = '';
          continue;
        }
      }
      
      currentStatement += char;
    }
    
    // Reset single line comment at end of line
    if (inSingleLineComment) {
      inSingleLineComment = false;
    }
    
    // Add newline to preserve line breaks in multi-line statements
    if (currentStatement.trim()) {
      currentStatement += '\n';
    }
  }
  
  // Add any remaining statement
  const finalStatement = currentStatement.trim();
  if (finalStatement && !finalStatement.startsWith('--')) {
    statements.push(finalStatement);
  }
  
  return statements;
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