// StacksGate API Client for the widget
export interface APIConfig {
  apiKey: string;
  apiUrl: string;
  testMode: boolean;
}

export interface PaymentIntentCreateOptions {
  amount: number;
  currency?: 'btc';
  description?: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntent {
  id: string;
  object: 'payment_intent';
  amount: number;
  amount_sats: number;
  amount_usd?: number;
  currency: string;
  status: 'requires_payment' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  description?: string;
  metadata: Record<string, string>;
  stacks_address?: string;
  bitcoin_address?: string;
  sbtc_tx_id?: string;
  confirmation_count?: number;
  created: number;
  expires_at: number;
  client_secret?: string;
}

export interface APIError {
  type: string;
  message: string;
  details?: any;
}

export class StacksGateAPI {
  private config: APIConfig;
  private baseUrl: string;

  constructor(config: APIConfig) {
    this.config = config;
    this.baseUrl = config.apiUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  // Create a payment intent
  async createPaymentIntent(options: PaymentIntentCreateOptions): Promise<PaymentIntent> {
    const response = await this.makeRequest('POST', '/payment-intents', {
      amount: options.amount,
      currency: options.currency || 'btc',
      description: options.description,
      metadata: options.metadata,
    });

    return response;
  }

  // Get payment intent by ID
  async getPaymentIntent(paymentIntentId: string): Promise<PaymentIntent> {
    return this.makeRequest('GET', `/payment-intents/${paymentIntentId}`);
  }

  // Update payment intent
  async updatePaymentIntent(paymentIntentId: string, updates: Partial<PaymentIntentCreateOptions>): Promise<PaymentIntent> {
    return this.makeRequest('POST', `/payment-intents/${paymentIntentId}`, updates);
  }

  // Cancel payment intent
  async cancelPaymentIntent(paymentIntentId: string, reason?: string): Promise<PaymentIntent> {
    return this.makeRequest('POST', `/payment-intents/${paymentIntentId}/cancel`, {
      cancellation_reason: reason,
    });
  }

  // Poll payment intent status
  async pollPaymentIntent(paymentIntentId: string, onUpdate: (paymentIntent: PaymentIntent) => void, intervalMs: number = 2000): Promise<() => void> {
    let polling = true;
    
    const poll = async () => {
      while (polling) {
        try {
          const paymentIntent = await this.getPaymentIntent(paymentIntentId);
          onUpdate(paymentIntent);

          // Stop polling if payment is in a final state
          if (['succeeded', 'failed', 'canceled'].includes(paymentIntent.status)) {
            polling = false;
            break;
          }

          // Wait before next poll
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        } catch (error) {
          console.error('Error polling payment intent:', error);
          // Continue polling on error
          await new Promise(resolve => setTimeout(resolve, intervalMs * 2)); // Longer delay on error
        }
      }
    };

    // Start polling
    poll();

    // Return stop function
    return () => {
      polling = false;
    };
  }

  // Make HTTP request to StacksGate API
  private async makeRequest(method: string, endpoint: string, body?: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      'User-Agent': 'StacksGate-Widget/1.0',
    };

    const requestInit: RequestInit = {
      method,
      headers,
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      requestInit.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, requestInit);
      
      let responseData: any;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = { message: await response.text() };
      }

      if (!response.ok) {
        const error: APIError = responseData.error || {
          type: 'api_error',
          message: responseData.message || `HTTP ${response.status}: ${response.statusText}`,
        };
        
        throw new Error(`StacksGate API Error: ${error.message}`);
      }

      return responseData;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('StacksGate API: Network error. Please check your connection.');
      }
      throw error;
    }
  }

  // Validate configuration
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.apiKey) {
      errors.push('API key is required');
    } else if (!this.config.apiKey.match(/^pk_(test|live)_[a-zA-Z0-9]{32,48}$/)) {
      errors.push('Invalid API key format');
    }

    if (!this.config.apiUrl) {
      errors.push('API URL is required');
    } else {
      try {
        new URL(this.config.apiUrl);
      } catch {
        errors.push('Invalid API URL format');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Get configuration
  getConfig(): APIConfig {
    return { ...this.config };
  }

  // Check if using test mode
  isTestMode(): boolean {
    return this.config.testMode || this.config.apiKey.includes('_test_');
  }

  // Test API connection
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'User-Agent': 'StacksGate-Widget/1.0',
        },
      });
      
      return response.ok;
    } catch {
      return false;
    }
  }
}