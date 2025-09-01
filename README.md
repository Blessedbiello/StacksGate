# StacksGate - sBTC Payment Gateway

A complete sBTC payment gateway solution built on Stacks blockchain, providing Stripe-like API for Bitcoin payments.

## 🚀 Quick Start

### Development Setup

1. **Clone and Setup**
   ```bash
   git clone <your-repo>
   cd StacksGate
   docker-compose up -d
   ```

2. **Install Dependencies**
   ```bash
   # Backend
   cd backend && npm install
   
   # Frontend
   cd ../frontend && npm install
   
   # Widget
   cd ../widget && npm install
   ```

3. **Environment Configuration**
   ```bash
   cp backend/.env.example backend/.env
   # Configure your environment variables
   ```

4. **Run Development Servers**
   ```bash
   # Backend API
   cd backend && npm run dev
   
   # Frontend Dashboard  
   cd frontend && npm run dev
   
   # Widget Development
   cd widget && npm run dev
   ```

## 📖 Documentation

- [API Documentation](./docs/api.md)
- [Integration Guide](./docs/integration.md) 
- [Widget Reference](./docs/widget.md)

## 🏗️ Architecture

```
StacksGate/
├── backend/        # Node.js API server
├── frontend/       # React merchant dashboard  
├── widget/         # Embeddable payment widget
├── contracts/      # Clarity smart contracts
└── docs/          # Documentation
```

## 🔧 Technology Stack

- **Backend**: Node.js, Express, TypeScript, PostgreSQL
- **Frontend**: React, TypeScript, Tailwind CSS
- **Blockchain**: Stacks.js, Clarity smart contracts  
- **Widget**: Vanilla JavaScript/TypeScript

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.