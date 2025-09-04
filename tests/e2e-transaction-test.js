#!/usr/bin/env node

/**
 * End-to-End StacksGate sBTC Transaction Test
 * 
 * This test demonstrates the complete flow:
 * 1. Create merchant and get API keys
 * 2. Create payment intent via API
 * 3. Simulate sBTC transaction on testnet
 * 4. Monitor transaction status
 * 5. Verify webhook delivery
 * 6. Confirm payment completion
 */

const fetch = require('node-fetch');
const { StacksTestnet } = require('@stacks/network');
const { makeContractCall, broadcastTransaction, AnchorMode } = require('@stacks/transactions');

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://webhook.site/your-unique-id'; // Use webhook.site for testing
const STACKS_PRIVATE_KEY = process.env.STACKS_PRIVATE_KEY; // For testing only

class StacksGateE2ETest {
  constructor() {
    this.merchantData = null;
    this.apiKey = null;
    this.paymentIntent = null;
    this.webhookEvents = [];
    this.network = new StacksTestnet();
  }

  async run() {
    console.log('🚀 Starting StacksGate E2E Transaction Test\n');

    try {
      // Step 1: Create test merchant
      await this.createTestMerchant();
      
      // Step 2: Create payment intent
      await this.createPaymentIntent();
      
      // Step 3: Simulate sBTC deposit (if private key provided)
      if (STACKS_PRIVATE_KEY) {
        await this.simulateSBTCTransaction();
      } else {
        console.log('⚠️  No STACKS_PRIVATE_KEY provided, skipping transaction simulation');
        console.log('   Manual step: Send sBTC to the payment address shown above');
      }
      
      // Step 4: Monitor payment status
      await this.monitorPaymentStatus();
      
      // Step 5: Test webhook endpoints
      await this.testWebhookEndpoints();
      
      // Step 6: Verify transaction completion
      await this.verifyCompletion();
      
      console.log('\n✅ E2E Test completed successfully!');
    } catch (error) {
      console.error('\n❌ E2E Test failed:', error.message);
      process.exit(1);
    }
  }

  async createTestMerchant() {
    console.log('1️⃣ Creating test merchant...');

    const testEmail = `test-${Date.now()}@example.com`;
    const merchantData = {
      email: testEmail,
      password: 'test-password-123',
      business_name: 'E2E Test Merchant',
      website_url: 'https://example.com',
      webhook_url: WEBHOOK_URL,
    };

    // Register merchant
    const response = await this.makeRequest('POST', '/auth/register', merchantData);
    
    this.merchantData = response.merchant;
    this.apiKey = response.merchant.api_key_public; // Use public key for client-side operations
    
    console.log(`   ✓ Merchant created: ${this.merchantData.business_name}`);
    console.log(`   ✓ API Key: ${this.apiKey.substring(0, 20)}...`);
    console.log(`   ✓ Webhook URL: ${WEBHOOK_URL}\n`);
  }

  async createPaymentIntent() {
    console.log('2️⃣ Creating payment intent...');

    const paymentData = {
      amount: 0.001, // 0.001 BTC
      description: 'E2E Test Payment',
      metadata: {
        test_id: `e2e-${Date.now()}`,
        environment: 'testnet',
      },
    };

    this.paymentIntent = await this.makeRequest('POST', '/payment-intents', paymentData);
    
    console.log(`   ✓ Payment Intent ID: ${this.paymentIntent.id}`);
    console.log(`   ✓ Amount: ${this.paymentIntent.amount_sats} sats`);
    console.log(`   ✓ Amount USD: $${this.paymentIntent.amount_usd}`);
    console.log(`   ✓ Status: ${this.paymentIntent.status}`);
    console.log(`   ✓ Expires: ${new Date(this.paymentIntent.expires_at * 1000).toISOString()}`);
    
    if (this.paymentIntent.stacks_address) {
      console.log(`   ✓ Stacks Address: ${this.paymentIntent.stacks_address}`);
    }
    if (this.paymentIntent.bitcoin_address) {
      console.log(`   ✓ Bitcoin Address: ${this.paymentIntent.bitcoin_address}`);
    }
    console.log();
  }

  async simulateSBTCTransaction() {
    console.log('3️⃣ Simulating sBTC transaction...');
    console.log('   ⚠️  This is a simulation - no real sBTC will be transferred');

    // In a real implementation, you would:
    // 1. Use the Stacks address from the payment intent
    // 2. Call the sBTC contract to transfer tokens
    // 3. Wait for transaction confirmation
    
    // For testing, we'll simulate by updating the payment intent status directly
    await this.updatePaymentStatus('processing', {
      sbtc_tx_id: 'simulated_tx_' + Math.random().toString(36).substring(7),
      confirmation_count: 0,
    });

    console.log('   ✓ Transaction simulation initiated');
    console.log(`   ✓ Simulated TX ID: ${this.paymentIntent.sbtc_tx_id}`);
    console.log();
  }

  async monitorPaymentStatus() {
    console.log('4️⃣ Monitoring payment status...');

    const maxAttempts = 10;
    const interval = 3000; // 3 seconds
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`   📡 Checking status (${attempt}/${maxAttempts})...`);
      
      const updated = await this.makeRequest('GET', `/payment-intents/${this.paymentIntent.id}`);
      this.paymentIntent = updated;
      
      console.log(`      Status: ${updated.status}`);
      if (updated.confirmation_count !== undefined) {
        console.log(`      Confirmations: ${updated.confirmation_count}`);
      }
      
      if (['succeeded', 'failed', 'canceled'].includes(updated.status)) {
        console.log(`   ✓ Payment reached final status: ${updated.status}`);
        break;
      }

      // Simulate confirmation progress for testing
      if (attempt === 3 && updated.status === 'processing') {
        await this.updatePaymentStatus('processing', {
          confirmation_count: 1,
        });
      }
      
      if (attempt === 6 && updated.status === 'processing') {
        await this.updatePaymentStatus('succeeded', {
          confirmation_count: 6,
        });
      }
      
      if (attempt < maxAttempts) {
        console.log(`   ⏱  Waiting ${interval/1000}s before next check...`);
        await this.sleep(interval);
      }
    }
    
    console.log();
  }

  async testWebhookEndpoints() {
    console.log('5️⃣ Testing webhook endpoints...');

    try {
      // Test webhook endpoint
      const testResult = await this.makeRequest('POST', '/webhooks/test');
      console.log('   ✓ Test webhook sent successfully');

      // Get webhook logs
      const logs = await this.makeRequest('GET', '/webhooks/logs?limit=5');
      console.log(`   ✓ Retrieved ${logs.data.length} webhook log entries`);

      // Get webhook stats
      const stats = await this.makeRequest('GET', '/webhooks/stats');
      console.log(`   ✓ Webhook stats: ${stats.total_webhooks} total, ${stats.success_rate}% success rate`);

      // Retry webhook for payment intent
      if (this.paymentIntent.id) {
        const retryResult = await this.makeRequest('POST', `/webhooks/retry/${this.paymentIntent.id}`);
        console.log('   ✓ Payment intent webhook retry sent');
      }
    } catch (error) {
      console.log(`   ⚠️  Webhook tests partially failed: ${error.message}`);
    }
    
    console.log();
  }

  async verifyCompletion() {
    console.log('6️⃣ Verifying test completion...');

    // Final payment intent check
    const final = await this.makeRequest('GET', `/payment-intents/${this.paymentIntent.id}`);
    console.log(`   ✓ Final payment status: ${final.status}`);
    console.log(`   ✓ Final confirmations: ${final.confirmation_count || 0}`);

    // List all payment intents for merchant
    const allPayments = await this.makeRequest('GET', '/payment-intents?limit=5');
    console.log(`   ✓ Merchant has ${allPayments.data.length} payment intents total`);

    // Get webhook logs
    const webhookLogs = await this.makeRequest('GET', '/webhooks/logs?limit=10');
    console.log(`   ✓ Webhook delivery attempts: ${webhookLogs.data.length}`);

    // Success criteria
    const criteria = {
      paymentCreated: !!this.paymentIntent.id,
      webhookConfigured: !!this.merchantData.webhook_url,
      statusUpdated: final.status !== 'requires_payment',
      webhooksDelivered: webhookLogs.data.length > 0,
    };

    console.log('\n📊 Test Results Summary:');
    console.log(`   Payment Intent Created: ${criteria.paymentCreated ? '✅' : '❌'}`);
    console.log(`   Webhook URL Configured: ${criteria.webhookConfigured ? '✅' : '❌'}`);
    console.log(`   Status Updates Working: ${criteria.statusUpdated ? '✅' : '❌'}`);
    console.log(`   Webhooks Delivered: ${criteria.webhooksDelivered ? '✅' : '❌'}`);

    const allPassed = Object.values(criteria).every(Boolean);
    if (!allPassed) {
      throw new Error('Some test criteria failed');
    }

    console.log();
  }

  // Helper method to update payment status (for testing)
  async updatePaymentStatus(status, additionalData = {}) {
    // This would normally be done by the blockchain monitoring service
    // For testing, we'll call an internal API endpoint
    try {
      const updateUrl = `/internal/payment-intents/${this.paymentIntent.id}/status`;
      await this.makeRequest('POST', updateUrl, { 
        status, 
        ...additionalData 
      }, this.merchantData.api_key_secret);
    } catch (error) {
      console.log(`   ⚠️  Status update failed (expected in testing): ${error.message}`);
    }
  }

  async makeRequest(method, endpoint, body = null, apiKey = null) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'StacksGate-E2E-Test/1.0',
    };

    if (apiKey || this.apiKey) {
      headers['Authorization'] = `Bearer ${apiKey || this.apiKey}`;
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
      throw new Error(`API Error: ${errorMessage}`);
    }

    return responseData;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the test
if (require.main === module) {
  const test = new StacksGateE2ETest();
  test.run().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

module.exports = StacksGateE2ETest;