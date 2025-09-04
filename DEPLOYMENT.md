# StacksGate Vercel Deployment Guide

This guide explains how to deploy StacksGate to Vercel for production use.

## Overview

StacksGate consists of three main components that need to be deployed separately:

1. **Frontend** - React dashboard for merchants
2. **Backend** - Node.js API server (deployed as Vercel serverless functions)
3. **Widget** - JavaScript SDK for payment integration

## Prerequisites

- Vercel account
- PostgreSQL database (Supabase, Neon, or similar)
- Redis instance (Upstash or similar)

## Deployment Steps

### 1. Frontend Deployment

Deploy the merchant dashboard:

```bash
cd frontend
vercel --prod
```

**Environment Variables to set in Vercel:**
- `VITE_API_URL`: Your backend API URL (e.g., `https://your-api.vercel.app/api/v1`)
- `VITE_WIDGET_URL`: Your widget CDN URL (e.g., `https://your-widget.vercel.app/stacksgate.js`)
- `VITE_APP_NAME`: `StacksGate`
- `VITE_STACKS_NETWORK`: `testnet` or `mainnet`

### 2. Backend Deployment

Deploy the API server as serverless functions:

```bash
cd backend
vercel --prod
```

**Environment Variables to set in Vercel:**
- `NODE_ENV`: `production`
- `DATABASE_URL`: Your PostgreSQL connection string
- `REDIS_URL`: Your Redis connection string
- `JWT_SECRET`: A secure random string for JWT signing
- `JWT_EXPIRES_IN`: `24h`
- `CORS_ORIGIN`: Comma-separated list of allowed origins (frontend and widget URLs)
- `RATE_LIMIT_WINDOW_MS`: `900000` (15 minutes)
- `RATE_LIMIT_MAX_REQUESTS`: `100`
- `API_VERSION`: `v1`

### 3. Widget Deployment

Deploy the JavaScript SDK:

```bash
cd widget
vercel --prod
```

The widget will be available at `https://your-widget.vercel.app/stacksgate.js`

## Database Setup

1. Create a PostgreSQL database
2. Run the SQL scripts in `backend/sql/` to create tables:
   - `01_merchants.sql`
   - `02_payment_intents.sql`
   - `03_payment_links.sql`
   - `04_subscriptions.sql`

## Verification

After deployment, verify everything works:

1. **Frontend**: Visit your frontend URL and try logging in
2. **Backend**: Check `https://your-api.vercel.app/api/v1/health`
3. **Widget**: Load `https://your-widget.vercel.app/stacksgate.js` in browser

## Configuration Files

Each component has its Vercel configuration:

- `frontend/vercel.json` - SPA routing configuration
- `backend/vercel.json` - Serverless functions configuration  
- `widget/vercel.json` - Static build with CORS headers

## Production Checklist

- [ ] Frontend deployed and accessible
- [ ] Backend API deployed and health check passes
- [ ] Widget CDN deployed and JavaScript loads
- [ ] Database connected and tables created
- [ ] Redis connected (optional but recommended)
- [ ] Environment variables configured
- [ ] CORS properly configured for all domains
- [ ] SSL certificates active (automatic with Vercel)
- [ ] Custom domains configured (optional)

## Troubleshooting

### Common Issues

1. **CORS errors**: Ensure all frontend/widget URLs are in `CORS_ORIGIN`
2. **Database connection**: Verify `DATABASE_URL` format and credentials
3. **Environment variables**: Check all required variables are set in Vercel dashboard
4. **Build failures**: Ensure all dependencies are in `package.json`

### Debug Steps

1. Check Vercel function logs in dashboard
2. Test API endpoints with curl or Postman
3. Verify database connectivity
4. Check browser console for client-side errors

## Support

For deployment issues, check:
- Vercel deployment logs
- Database connection status
- Environment variable configuration
- CORS settings in backend












