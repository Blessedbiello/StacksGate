export interface UIConfig {
  theme?: 'light' | 'dark' | 'auto';
  showLogo?: boolean;
  customStyles?: Record<string, string>;
}

export class SimpleUIRenderer {
  private config: UIConfig;

  constructor(config: UIConfig) {
    this.config = config || {};
  }

  render(uiConfig: any): string {
    const { state, config } = uiConfig;
    const theme = this.config.theme || 'light';
    
    // Simple HTML template for the widget
    return `
      <div class="stacksgate-widget stacksgate-widget--${theme}">
        <div class="stacksgate-widget__content">
          ${this.renderPhase(state, uiConfig)}
        </div>
        ${this.renderStyles()}
      </div>
    `;
  }

  private renderPhase(state: any, uiConfig: any): string {
    switch (state.phase) {
      case 'loading':
        return '<div class="stacksgate-loading">Loading...</div>';
      
      case 'connect_wallet':
        return `
          <div class="stacksgate-connect">
            <h3>Connect Wallet</h3>
            <p>Connect your Stacks wallet to complete the payment</p>
            <button data-action="connect-wallet" class="stacksgate-btn stacksgate-btn--primary">
              Connect Wallet
            </button>
          </div>
        `;
      
      case 'confirm_payment':
        const amount = state.paymentIntent ? (state.paymentIntent.amount_sats / 100000000) : 0;
        return `
          <div class="stacksgate-confirm">
            <h3>Confirm Payment</h3>
            <p>Amount: ₿ ${amount.toFixed(8)}</p>
            ${state.paymentIntent?.description ? `<p>Description: ${state.paymentIntent.description}</p>` : ''}
            <button data-action="confirm-payment" class="stacksgate-btn stacksgate-btn--primary">
              Confirm Payment
            </button>
            <button data-action="cancel" class="stacksgate-btn stacksgate-btn--secondary">
              Cancel
            </button>
          </div>
        `;
      
      case 'processing':
        return `
          <div class="stacksgate-processing">
            <div class="stacksgate-spinner"></div>
            <h3>Processing Payment</h3>
            <p>Please wait while we process your payment...</p>
          </div>
        `;
      
      case 'success':
        return `
          <div class="stacksgate-success">
            <div class="stacksgate-checkmark">✓</div>
            <h3>Payment Successful!</h3>
            <p>Your payment has been processed successfully.</p>
          </div>
        `;
      
      case 'error':
        return `
          <div class="stacksgate-error">
            <h3>Payment Failed</h3>
            <p>${state.error?.message || 'An error occurred'}</p>
            <button data-action="retry" class="stacksgate-btn stacksgate-btn--primary">
              Try Again
            </button>
          </div>
        `;
      
      case 'expired':
        return `
          <div class="stacksgate-expired">
            <h3>Payment Expired</h3>
            <p>This payment link has expired.</p>
          </div>
        `;
      
      default:
        return '<div class="stacksgate-error">Unknown state</div>';
    }
  }

  private renderStyles(): string {
    return `
      <style>
        .stacksgate-widget {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 400px;
          margin: 0 auto;
          padding: 24px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: white;
        }
        
        .stacksgate-widget--dark {
          background: #1a202c;
          border-color: #2d3748;
          color: white;
        }
        
        .stacksgate-btn {
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          margin: 4px;
          min-width: 100px;
        }
        
        .stacksgate-btn--primary {
          background: #f7931a;
          color: white;
        }
        
        .stacksgate-btn--secondary {
          background: #e2e8f0;
          color: #4a5568;
        }
        
        .stacksgate-spinner {
          border: 2px solid #e2e8f0;
          border-top: 2px solid #f7931a;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        }
        
        .stacksgate-checkmark {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: #48bb78;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          font-weight: bold;
          margin: 0 auto 16px;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .stacksgate-widget h3 {
          margin: 0 0 16px 0;
          font-size: 18px;
        }
        
        .stacksgate-widget p {
          margin: 0 0 16px 0;
          color: #718096;
        }
        
        .stacksgate-widget--dark p {
          color: #a0aec0;
        }
      </style>
    `;
  }
}