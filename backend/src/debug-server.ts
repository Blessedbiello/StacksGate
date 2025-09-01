import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { logger } from '@/utils/logger';
import { connectDatabase } from '@/utils/database';

// Load environment variables
dotenv.config();
console.log('✅ Environment loaded');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(cors());
app.use(express.json());
console.log('✅ Middleware configured');

// Import and test routes one by one
try {
  console.log('🔄 Loading health routes...');
  const healthRoutes = require('./routes/health').default;
  app.use('/api/v1/health', healthRoutes);
  console.log('✅ Health routes loaded');
} catch (error) {
  console.error('❌ Health routes failed:', error);
}

// Simple fallback health check
app.get('/api/v1/debug', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'StacksGate Debug API'
  });
});

console.log('✅ Routes configured');

// Debug startup
async function startDebugServer() {
  try {
    console.log('🔄 Starting database connection...');
    
    // Test database connection
    await connectDatabase();
    console.log('✅ Database connected successfully');

    // Start server
    app.listen(PORT, () => {
      console.log(`✅ StacksGate Debug API running on port ${PORT}`);
      logger.info(`Debug server started on port ${PORT}`);
    });

  } catch (error) {
    console.error('❌ Debug server failed:', error);
    process.exit(1);
  }
}

console.log('🚀 Starting debug server...');
startDebugServer();

export default app;