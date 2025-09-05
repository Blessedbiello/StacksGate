"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDatabase = connectDatabase;
exports.getDatabase = getDatabase;
exports.query = query;
exports.getClient = getClient;
exports.transaction = transaction;
exports.closeDatabase = closeDatabase;
const pg_1 = require("pg");
const logger_1 = require("./logger");
let pool;
async function connectDatabase() {
    if (!process.env.DATABASE_URL) {
        logger_1.logger.warn('Database connection skipped - DATABASE_URL not set');
        return null;
    }
    if (!pool) {
        pool = new pg_1.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
        pool.on('error', (err) => {
            logger_1.logger.error('Unexpected error on idle client', err);
        });
        try {
            const client = await pool.connect();
            await client.query('SELECT NOW()');
            client.release();
            logger_1.logger.info('Database connection established successfully');
        }
        catch (error) {
            logger_1.logger.error('Failed to establish database connection:', error);
            throw error;
        }
    }
    return pool;
}
function getDatabase() {
    if (!pool) {
        throw new Error('Database not initialized. Call connectDatabase() first.');
    }
    return pool;
}
async function query(text, params) {
    const db = getDatabase();
    const start = Date.now();
    try {
        const result = await db.query(text, params);
        const duration = Date.now() - start;
        logger_1.logger.debug('Database query executed', {
            query: text,
            duration: `${duration}ms`,
            rows: result.rowCount,
        });
        return result;
    }
    catch (error) {
        const duration = Date.now() - start;
        logger_1.logger.error('Database query failed', {
            query: text,
            params,
            duration: `${duration}ms`,
            error: error.message,
        });
        throw error;
    }
}
async function getClient() {
    const db = getDatabase();
    return db.connect();
}
async function transaction(callback) {
    const client = await getClient();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
async function closeDatabase() {
    if (pool) {
        await pool.end();
        logger_1.logger.info('Database connection pool closed');
    }
}
