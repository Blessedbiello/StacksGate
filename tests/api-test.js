#!/usr/bin/env node

/**
 * StacksGate API Integration Test
 * Tests all core API endpoints without requiring blockchain transactions
 */

const fetch = require('node-fetch');

class StacksGateAPITest {
  constructor() {
    this.baseUrl = process.env.API_URL || 'http://localhost:3000';
    this.merchantData = null;
    this.apiKey = null;
    this.paymentIntent = null;
  }

  async run() {
    console.log('🧪 Starting StacksGate API Integration Test\n');

    try {
      await this.testHealthEndpoint();
      await this.testMerchantRegistration();
      await this.testMerchantAuthentication();
      await this.testPaymentIntents();
      await this.testWebhookEndpoints();
      await this.testErrorHandling();

      console.log('\n✅ All API tests passed!');
    } catch (error) {
      console.error('\n❌ API test failed:', error.message);
      process.exit(1);
    }
  }

  async testHealthEndpoint() {
    console.log('🏥 Testing health endpoint...');
    
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('   ✓ Health check passed');
    console.log(`   ✓ Status: ${data.status}`);
    console.log();
  }

  async testMerchantRegistration() {
    console.log('👤 Testing merchant registration...');

    const testEmail = `api-test-${Date.now()}@example.com`;
    const merchantData = {
      email: testEmail,
      password: 'test-password-123',
      business_name: 'API Test Merchant',
      website_url: 'https://api-test.example.com',
    };

    const response = await this.makeRequest('POST', '/auth/register', merchantData);
    this.merchantData = response.merchant;
    
    console.log('   ✓ Merchant registration successful');
    console.log(`   ✓ Merchant ID: ${this.merchantData.id}`);
    console.log(`   ✓ Business: ${this.merchantData.business_name}`);
    console.log();
  }

  async testMerchantAuthentication() {
    console.log('🔐 Testing merchant authentication...');

    // Test login
    const loginData = {
      email: this.merchantData.email,
      password: 'test-password-123',
    };

    const loginResponse = await this.makeRequest('POST', '/auth/login', loginData);
    console.log('   ✓ Login successful');

    // Test API key authentication
    this.apiKey = this.merchantData.api_key_public;
    const profileResponse = await this.makeRequest('GET', '/auth/profile');
    console.log('   ✓ API key authentication working');
    console.log(`   ✓ Profile retrieved for: ${profileResponse.business_name}`);
    console.log();
  }

  async testPaymentIntents() {
    console.log('💰 Testing payment intents...');

    // Create payment intent
    const paymentData = {
      amount: 0.0005, // 0.0005 BTC
      description: 'API Test Payment',
      metadata: {
        test_type: 'api_integration',
        timestamp: new Date().toISOString(),
      },
    };

    this.paymentIntent = await this.makeRequest('POST', '/payment-intents', paymentData);
    console.log('   ✓ Payment intent created');
    console.log(`   ✓ ID: ${this.paymentIntent.id}`);
    console.log(`   ✓ Amount: ${this.paymentIntent.amount_sats} sats`);

    // Retrieve payment intent
    const retrieved = await this.makeRequest('GET', `/payment-intents/${this.paymentIntent.id}`);
    console.log('   ✓ Payment intent retrieved');

    // Update payment intent
    const updateData = {
      description: 'Updated API Test Payment',
      metadata: { ...paymentData.metadata, updated: true },
    };
    
    const updated = await this.makeRequest('POST', `/payment-intents/${this.paymentIntent.id}`, updateData);
    console.log('   ✓ Payment intent updated');

    // List payment intents
    const list = await this.makeRequest('GET', '/payment-intents?limit=10');
    console.log(`   ✓ Listed ${list.data.length} payment intents`);

    // Test cancellation
    const canceled = await this.makeRequest('POST', `/payment-intents/${this.paymentIntent.id}/cancel`, {
      cancellation_reason: 'API test cleanup'
    });
    console.log('   ✓ Payment intent canceled');
    console.log();
  }

  async testWebhookEndpoints() {
    console.log('📡 Testing webhook endpoints...');

    // Update webhook URL
    const webhookData = {
      webhook_url: 'https://webhook.site/api-test',
    };

    await this.makeRequest('POST', '/merchants/webhook', webhookData);
    console.log('   ✓ Webhook URL updated');

    // Test webhook validation
    const validationResponse = await this.makeRequest('POST', '/webhooks/validate', {
      webhook_url: 'https://httpbin.org/status/200',
    });
    console.log(`   ✓ Webhook validation: ${validationResponse.valid}`);

    // Get webhook logs
    const logs = await this.makeRequest('GET', '/webhooks/logs?limit=5');
    console.log(`   ✓ Retrieved ${logs.data.length} webhook logs`);

    // Get webhook stats
    const stats = await this.makeRequest('GET', '/webhooks/stats');
    console.log(`   ✓ Webhook stats: ${stats.total_webhooks} total`);
    console.log();
  }

  async testErrorHandling() {
    console.log('⚠️  Testing error handling...');

    try {
      // Test invalid payment intent
      await this.makeRequest('GET', '/payment-intents/invalid_id');
      throw new Error('Should have failed for invalid payment intent');
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('404')) {
        console.log('   ✓ Invalid payment intent handled correctly');
      } else {
        throw error;
      }
    }

    try {
      // Test invalid request data
      await this.makeRequest('POST', '/payment-intents', { amount: -1 });
      throw new Error('Should have failed for negative amount');
    } catch (error) {
      if (error.message.includes('positive') || error.message.includes('400')) {
        console.log('   ✓ Invalid request data handled correctly');
      } else {
        throw error;
      }
    }

    try {
      // Test unauthorized access
      const originalKey = this.apiKey;
      this.apiKey = 'invalid_key';
      await this.makeRequest('GET', '/auth/profile');
      throw new Error('Should have failed for invalid API key');
    } catch (error) {
      if (error.message.includes('Unauthorized') || error.message.includes('401')) {
        console.log('   ✓ Invalid API key handled correctly');
        this.apiKey = originalKey; // Restore valid key
      } else {
        throw error;
      }
    }

    console.log();
  }

  async makeRequest(method, endpoint, body = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'StacksGate-API-Test/1.0',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const options = {
      method,
      headers,
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    let responseData;
    try {
      responseData = await response.json();
    } catch (error) {
      responseData = { message: await response.text() };
    }

    if (!response.ok) {
      const errorMessage = responseData.error?.message || responseData.message || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    return responseData;
  }
}

// Run the test
if (require.main === module) {
  const test = new StacksGateAPITest();
  test.run().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

module.exports = StacksGateAPITest;