import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(cors());
app.use(express.json());

// Simple health check
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'StacksGate API is running'
  });
});

// Simple endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'StacksGate API',
    version: '1.0.0',
    status: 'operational'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ StacksGate API server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/api/v1/health`);
});

export default app;