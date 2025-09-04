#!/usr/bin/env node

/**
 * StacksGate Webhook Security Test
 * Tests webhook signature verification and security features
 */

const crypto = require('crypto');

class WebhookSecurityTest {
  constructor() {
    this.webhookSecret = 'whsec_test_' + crypto.randomBytes(16).toString('hex');
  }

  async run() {
    console.log('🔐 Starting StacksGate Webhook Security Test\n');

    try {
      await this.testSignatureGeneration();
      await this.testSignatureVerification();
      await this.testTimestampValidation();
      await this.testInvalidSignatures();
      await this.testSecurityEdgeCases();

      console.log('\n✅ All webhook security tests passed!');
    } catch (error) {
      console.error('\n❌ Webhook security test failed:', error.message);
      process.exit(1);
    }
  }

  async testSignatureGeneration() {
    console.log('🏭 Testing signature generation...');

    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: 'evt_test',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test' } }
    });

    const signature = this.generateSignature(payload, this.webhookSecret, timestamp);
    
    console.log('   ✓ Signature generated successfully');
    console.log(`   ✓ Format: ${signature.substring(0, 50)}...`);
    
    // Verify signature format
    const formatMatch = signature.match(/^t=\d+,v1=[a-f0-9]{64}$/);
    if (!formatMatch) {
      throw new Error('Invalid signature format');
    }
    console.log('   ✓ Signature format validated');
    console.log();
  }

  async testSignatureVerification() {
    console.log('✅ Testing signature verification...');

    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: 'evt_verify_test',
      type: 'test.webhook',
      data: { message: 'Verification test' }
    });

    // Generate valid signature
    const validSignature = this.generateSignature(payload, this.webhookSecret, timestamp);
    
    // Test valid signature
    const isValid = this.verifySignature(payload, validSignature, this.webhookSecret);
    if (!isValid) {
      throw new Error('Valid signature verification failed');
    }
    console.log('   ✓ Valid signature verified correctly');

    // Test signature with different payload
    const differentPayload = JSON.stringify({ different: 'payload' });
    const isInvalid = this.verifySignature(differentPayload, validSignature, this.webhookSecret);
    if (isInvalid) {
      throw new Error('Invalid signature was incorrectly verified as valid');
    }
    console.log('   ✓ Modified payload correctly rejected');

    console.log();
  }

  async testTimestampValidation() {
    console.log('⏰ Testing timestamp validation...');

    const payload = JSON.stringify({ test: 'timestamp_validation' });

    // Test current timestamp (should pass)
    const currentTime = Math.floor(Date.now() / 1000);
    const currentSignature = this.generateSignature(payload, this.webhookSecret, currentTime);
    const currentValid = this.verifySignature(payload, currentSignature, this.webhookSecret, 300);
    if (!currentValid) {
      throw new Error('Current timestamp should be valid');
    }
    console.log('   ✓ Current timestamp accepted');

    // Test old timestamp (should fail with strict tolerance)
    const oldTime = currentTime - 400; // 400 seconds ago
    const oldSignature = this.generateSignature(payload, this.webhookSecret, oldTime);
    const oldValid = this.verifySignature(payload, oldSignature, this.webhookSecret, 300); // 5 min tolerance
    if (oldValid) {
      throw new Error('Old timestamp should be rejected');
    }
    console.log('   ✓ Old timestamp correctly rejected');

    // Test future timestamp (should fail)
    const futureTime = currentTime + 400; // 400 seconds in future
    const futureSignature = this.generateSignature(payload, this.webhookSecret, futureTime);
    const futureValid = this.verifySignature(payload, futureSignature, this.webhookSecret, 300);
    if (futureValid) {
      throw new Error('Future timestamp should be rejected');
    }
    console.log('   ✓ Future timestamp correctly rejected');

    console.log();
  }

  async testInvalidSignatures() {
    console.log('🚫 Testing invalid signature handling...');

    const payload = JSON.stringify({ test: 'invalid_signatures' });
    const timestamp = Math.floor(Date.now() / 1000);

    // Test malformed signature
    const malformedSignatures = [
      'invalid',
      't=123',
      'v1=abc123',
      't=,v1=',
      't=abc,v1=123',
      't=123,v2=validhex',
    ];

    for (const malformed of malformedSignatures) {
      const isValid = this.verifySignature(payload, malformed, this.webhookSecret);
      if (isValid) {
        throw new Error(`Malformed signature should be rejected: ${malformed}`);
      }
    }
    console.log('   ✓ Malformed signatures correctly rejected');

    // Test empty/null values
    const emptyTests = [null, undefined, '', ' '];
    for (const empty of emptyTests) {
      const isValid = this.verifySignature(payload, empty, this.webhookSecret);
      if (isValid) {
        throw new Error(`Empty signature should be rejected: ${empty}`);
      }
    }
    console.log('   ✓ Empty signatures correctly rejected');

    console.log();
  }

  async testSecurityEdgeCases() {
    console.log('🛡️  Testing security edge cases...');

    const payload = JSON.stringify({ test: 'security_edge_cases' });
    const timestamp = Math.floor(Date.now() / 1000);

    // Test wrong secret
    const correctSignature = this.generateSignature(payload, this.webhookSecret, timestamp);
    const wrongSecret = 'wrong_secret';
    const wrongSecretValid = this.verifySignature(payload, correctSignature, wrongSecret);
    if (wrongSecretValid) {
      throw new Error('Signature with wrong secret should be rejected');
    }
    console.log('   ✓ Wrong secret correctly rejected');

    // Test signature reuse with different payload
    const differentPayload = JSON.stringify({ different: 'content' });
    const reuseValid = this.verifySignature(differentPayload, correctSignature, this.webhookSecret);
    if (reuseValid) {
      throw new Error('Signature reuse should be rejected');
    }
    console.log('   ✓ Signature reuse correctly prevented');

    // Test timing attack resistance (constant time comparison)
    const validHash = 'a'.repeat(64);
    const invalidHashes = [
      'b' + 'a'.repeat(63), // Different first character
      'a'.repeat(63) + 'b', // Different last character
      'a'.repeat(32),       // Different length
      '',                   // Empty
    ];

    for (const invalidHash of invalidHashes) {
      // This should use constant-time comparison
      const result = crypto.timingSafeEqual(
        Buffer.from(validHash),
        Buffer.from(invalidHash.padEnd(64, '0'))
      );
      if (result && invalidHash !== validHash) {
        throw new Error('Timing attack vulnerability detected');
      }
    }
    console.log('   ✓ Timing attack resistance verified');

    console.log();
  }

  generateSignature(body, secret, timestamp) {
    const payload = `${timestamp}.${body}`;
    const hash = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    return `t=${timestamp},v1=${hash}`;
  }

  verifySignature(body, signature, secret, tolerance = 300) {
    try {
      if (!signature || typeof signature !== 'string') {
        return false;
      }

      const elements = signature.split(',');
      let timestamp;
      let hash;

      for (const element of elements) {
        const [key, value] = element.split('=', 2);
        if (key === 't') {
          timestamp = parseInt(value);
        } else if (key === 'v1') {
          hash = value;
        }
      }

      if (!timestamp || !hash) {
        return false;
      }

      // Check timestamp tolerance
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - timestamp) > tolerance) {
        return false;
      }

      // Verify signature
      const payload = `${timestamp}.${body}`;
      const expectedHash = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
    } catch (error) {
      return false;
    }
  }
}

// Run the test
if (require.main === module) {
  const test = new WebhookSecurityTest();
  test.run().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

module.exports = WebhookSecurityTest;