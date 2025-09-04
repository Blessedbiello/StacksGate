import express from 'express';
import cors from 'cors';
import { logger } from './utils/logger';
import paymentLinksRoutes from './routes/paymentLinks';

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// Body parsing middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Add payment links routes
app.use('/api/v1/payment-links', paymentLinksRoutes);

// Health check
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'StacksGate Payment Links Server',
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'StacksGate Payment Links API',
    version: '1.0.0',
    status: 'operational',
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 StacksGate Payment Links Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/v1/health`);
  console.log(`🔗 Payment Links API: http://localhost:${PORT}/api/v1/payment-links`);
});

export default app;