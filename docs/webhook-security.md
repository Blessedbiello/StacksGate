# Webhook Security Guide

This guide explains how to securely handle webhooks from StacksGate by verifying webhook signatures.

## Overview

StacksGate signs webhook payloads with a secret key and includes the signature in the request headers. You should verify these signatures to ensure the webhooks are genuinely from StacksGate and haven't been tampered with.

## Webhook Headers

Each webhook request from StacksGate includes these headers:

- `X-StacksGate-Signature`: The webhook signature
- `X-StacksGate-Timestamp`: Unix timestamp of when the webhook was sent  
- `X-StacksGate-Event`: The event type (e.g., `payment_intent.succeeded`)
- `User-Agent`: `StacksGate-Webhooks/1.0`

## Signature Format

The signature header contains:
```
t=1642502400,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

Where:
- `t=` is the timestamp
- `v1=` is the HMAC SHA256 signature

## Verification Process

1. **Extract elements** from the signature header
2. **Check timestamp** to prevent replay attacks (default: 5 minute tolerance)
3. **Compute expected signature** using your webhook secret
4. **Compare signatures** using constant-time comparison

## Implementation Examples

### Node.js with Express

```javascript
const express = require('express');
const crypto = require('crypto');
const app = express();

// Middleware to capture raw body
app.use('/webhook', express.raw({ type: 'application/json' }));

function verifyWebhookSignature(body, signature, secret, tolerance = 300) {
  try {
    const elements = signature.split(',');
    let timestamp, hash;

    for (const element of elements) {
      const [key, value] = element.split('=');
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

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-stacksgate-signature'];
  const body = req.body.toString();
  const webhookSecret = process.env.STACKSGATE_WEBHOOK_SECRET;

  if (!verifyWebhookSignature(body, signature, webhookSecret)) {
    return res.status(401).send('Unauthorized');
  }

  const event = JSON.parse(body);
  
  // Process the webhook event
  console.log('Received event:', event.type);
  
  res.status(200).send('OK');
});
```

### Python with Flask

```python
import os
import json
import hmac
import hashlib
import time
from flask import Flask, request, abort

app = Flask(__name__)

def verify_webhook_signature(body, signature, secret, tolerance=300):
    try:
        elements = signature.split(',')
        timestamp = None
        hash_value = None
        
        for element in elements:
            key, value = element.split('=', 1)
            if key == 't':
                timestamp = int(value)
            elif key == 'v1':
                hash_value = value
        
        if not timestamp or not hash_value:
            return False
        
        # Check timestamp tolerance
        now = int(time.time())
        if abs(now - timestamp) > tolerance:
            return False
        
        # Verify signature
        payload = f"{timestamp}.{body}"
        expected_hash = hmac.new(
            secret.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(hash_value, expected_hash)
    except Exception:
        return False

@app.route('/webhook', methods=['POST'])
def webhook():
    signature = request.headers.get('X-StacksGate-Signature')
    body = request.get_data(as_text=True)
    webhook_secret = os.environ.get('STACKSGATE_WEBHOOK_SECRET')
    
    if not verify_webhook_signature(body, signature, webhook_secret):
        abort(401)
    
    event = json.loads(body)
    
    # Process the webhook event
    print(f"Received event: {event['type']}")
    
    return '', 200
```

### PHP

```php
<?php
function verifyWebhookSignature($body, $signature, $secret, $tolerance = 300) {
    $elements = explode(',', $signature);
    $timestamp = null;
    $hash = null;
    
    foreach ($elements as $element) {
        list($key, $value) = explode('=', $element, 2);
        if ($key == 't') {
            $timestamp = intval($value);
        } elseif ($key == 'v1') {
            $hash = $value;
        }
    }
    
    if (!$timestamp || !$hash) {
        return false;
    }
    
    // Check timestamp tolerance
    $now = time();
    if (abs($now - $timestamp) > $tolerance) {
        return false;
    }
    
    // Verify signature
    $payload = $timestamp . '.' . $body;
    $expectedHash = hash_hmac('sha256', $payload, $secret);
    
    return hash_equals($hash, $expectedHash);
}

// Get webhook data
$body = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_STACKSGATE_SIGNATURE'];
$webhookSecret = $_ENV['STACKSGATE_WEBHOOK_SECRET'];

if (!verifyWebhookSignature($body, $signature, $webhookSecret)) {
    http_response_code(401);
    exit('Unauthorized');
}

$event = json_decode($body, true);

// Process the webhook event
error_log("Received event: " . $event['type']);

http_response_code(200);
echo 'OK';
?>
```

## Security Best Practices

1. **Always verify signatures** - Never trust webhooks without verification
2. **Use constant-time comparison** - Prevents timing attacks
3. **Check timestamp tolerance** - Prevents replay attacks (default: 5 minutes)
4. **Store webhook secrets securely** - Use environment variables, not hardcoded values
5. **Use HTTPS endpoints** - Always use SSL/TLS for webhook URLs
6. **Handle failures gracefully** - Return appropriate HTTP status codes
7. **Log verification failures** - For monitoring and debugging

## Webhook Events

Common webhook event types:

- `payment_intent.requires_payment` - Payment intent created, waiting for payment
- `payment_intent.processing` - Payment detected, being processed
- `payment_intent.succeeded` - Payment confirmed and completed
- `payment_intent.failed` - Payment failed
- `payment_intent.canceled` - Payment intent was canceled
- `test.webhook` - Test webhook (sent via API or dashboard)

## Error Handling

If signature verification fails:
- Return HTTP 401 (Unauthorized)
- Log the failure for monitoring
- Do not process the webhook payload

If processing fails:
- Return HTTP 500 (Internal Server Error)  
- StacksGate will retry the webhook automatically

## Testing

Use the webhook test endpoint to verify your implementation:

```bash
curl -X POST https://api.stacksgate.com/webhooks/test \
  -H "Authorization: Bearer sk_test_..." \
  -H "Content-Type: application/json"
```

## Troubleshooting

**Signature verification always fails:**
- Check that you're using the correct webhook secret
- Ensure you're using the raw request body (not parsed JSON)
- Verify timestamp tolerance isn't too strict

**Webhooks not being received:**
- Check that your endpoint returns HTTP 200
- Ensure your server is accessible from the internet
- Verify SSL certificate is valid
- Check webhook URL in dashboard settings

**High failure rate:**
- Monitor webhook logs in the StacksGate dashboard
- Check server response times and error rates
- Implement proper error handling and logging

For additional help, contact support or check the dashboard webhook logs for detailed delivery information.