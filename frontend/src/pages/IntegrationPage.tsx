import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  ClipboardDocumentIcon,
  CodeBracketIcon,
  CubeIcon,
  LinkIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

export default function IntegrationPage() {
  const { user, token } = useAuth();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [widgetLoaded, setWidgetLoaded] = useState(false);
  const [secretApiKey, setSecretApiKey] = useState<string | null>(null);

  // Define API configuration
  const publicApiKey = user?.api_key_public || 'pk_test_your_api_key_here';
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

  // Fetch secret API key for demo
  React.useEffect(() => {
    const fetchSecretKey = async () => {
      if (!token) return;
      
      try {
        const response = await fetch(`${apiUrl}/merchants/keys`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (response.ok) {
          const keys = await response.json();
          setSecretApiKey(keys.api_key_secret);
        }
      } catch (error) {
        console.error('Failed to fetch API keys:', error);
      }
    };
    
    fetchSecretKey();
  }, [token, apiUrl]);

  // Load StacksGate widget for live demo
  React.useEffect(() => {
    if (!secretApiKey) return; // Wait for secret key to be fetched
    
    const script = document.createElement('script');
    script.src = import.meta.env.VITE_WIDGET_URL || 'http://localhost:3001/stacksgate.js';
    script.onload = () => {
      if ((window as any).StacksGate) {
        (window as any).StacksGate.init({
          apiKey: secretApiKey,
          apiUrl: apiUrl,
          testMode: true
        });
        setWidgetLoaded(true);
      }
    };
    script.onerror = () => {
      console.error('Failed to load StacksGate widget');
    };
    
    // Only load if not already loaded
    if (!document.querySelector('script[src*="stacksgate.js"]')) {
      document.head.appendChild(script);
    } else {
      setWidgetLoaded(true);
    }
    
    return () => {
      // Cleanup function
      const existingScript = document.querySelector('script[src*="stacksgate.js"]');
      if (existingScript && existingScript.parentNode) {
        existingScript.parentNode.removeChild(existingScript);
      }
    };
  }, [secretApiKey, apiUrl]);

  const copyToClipboard = (text: string, codeType: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(codeType);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const createDemoPayment = async () => {
    if (!widgetLoaded || !(window as any).StacksGate) {
      alert('Widget not loaded yet. Please wait...');
      return;
    }

    try {
      setDemoLoading(true);
      
      const container = document.getElementById('demo-widget-container');
      if (container) {
        container.innerHTML = '<p class="text-gray-500">Creating payment intent...</p>';
      }

      const paymentIntent = await (window as any).StacksGate.createPaymentIntent({
        amount: 0.001,
        description: 'Integration Demo Payment',
        metadata: { demo: 'true', source: 'integration-page' }
      });

      if (container) {
        container.innerHTML = '';
        
        (window as any).StacksGate.createWidget(paymentIntent.id, {
          containerId: 'demo-widget-container',
          theme: 'light',
          onSuccess: (pi: any) => {
            alert('Demo payment completed! 🎉\nIn production, this would process real sBTC.');
          },
          onError: (error: Error) => {
            alert('Demo error: ' + error.message);
          },
          onCancel: () => {
            if (container) {
              container.innerHTML = '<p class="text-gray-500">Payment cancelled. Click "Create Demo Payment" to try again.</p>';
            }
          }
        });
      }
    } catch (error) {
      const container = document.getElementById('demo-widget-container');
      if (container) {
        container.innerHTML = `<p class="text-red-600">Error: ${(error as Error).message}</p>`;
      }
    } finally {
      setDemoLoading(false);
    }
  };

  const codeExamples = {
    basicWidget: `<!-- Include StacksGate Widget -->
<script src="http://localhost:3001/stacksgate.js"></script>

<!-- Payment container -->
<div id="payment-widget"></div>

<script>
// Initialize StacksGate
StacksGate.init({
  apiKey: '${publicApiKey}',
  apiUrl: '${apiUrl}',
  testMode: true
});

// Create payment and widget
async function createPayment() {
  try {
    const paymentIntent = await StacksGate.createPaymentIntent({
      amount: 0.001, // BTC
      description: 'Test payment',
      metadata: { orderId: '12345' }
    });
    
    StacksGate.createWidget(paymentIntent.id, {
      containerId: 'payment-widget',
      theme: 'auto',
      onSuccess: (pi) => {
        console.log('Payment successful!', pi);
        window.location.href = '/success';
      },
      onError: (error) => {
        console.error('Payment failed:', error);
      }
    });
  } catch (error) {
    console.error('Failed to create payment:', error);
  }
}

// Call createPayment when ready
createPayment();
</script>`,

    serverSideApi: `// Server-side payment creation (Node.js example)
const express = require('express');
const app = express();

app.use(express.json());

app.post('/create-payment', async (req, res) => {
  try {
    const response = await fetch('${apiUrl}/payment-intents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk_test_your_secret_key_here'
      },
      body: JSON.stringify({
        amount: 0.001,
        description: req.body.description,
        metadata: req.body.metadata
      })
    });
    
    const paymentIntent = await response.json();
    
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});`,

    reactIntegration: `import React, { useState, useEffect } from 'react';

function PaymentPage({ amount, description }) {
  const [paymentIntent, setPaymentIntent] = useState(null);
  const [widget, setWidget] = useState(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    // Load StacksGate widget script
    const script = document.createElement('script');
    script.src = import.meta.env.VITE_WIDGET_URL || 'http://localhost:3001/stacksgate.js';
    script.onload = () => {
      // Initialize StacksGate
      if (window.StacksGate) {
        window.StacksGate.init({
          apiKey: '${publicApiKey}',
          apiUrl: '${apiUrl}',
          testMode: true
        });
      }
    };
    document.head.appendChild(script);
    
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  const createPayment = async () => {
    try {
      setLoading(true);
      
      // Create payment intent directly with StacksGate
      const paymentIntent = await window.StacksGate.createPaymentIntent({
        amount: amount || 0.001,
        description: description || 'React integration payment',
        metadata: { source: 'react-app' }
      });
      
      // Create widget
      const newWidget = window.StacksGate.createWidget(paymentIntent.id, {
        containerId: 'payment-widget',
        theme: 'auto',
        onSuccess: (pi) => {
          console.log('Payment successful!', pi);
          alert('Payment completed successfully!');
        },
        onError: (error) => {
          console.error('Payment failed:', error);
          alert('Payment failed: ' + error.message);
        },
        onCancel: () => {
          console.log('Payment cancelled');
        }
      });
      
      setWidget(newWidget);
      setPaymentIntent(paymentIntent);
    } catch (error) {
      console.error('Error creating payment:', error);
      alert('Failed to create payment: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Complete Your Payment</h2>
      <div id="payment-widget">
        {!paymentIntent && !loading && (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p>Ready to accept sBTC payments</p>
            <button onClick={createPayment} disabled={!window.StacksGate}>
              {loading ? 'Creating Payment...' : 'Pay with sBTC'}
            </button>
          </div>
        )}
        {loading && <p>Creating payment...</p>}
      </div>
    </div>
  );
}`,

    webhookHandler: `// Webhook handler example (Express.js)
const crypto = require('crypto');

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const payload = req.body;
  const signature = req.get('X-StacksGate-Signature');
  const webhookSecret = 'whsec_your_webhook_secret';
  
  // Verify webhook signature
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');
  
  if (signature !== \`sha256=\${expectedSignature}\`) {
    console.log('Invalid signature');
    return res.status(400).send('Invalid signature');
  }
  
  const event = JSON.parse(payload);
  
  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      console.log('Payment succeeded:', event.data.object);
      // Fulfill the order, send confirmation email, etc.
      break;
      
    case 'payment_intent.failed':
      console.log('Payment failed:', event.data.object);
      // Handle failed payment
      break;
      
    default:
      console.log('Unhandled event type:', event.type);
  }
  
  res.status(200).send('OK');
});`,

    curlExample: `# Create a payment intent
curl -X POST ${apiUrl}/payment-intents \\
  -H "Authorization: Bearer sk_test_your_secret_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 0.001,
    "description": "Test payment",
    "metadata": {
      "order_id": "12345"
    }
  }'

# Retrieve a payment intent
curl ${apiUrl}/payment-intents/pi_1234567890 \\
  -H "Authorization: Bearer sk_test_your_secret_key_here"`
  };

  const CodeBlock = ({ code, language, title, codeType }: { code: string; language: string; title: string; codeType: string }) => (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
        <span className="text-sm font-medium text-gray-300">{title}</span>
        <button
          onClick={() => copyToClipboard(code, codeType)}
          className="flex items-center space-x-1 text-gray-400 hover:text-gray-200 text-sm"
        >
          {copiedCode === codeType ? (
            <>
              <CheckIcon className="h-4 w-4" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <ClipboardDocumentIcon className="h-4 w-4" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 text-sm text-gray-100 overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );

  const steps = [
    {
      icon: CodeBracketIcon,
      title: "Get API Keys",
      description: "Obtain your publishable and secret keys from the Settings page",
      action: "Go to Settings",
      href: "/settings"
    },
    {
      icon: CubeIcon,
      title: "Create Payment Intent",
      description: "Use our API to create a payment intent on your server",
      action: "See API docs",
      href: "#api-docs"
    },
    {
      icon: LinkIcon,
      title: "Add Widget",
      description: "Include our JavaScript widget in your frontend",
      action: "View examples",
      href: "#widget-examples"
    }
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integration Guide</h1>
        <p className="text-gray-600">
          Get started with StacksGate in minutes. Accept sBTC payments with our Stripe-like API.
        </p>
      </div>

      {/* Quick Start Steps */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Quick Start</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step, index) => (
            <div key={step.title} className="text-center">
              <div className="flex items-center justify-center w-12 h-12 bg-bitcoin-100 rounded-lg mx-auto mb-4">
                <step.icon className="h-6 w-6 text-bitcoin-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {index + 1}. {step.title}
              </h3>
              <p className="text-gray-600 mb-4">{step.description}</p>
              <a
                href={step.href}
                className="text-bitcoin-600 hover:text-bitcoin-500 font-medium text-sm"
              >
                {step.action} →
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Live Widget Demo */}
      <div className="card" id="live-demo">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">🚀 Live Widget Demo</h2>
        <p className="text-gray-600 mb-6">
          Try the StacksGate widget right here! This is a fully functional demo using your API keys.
        </p>
        
        <div className="bg-gray-50 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900">Interactive Demo</h3>
            <button
              onClick={createDemoPayment}
              disabled={demoLoading || !widgetLoaded || !secretApiKey}
              className="bg-bitcoin-600 hover:bg-bitcoin-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md font-medium"
            >
              {demoLoading ? 'Creating...' : !secretApiKey ? 'Loading API Keys...' : widgetLoaded ? 'Create Demo Payment' : 'Loading Widget...'}
            </button>
          </div>
          
          <div id="demo-widget-container" className="min-h-[200px] bg-white rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
            {!widgetLoaded ? (
              <p className="text-gray-500">Loading StacksGate widget...</p>
            ) : (
              <p className="text-gray-500">Click "Create Demo Payment" to see the widget in action</p>
            )}
          </div>
        </div>

        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <h4 className="font-medium text-blue-900 mb-2">🔧 Demo Features</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Live widget rendering with your API keys</li>
            <li>• Real payment intent creation</li>
            <li>• Wallet connection simulation (in demo mode)</li>
            <li>• Complete payment flow demonstration</li>
            <li>• {widgetLoaded ? '✅ Widget loaded successfully' : '⏳ Loading widget...'}</li>
          </ul>
        </div>

      </div>

      {/* Widget Integration */}
      <div className="card" id="widget-examples">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Widget Integration</h2>
        <p className="text-gray-600 mb-6">
          The easiest way to accept sBTC payments. Just include our script and create a widget.
        </p>
        <CodeBlock
          code={codeExamples.basicWidget}
          language="html"
          title="Basic Widget Setup"
          codeType="basic-widget"
        />
      </div>

      {/* React Integration */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">React Integration</h2>
        <p className="text-gray-600 mb-6">
          Using React? Here's how to integrate StacksGate into your React application.
        </p>
        <CodeBlock
          code={codeExamples.reactIntegration}
          language="javascript"
          title="React Component Example"
          codeType="react-integration"
        />
      </div>

      {/* Server-side API */}
      <div className="card" id="api-docs">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Server-side API</h2>
        <p className="text-gray-600 mb-6">
          Create payment intents securely from your server using your secret API key.
        </p>
        <div className="space-y-6">
          <CodeBlock
            code={codeExamples.serverSideApi}
            language="javascript"
            title="Node.js Backend Example"
            codeType="server-api"
          />
          
          <CodeBlock
            code={codeExamples.curlExample}
            language="bash"
            title="cURL Examples"
            codeType="curl-example"
          />
        </div>
      </div>

      {/* Webhook Integration */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Webhook Integration</h2>
        <p className="text-gray-600 mb-6">
          Listen for payment events in real-time. Essential for order fulfillment and tracking.
        </p>
        <CodeBlock
          code={codeExamples.webhookHandler}
          language="javascript"
          title="Webhook Handler Example"
          codeType="webhook-handler"
        />
        
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-medium text-blue-900 mb-2">Webhook Events</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <code>payment_intent.created</code> - Payment intent created</li>
            <li>• <code>payment_intent.processing</code> - Payment is being processed</li>
            <li>• <code>payment_intent.succeeded</code> - Payment completed successfully</li>
            <li>• <code>payment_intent.failed</code> - Payment failed</li>
            <li>• <code>payment_intent.canceled</code> - Payment was canceled</li>
          </ul>
        </div>
      </div>

      {/* API Reference */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">API Reference</h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Base URL</h3>
            <code className="text-sm bg-gray-100 px-2 py-1 rounded">
              {apiUrl}
            </code>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-2">Authentication</h3>
            <p className="text-sm text-gray-600 mb-2">
              Include your API key in the Authorization header:
            </p>
            <code className="text-sm bg-gray-100 px-2 py-1 rounded block">
              Authorization: Bearer sk_test_your_secret_key_here
            </code>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-2">Key Endpoints</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center space-x-4">
                <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium w-16 text-center">POST</span>
                <code>/payment-intents</code>
                <span className="text-gray-600">Create a payment intent</span>
              </div>
              <div className="flex items-center space-x-4">
                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium w-16 text-center">GET</span>
                <code>/payment-intents/:id</code>
                <span className="text-gray-600">Retrieve a payment intent</span>
              </div>
              <div className="flex items-center space-x-4">
                <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-medium w-16 text-center">POST</span>
                <code>/payment-intents/:id/cancel</code>
                <span className="text-gray-600">Cancel a payment intent</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Testing */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Testing</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Test Mode</h3>
            <p className="text-sm text-gray-600 mb-4">
              All transactions are in test mode by default. Use test API keys for development.
            </p>
            <div className="space-y-2 text-sm">
              <div>
                <strong>Publishable Key:</strong> <code>pk_test_...</code>
              </div>
              <div>
                <strong>Secret Key:</strong> <code>sk_test_...</code>
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Test Network</h3>
            <p className="text-sm text-gray-600 mb-4">
              All payments use the Stacks testnet. No real Bitcoin is transferred.
            </p>
            <div className="space-y-2 text-sm">
              <div>
                <strong>Network:</strong> Stacks Testnet
              </div>
              <div>
                <strong>sBTC Contract:</strong> ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Support */}
      <div className="card bg-gray-50">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Need Help?</h2>
          <p className="text-gray-600 mb-4">
            Our team is here to help you get started with StacksGate.
          </p>
          <div className="flex justify-center space-x-4">
            <a href="/webhooks" className="btn-primary">
              Setup Webhooks
            </a>
            <a href="mailto:support@stacksgate.com" className="btn-secondary">
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}