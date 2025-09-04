# StacksGate MVP Deployment Guide

This guide covers deploying the StacksGate MVP to production, including all components: backend API, frontend dashboard, and payment widget.

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │     Backend      │    │   PostgreSQL    │
│   Dashboard     │◄──►│      API         │◄──►│   Database      │
│ (React + Vite)  │    │ (Node.js + TS)   │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         ▲                        ▲                       ▲
         │                        │                       │
         ▼                        ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Payment Widget │    │  Stacks Testnet  │    │     Redis       │
│  (Vanilla JS)   │    │  sBTC Integration│    │    Cache        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Prerequisites

### System Requirements
- Node.js 18+ 
- PostgreSQL 13+
- Redis 6+ (optional, for caching)
- Docker & Docker Compose (for development)
- SSL certificate (for production webhooks)

### External Dependencies
- Domain name with SSL certificate
- Stacks testnet access
- Email service (for notifications)

## Environment Configuration

### Backend Environment (.env)
```bash
# Database
DATABASE_URL=postgresql://stacksgate:password@localhost:5432/stacksgate
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=stacksgate
POSTGRES_USER=stacksgate
POSTGRES_PASSWORD=your_secure_password

# Redis (optional)
REDIS_URL=redis://localhost:6379

# API Configuration
PORT=3000
NODE_ENV=production
API_URL=https://api.stacksgate.com

# Security
JWT_SECRET=your_jwt_secret_min_32_chars
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=12

# Stacks Configuration
STACKS_NETWORK=testnet
STACKS_API_URL=https://api.testnet.hiro.so
SBTC_CONTRACT_ADDRESS=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM
SBTC_CONTRACT_NAME=sbtc-token

# CORS
CORS_ORIGIN=https://dashboard.stacksgate.com,https://stacksgate.com

# Webhook Configuration  
WEBHOOK_TIMEOUT_MS=10000
MAX_WEBHOOK_RETRIES=3

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

### Frontend Environment (.env)
```bash
VITE_API_URL=https://api.stacksgate.com
VITE_WIDGET_URL=https://widget.stacksgate.com
VITE_APP_NAME=StacksGate
VITE_STACKS_NETWORK=testnet
```

## Deployment Options

### Option 1: Docker Deployment (Recommended)

#### 1. Create Production Docker Compose
```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: stacksgate
      POSTGRES_USER: stacksgate
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/sql/init.sql:/docker-entrypoint-initdb.d/init.sql
    restart: unless-stopped
    
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data
      
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    environment:
      - DATABASE_URL=postgresql://stacksgate:${POSTGRES_PASSWORD}@postgres:5432/stacksgate
      - REDIS_URL=redis://redis:6379
      - NODE_ENV=production
    depends_on:
      - postgres
      - redis
    ports:
      - "3000:3000"
    restart: unless-stopped
    
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./ssl:/etc/ssl/certs
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

#### 2. Create Production Dockerfiles

**Backend Dockerfile.prod**
```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**Frontend Dockerfile.prod**
```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
```

#### 3. Deploy with Docker
```bash
# Clone repository
git clone https://github.com/your-org/stacksgate.git
cd stacksgate

# Set environment variables
cp .env.example .env
# Edit .env with production values

# Deploy
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f backend
```

### Option 2: VPS/Cloud Deployment

#### 1. Server Setup (Ubuntu 22.04)
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Install Redis
sudo apt install redis-server -y

# Install PM2 for process management
sudo npm install -g pm2

# Install Nginx
sudo apt install nginx -y

# Install Certbot for SSL
sudo apt install certbot python3-certbot-nginx -y
```

#### 2. Database Setup
```bash
# Create database and user
sudo -u postgres psql
CREATE DATABASE stacksgate;
CREATE USER stacksgate WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE stacksgate TO stacksgate;
\q

# Initialize schema
psql -U stacksgate -d stacksgate -f backend/sql/init.sql
```

#### 3. Application Deployment
```bash
# Clone and setup
git clone https://github.com/your-org/stacksgate.git
cd stacksgate

# Backend
cd backend
npm ci
npm run build
pm2 start dist/index.js --name stacksgate-api

# Frontend  
cd ../frontend
npm ci
npm run build
sudo cp -r dist/* /var/www/html/

# Widget
cd ../widget
npm ci
npm run build
sudo cp -r dist/* /var/www/widget/
```

#### 4. Nginx Configuration
```nginx
# /etc/nginx/sites-available/stacksgate
server {
    listen 80;
    server_name api.stacksgate.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name dashboard.stacksgate.com;
    root /var/www/html;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    server_name widget.stacksgate.com;
    root /var/www/widget;
    index index.html;
    
    location / {
        try_files $uri $uri/ =404;
    }
    
    # CORS headers for widget
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
    add_header Access-Control-Allow-Headers "Content-Type";
}
```

#### 5. SSL Setup
```bash
# Enable sites
sudo ln -s /etc/nginx/sites-available/stacksgate /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificates
sudo certbot --nginx -d api.stacksgate.com -d dashboard.stacksgate.com -d widget.stacksgate.com
```

### Option 3: Cloud Platform Deployment

#### Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy backend
cd backend
railway login
railway init
railway add
railway deploy

# Deploy frontend
cd ../frontend
railway init
railway add
railway deploy
```

#### Vercel (Frontend only)
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy frontend
cd frontend
vercel --prod

# Deploy widget
cd ../widget  
vercel --prod
```

#### DigitalOcean App Platform
```yaml
# .do/app.yaml
name: stacksgate
services:
- name: backend
  source_dir: backend
  github:
    repo: your-org/stacksgate
    branch: main
  run_command: npm start
  environment_slug: node-js
  instance_count: 1
  instance_size_slug: basic-xxs
  envs:
  - key: DATABASE_URL
    value: ${DATABASE_URL}
  - key: NODE_ENV
    value: production

- name: frontend
  source_dir: frontend
  github:
    repo: your-org/stacksgate
    branch: main
  build_command: npm run build
  output_dir: dist
  environment_slug: node-js
  instance_count: 1
  instance_size_slug: basic-xxs

databases:
- name: stacksgate-db
  engine: PG
  version: "13"
```

## Post-Deployment Steps

### 1. Health Checks
```bash
# API health
curl https://api.stacksgate.com/health

# Dashboard
curl -I https://dashboard.stacksgate.com

# Widget
curl -I https://widget.stacksgate.com
```

### 2. Test Transaction Flow
```bash
cd tests
export API_URL=https://api.stacksgate.com
export WEBHOOK_URL=https://your-webhook.example.com
./run-tests.sh
```

### 3. Monitoring Setup
```bash
# PM2 monitoring
pm2 monit

# Set up log rotation
pm2 install pm2-logrotate

# Database monitoring
sudo systemctl status postgresql
```

### 4. Backup Configuration
```bash
# Database backup script
#!/bin/bash
pg_dump -U stacksgate stacksgate > backup-$(date +%Y%m%d-%H%M%S).sql
# Upload to S3 or similar
```

## Security Checklist

- [ ] SSL certificates installed and auto-renewal configured
- [ ] Database credentials secured and rotated
- [ ] JWT secrets are cryptographically secure (32+ chars)
- [ ] CORS properly configured for production domains
- [ ] Rate limiting enabled on API endpoints
- [ ] Database access restricted to application servers
- [ ] Webhook endpoints validate signatures
- [ ] Environment variables secured (not in source code)
- [ ] Regular security updates applied
- [ ] Monitoring and alerting configured

## Scaling Considerations

### Performance Optimization
- Enable Redis caching for Bitcoin price and balance queries
- Implement database connection pooling
- Add CDN for widget and static assets
- Configure gzip compression in Nginx
- Optimize database queries with indexes

### High Availability
- Multiple backend instances behind load balancer
- Database read replicas for scaling reads
- Redis cluster for cache availability
- Multi-region deployment for global users

### Monitoring
- Application metrics (response times, error rates)
- Infrastructure metrics (CPU, memory, disk)
- Business metrics (payment volume, success rates)
- Log aggregation and analysis

## Support

For deployment issues:
1. Check application logs: `pm2 logs stacksgate-api`
2. Verify database connectivity: `psql -U stacksgate -d stacksgate -c "SELECT 1;"`
3. Test API endpoints with curl
4. Check Nginx error logs: `sudo tail -f /var/log/nginx/error.log`

The StacksGate MVP is now production-ready with proper security, monitoring, and scalability considerations.