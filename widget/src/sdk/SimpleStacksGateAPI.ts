export interface PaymentIntent {
  id: string;
  amount_sats: number;
  amount_usd?: number;
  status: 'requires_payment' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  description?: string;
  expires_at: number;
  created: number;
}

export interface APIConfig {
  apiKey: string;
  apiUrl: string;
  testMode: boolean;
}

export class SimpleStacksGateAPI {
  private config: APIConfig;

  constructor(config: APIConfig) {
    this.config = config;
  }

  async createPaymentIntent(options: any): Promise<PaymentIntent> {
    const response = await fetch(`${this.config.apiUrl}/payment-intents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      throw new Error(`Failed to create payment intent: ${response.statusText}`);
    }

    return response.json();
  }

  async getPaymentIntent(paymentIntentId: string): Promise<PaymentIntent> {
    const response = await fetch(`${this.config.apiUrl}/payment-intents/${paymentIntentId}`, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get payment intent: ${response.statusText}`);
    }

    return response.json();
  }

  pollPaymentIntent(paymentIntentId: string, callback: (pi: PaymentIntent) => void): () => void {
    let polling = true;
    
    const poll = async () => {
      if (!polling) return;
      
      try {
        const paymentIntent = await this.getPaymentIntent(paymentIntentId);
        callback(paymentIntent);
        
        // Continue polling if still processing
        if (paymentIntent.status === 'processing' || paymentIntent.status === 'requires_payment') {
          setTimeout(poll, 2000); // Poll every 2 seconds
        }
      } catch (error) {
        console.error('Polling error:', error);
        // Continue polling on error
        setTimeout(poll, 5000); // Retry after 5 seconds
      }
    };

    // Start polling
    poll();

    // Return stop function
    return () => {
      polling = false;
    };
  }
}