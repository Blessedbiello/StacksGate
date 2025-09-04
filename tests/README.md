# StacksGate Test Suite

This directory contains comprehensive tests for the StacksGate MVP, ensuring all components work correctly together.

## Test Overview

The test suite validates:
- ✅ API endpoints and authentication
- ✅ Payment intent lifecycle
- ✅ Webhook signature verification and delivery  
- ✅ Error handling and edge cases
- ✅ End-to-end transaction flow
- ✅ Security best practices

## Quick Start

### Prerequisites
1. StacksGate backend server running on `http://localhost:3000`
2. PostgreSQL database initialized
3. Node.js installed

### Run All Tests
```bash
cd tests
./run-tests.sh
```

### Run Individual Tests
```bash
# API integration tests
npm run test:api

# Webhook security tests  
npm run test:webhook

# Complete E2E test
npm run test
```

## Test Descriptions

### 1. API Integration Test (`api-test.js`)
Tests all REST API endpoints without requiring blockchain transactions:

- **Health Check**: Verifies API is running
- **Merchant Registration**: Creates test merchant account
- **Authentication**: Tests login and API key auth
- **Payment Intents**: Creates, updates, retrieves, cancels payments
- **Webhooks**: Tests webhook configuration and validation
- **Error Handling**: Validates proper error responses

### 2. Webhook Security Test (`webhook-test.js`)
Validates webhook signature verification and security:

- **Signature Generation**: Tests HMAC-SHA256 signature creation
- **Signature Verification**: Validates signature checking logic
- **Timestamp Validation**: Tests replay attack prevention
- **Invalid Signatures**: Ensures malformed signatures are rejected
- **Security Edge Cases**: Tests timing attacks, wrong secrets, reuse

### 3. End-to-End Transaction Test (`e2e-transaction-test.js`)
Simulates complete payment flow:

- **Merchant Setup**: Creates merchant with webhook URL
- **Payment Creation**: Creates payment intent via API
- **Transaction Simulation**: Simulates sBTC deposit and confirmation
- **Status Monitoring**: Tracks payment status changes
- **Webhook Delivery**: Verifies webhook events are sent
- **Completion Verification**: Confirms final payment state

## Configuration

### Environment Variables
```bash
# API endpoint (default: http://localhost:3000)
export API_URL="https://api.stacksgate.com"

# Webhook URL for testing (default: generated webhook.site URL)
export WEBHOOK_URL="https://your-webhook-endpoint.com"

# Optional: Stacks private key for real testnet transactions
export STACKS_PRIVATE_KEY="your-testnet-private-key"
```

### Using webhook.site for Testing
For easy webhook testing, use [webhook.site](https://webhook.site):

1. Visit https://webhook.site
2. Copy your unique URL
3. Set as `WEBHOOK_URL` environment variable
4. View webhook deliveries in real-time

## Expected Results

### ✅ Successful Test Run
```
🚀 StacksGate MVP Test Suite
==============================

🔍 Checking API availability...
✅ API is running

🧪 Running Webhook Security Test...
✅ Webhook Security Test PASSED

🧪 Running API Integration Test...  
✅ API Integration Test PASSED

🧪 Running End-to-End Transaction Test...
✅ End-to-End Transaction Test PASSED

==============================
📊 Test Summary
==============================
Total Tests: 3
Passed: 3
Failed: 0

🎉 All tests passed! StacksGate MVP is ready!
```

## Troubleshooting

### Common Issues

**API not available**
- Ensure backend server is running: `cd backend && npm run dev`
- Check database is initialized: `docker-compose up -d`
- Verify API_URL is correct

**Webhook delivery failures**
- Check webhook URL is accessible from internet
- Verify webhook endpoint returns HTTP 200
- Review webhook logs in StacksGate dashboard

**Permission denied on run-tests.sh**
```bash
chmod +x run-tests.sh
```

**Missing dependencies**
```bash
npm install
```

### Test Data Cleanup

Tests create temporary merchants and payment intents. These are automatically cleaned up, but you can manually clean the database:

```sql
-- Remove test merchants (careful in production!)
DELETE FROM merchants WHERE email LIKE '%test%@example.com';
```

## Development

### Adding New Tests

1. Create test file: `your-test.js`
2. Export test class with `run()` method
3. Add to `package.json` scripts
4. Update `run-tests.sh` to include new test

### Test Structure
```javascript
class YourTest {
  async run() {
    console.log('🧪 Starting Your Test');
    
    try {
      await this.testFeature();
      console.log('✅ Test passed!');
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      process.exit(1);
    }
  }

  async testFeature() {
    // Test implementation
  }
}
```

## Security Notes

- Tests use temporary credentials and test data
- Never use production API keys or secrets
- Webhook endpoints should validate signatures
- Clean up test data after runs

## Support

For test issues:
1. Check backend server logs
2. Review webhook delivery logs  
3. Verify network connectivity
4. Validate environment variables

The test suite ensures StacksGate MVP functions correctly across all components before deployment.