// StacksGate Widget - Main Entry Point
import { StacksGateWidget } from './components/StacksGateWidget';
import { SimpleStacksGateAPI } from './sdk/SimpleStacksGateAPI';
import { EventEmitter } from './utils/EventEmitter';

// Types
export interface StacksGateConfig {
  apiKey: string;
  apiUrl?: string;
  testMode?: boolean;
  theme?: 'light' | 'dark' | 'auto';
  locale?: string;
}

export interface PaymentIntentOptions {
  amount: number;
  currency?: 'btc';
  description?: string;
  metadata?: Record<string, string>;
}

export interface WidgetOptions {
  containerId?: string;
  theme?: 'light' | 'dark' | 'auto';
  showLogo?: boolean;
  customStyles?: Record<string, string>;
  onSuccess?: (paymentIntent: any) => void;
  onError?: (error: Error) => void;
  onCancel?: () => void;
}

// Global StacksGate class
class StacksGate extends EventEmitter {
  private config: StacksGateConfig | null = null;
  private api: SimpleStacksGateAPI | null = null;
  private widgets: Set<StacksGateWidget> = new Set();

  // Initialize StacksGate with configuration
  init(config: StacksGateConfig): void {
    this.config = config;
    this.api = new SimpleStacksGateAPI({
      apiKey: config.apiKey,
      apiUrl: config.apiUrl || 'http://localhost:3000/api/v1',
      testMode: config.testMode ?? true,
    });

    this.emit('initialized', { config });
  }

  // Create a payment intent
  async createPaymentIntent(options: PaymentIntentOptions): Promise<any> {
    if (!this.api) {
      throw new Error('StacksGate not initialized. Call StacksGate.init() first.');
    }

    try {
      const paymentIntent = await this.api.createPaymentIntent(options);
      this.emit('payment_intent_created', { paymentIntent });
      return paymentIntent;
    } catch (error) {
      this.emit('error', { error });
      throw error;
    }
  }

  // Create and mount a payment widget
  createWidget(paymentIntentId: string, options: WidgetOptions = {}): StacksGateWidget {
    if (!this.api || !this.config) {
      throw new Error('StacksGate not initialized. Call StacksGate.init() first.');
    }

    const widget = new StacksGateWidget({
      paymentIntentId,
      api: this.api,
      config: this.config,
      ...options,
    });

    this.widgets.add(widget);

    // Clean up widget when destroyed
    widget.on('destroyed', () => {
      this.widgets.delete(widget);
    });

    return widget;
  }

  // Get payment intent status
  async getPaymentIntent(paymentIntentId: string): Promise<any> {
    if (!this.api) {
      throw new Error('StacksGate not initialized. Call StacksGate.init() first.');
    }

    return this.api.getPaymentIntent(paymentIntentId);
  }

  // Check if StacksGate is initialized
  isInitialized(): boolean {
    return this.config !== null && this.api !== null;
  }

  // Get current configuration
  getConfig(): StacksGateConfig | null {
    return this.config;
  }

  // Destroy all widgets and clean up
  destroy(): void {
    this.widgets.forEach(widget => widget.destroy());
    this.widgets.clear();
    this.config = null;
    this.api = null;
    this.emit('destroyed');
  }
}

// Create global instance
const stacksGate = new StacksGate();

// Export as UMD compatible
if (typeof window !== 'undefined') {
  (window as any).StacksGate = stacksGate;
}

// Export for ES modules and CommonJS
export default stacksGate;
export { StacksGate, StacksGateWidget, SimpleStacksGateAPI };

// Auto-initialize if config is found in DOM
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const configElement = document.querySelector('script[data-stacksgate-config]');
    if (configElement) {
      try {
        const config = JSON.parse(configElement.getAttribute('data-stacksgate-config') || '{}');
        stacksGate.init(config);
      } catch (error) {
        console.error('StacksGate: Failed to parse config from DOM', error);
      }
    }
  });
}