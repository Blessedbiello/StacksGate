import { WidgetState } from './StacksGateWidget';

export interface UIConfig {
  theme: 'light' | 'dark' | 'auto';
  showLogo: boolean;
  customStyles?: Record<string, string>;
}

export interface RenderConfig {
  state: WidgetState;
  config: any;
  onConnectWallet: () => void;
  onDisconnectWallet: () => void;
  onConfirmPayment: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

export class UIRenderer {
  private config: UIConfig;
  private theme: 'light' | 'dark';

  constructor(config: UIConfig) {
    this.config = config;
    this.theme = this.determineTheme(config.theme);
  }

  private determineTheme(theme: 'light' | 'dark' | 'auto'): 'light' | 'dark' {
    if (theme === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  }

  render(config: RenderConfig): string {
    const { state } = config;
    
    return `
      <div class="stacksgate-widget ${this.theme}" style="${this.getContainerStyles()}">
        ${this.config.showLogo ? this.renderLogo() : ''}
        ${this.renderContent(config)}
        ${this.renderStyles()}
      </div>
    `;
  }

  private renderContent(config: RenderConfig): string {
    const { state } = config;

    switch (state.phase) {
      case 'loading':
        return this.renderLoading();
      
      case 'connect_wallet':
        return this.renderConnectWallet(config);
      
      case 'confirm_payment':
        return this.renderConfirmPayment(config);
      
      case 'processing':
        return this.renderProcessing(config);
      
      case 'success':
        return this.renderSuccess(config);
      
      case 'error':
        return this.renderError(config);
      
      case 'expired':
        return this.renderExpired(config);
      
      default:
        return this.renderLoading();
    }
  }

  private renderLogo(): string {
    return `
      <div class="stacksgate-logo">
        <svg viewBox="0 0 100 40" class="stacksgate-logo-svg">
          <text x="10" y="25" class="stacksgate-logo-text">StacksGate</text>
        </svg>
      </div>
    `;
  }

  private renderLoading(): string {
    return `
      <div class="stacksgate-loading">
        <div class="stacksgate-spinner"></div>
        <p class="stacksgate-loading-text">Loading payment details...</p>
      </div>
    `;
  }

  private renderConnectWallet(config: RenderConfig): string {
    const { state } = config;
    const availableWallets = ['Leather', 'Xverse']; // In production, detect available wallets

    return `
      <div class="stacksgate-connect-wallet">
        <h3 class="stacksgate-title">Connect Your Wallet</h3>
        <p class="stacksgate-subtitle">Connect your Stacks wallet to pay with sBTC</p>
        
        ${state.paymentIntent ? this.renderPaymentSummary(state.paymentIntent) : ''}
        
        <div class="stacksgate-wallet-options">
          ${availableWallets.map(wallet => `
            <button class="stacksgate-wallet-button" data-action="connect-wallet" data-wallet="${wallet.toLowerCase()}">
              <div class="stacksgate-wallet-icon">${this.getWalletIcon(wallet)}</div>
              <span>Connect with ${wallet}</span>
            </button>
          `).join('')}
        </div>
        
        <p class="stacksgate-wallet-help">
          Don't have a wallet? 
          <a href="https://leather.io" target="_blank" class="stacksgate-link">Get Leather</a> or 
          <a href="https://xverse.app" target="_blank" class="stacksgate-link">Get Xverse</a>
        </p>
        
        <button class="stacksgate-cancel-button" data-action="cancel">Cancel</button>
      </div>
    `;
  }

  private renderConfirmPayment(config: RenderConfig): string {
    const { state } = config;
    
    if (!state.paymentIntent) {
      return this.renderError(config);
    }

    return `
      <div class="stacksgate-confirm-payment">
        <h3 class="stacksgate-title">Confirm Payment</h3>
        
        <div class="stacksgate-wallet-info">
          <div class="stacksgate-wallet-connected">
            <span class="stacksgate-wallet-status">✓ Wallet Connected</span>
            <span class="stacksgate-wallet-address">${this.truncateAddress(state.walletAddress || '')}</span>
          </div>
          <button class="stacksgate-disconnect-button" data-action="disconnect-wallet">Disconnect</button>
        </div>
        
        ${this.renderPaymentSummary(state.paymentIntent)}
        
        <div class="stacksgate-payment-details">
          <div class="stacksgate-detail-row">
            <span>Amount:</span>
            <span class="stacksgate-amount">
              ₿ ${state.paymentIntent.amount}
              <small>(${state.paymentIntent.amount_sats.toLocaleString()} sats)</small>
            </span>
          </div>
          
          ${state.paymentIntent.amount_usd ? `
            <div class="stacksgate-detail-row">
              <span>USD Value:</span>
              <span>$${state.paymentIntent.amount_usd.toFixed(2)}</span>
            </div>
          ` : ''}
          
          <div class="stacksgate-detail-row">
            <span>Network:</span>
            <span>Stacks Testnet</span>
          </div>
        </div>
        
        <button class="stacksgate-confirm-button" data-action="confirm-payment">
          Confirm Payment
        </button>
        
        <button class="stacksgate-cancel-button" data-action="cancel">Cancel</button>
      </div>
    `;
  }

  private renderProcessing(config: RenderConfig): string {
    const { state } = config;
    
    return `
      <div class="stacksgate-processing">
        <div class="stacksgate-spinner"></div>
        <h3 class="stacksgate-title">Processing Payment</h3>
        <p class="stacksgate-processing-text">
          Your transaction is being processed on the Stacks blockchain.
          This may take a few minutes.
        </p>
        
        ${state.paymentIntent ? `
          <div class="stacksgate-payment-info">
            <div class="stacksgate-detail-row">
              <span>Amount:</span>
              <span>₿ ${state.paymentIntent.amount}</span>
            </div>
            <div class="stacksgate-detail-row">
              <span>Status:</span>
              <span class="stacksgate-status-processing">${state.paymentIntent.status}</span>
            </div>
            ${state.paymentIntent.confirmation_count !== undefined ? `
              <div class="stacksgate-detail-row">
                <span>Confirmations:</span>
                <span>${state.paymentIntent.confirmation_count}/6</span>
              </div>
            ` : ''}
          </div>
        ` : ''}
        
        <p class="stacksgate-processing-note">
          Please don't close this window until the payment is complete.
        </p>
      </div>
    `;
  }

  private renderSuccess(config: RenderConfig): string {
    const { state } = config;
    
    return `
      <div class="stacksgate-success">
        <div class="stacksgate-success-icon">✓</div>
        <h3 class="stacksgate-title">Payment Successful!</h3>
        <p class="stacksgate-success-text">
          Your sBTC payment has been confirmed on the blockchain.
        </p>
        
        ${state.paymentIntent ? `
          <div class="stacksgate-payment-summary">
            <div class="stacksgate-detail-row">
              <span>Amount Paid:</span>
              <span class="stacksgate-amount-success">₿ ${state.paymentIntent.amount}</span>
            </div>
            <div class="stacksgate-detail-row">
              <span>Transaction:</span>
              <span class="stacksgate-tx-id">${this.truncateTxId(state.paymentIntent.sbtc_tx_id || 'N/A')}</span>
            </div>
            <div class="stacksgate-detail-row">
              <span>Confirmations:</span>
              <span>${state.paymentIntent.confirmation_count || 0}</span>
            </div>
          </div>
        ` : ''}
        
        <p class="stacksgate-success-note">
          You can safely close this window now.
        </p>
      </div>
    `;
  }

  private renderError(config: RenderConfig): string {
    const { state } = config;
    
    return `
      <div class="stacksgate-error">
        <div class="stacksgate-error-icon">⚠</div>
        <h3 class="stacksgate-title">Payment Failed</h3>
        <p class="stacksgate-error-text">
          ${state.error?.message || 'An unexpected error occurred during payment processing.'}
        </p>
        
        <div class="stacksgate-error-actions">
          <button class="stacksgate-retry-button" data-action="retry">Try Again</button>
          <button class="stacksgate-cancel-button" data-action="cancel">Cancel</button>
        </div>
      </div>
    `;
  }

  private renderExpired(config: RenderConfig): string {
    return `
      <div class="stacksgate-expired">
        <div class="stacksgate-error-icon">⏰</div>
        <h3 class="stacksgate-title">Payment Expired</h3>
        <p class="stacksgate-error-text">
          This payment request has expired. Please create a new payment to continue.
        </p>
        
        <button class="stacksgate-cancel-button" data-action="cancel">Close</button>
      </div>
    `;
  }

  private renderPaymentSummary(paymentIntent: any): string {
    return `
      <div class="stacksgate-payment-summary">
        ${paymentIntent.description ? `
          <p class="stacksgate-description">${paymentIntent.description}</p>
        ` : ''}
        
        <div class="stacksgate-amount-display">
          <span class="stacksgate-amount-btc">₿ ${paymentIntent.amount}</span>
          ${paymentIntent.amount_usd ? `
            <span class="stacksgate-amount-usd">≈ $${paymentIntent.amount_usd.toFixed(2)} USD</span>
          ` : ''}
        </div>
      </div>
    `;
  }

  private getWalletIcon(wallet: string): string {
    // In production, use actual wallet icons
    const icons: Record<string, string> = {
      'Leather': '🦾',
      'Xverse': '🔮',
    };
    return icons[wallet] || '💼';
  }

  private truncateAddress(address: string): string {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  private truncateTxId(txId: string): string {
    if (txId.length <= 16) return txId;
    return `${txId.slice(0, 8)}...${txId.slice(-8)}`;
  }

  private getContainerStyles(): string {
    const customStyles = this.config.customStyles || {};
    const styleStrings = Object.entries(customStyles).map(([key, value]) => `${key}: ${value}`);
    return styleStrings.join('; ');
  }

  private renderStyles(): string {
    return `
      <style>
        .stacksgate-widget {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 400px;
          margin: 0 auto;
          padding: 24px;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          background: ${this.theme === 'dark' ? '#1a1a1a' : '#ffffff'};
          color: ${this.theme === 'dark' ? '#ffffff' : '#000000'};
          border: 1px solid ${this.theme === 'dark' ? '#333' : '#e1e5e9'};
        }
        
        .stacksgate-logo {
          text-align: center;
          margin-bottom: 20px;
        }
        
        .stacksgate-logo-svg {
          width: 120px;
          height: 30px;
        }
        
        .stacksgate-logo-text {
          font-size: 16px;
          font-weight: 600;
          fill: ${this.theme === 'dark' ? '#fff' : '#000'};
        }
        
        .stacksgate-title {
          font-size: 20px;
          font-weight: 600;
          margin: 0 0 8px 0;
          text-align: center;
        }
        
        .stacksgate-subtitle {
          font-size: 14px;
          color: ${this.theme === 'dark' ? '#aaa' : '#666'};
          text-align: center;
          margin: 0 0 20px 0;
        }
        
        .stacksgate-spinner {
          width: 24px;
          height: 24px;
          border: 2px solid ${this.theme === 'dark' ? '#333' : '#e1e5e9'};
          border-top-color: #f7931a;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .stacksgate-loading,
        .stacksgate-processing {
          text-align: center;
          padding: 40px 0;
        }
        
        .stacksgate-wallet-button {
          display: flex;
          align-items: center;
          width: 100%;
          padding: 16px;
          margin: 8px 0;
          border: 2px solid ${this.theme === 'dark' ? '#333' : '#e1e5e9'};
          border-radius: 8px;
          background: ${this.theme === 'dark' ? '#2a2a2a' : '#ffffff'};
          color: ${this.theme === 'dark' ? '#fff' : '#000'};
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .stacksgate-wallet-button:hover {
          border-color: #f7931a;
          background: ${this.theme === 'dark' ? '#333' : '#f9f9f9'};
        }
        
        .stacksgate-wallet-icon {
          font-size: 24px;
          margin-right: 12px;
        }
        
        .stacksgate-confirm-button,
        .stacksgate-retry-button {
          width: 100%;
          padding: 16px;
          background: #f7931a;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s ease;
          margin: 16px 0 8px;
        }
        
        .stacksgate-confirm-button:hover,
        .stacksgate-retry-button:hover {
          background: #e8840f;
        }
        
        .stacksgate-cancel-button,
        .stacksgate-disconnect-button {
          width: 100%;
          padding: 12px;
          background: transparent;
          color: ${this.theme === 'dark' ? '#aaa' : '#666'};
          border: 1px solid ${this.theme === 'dark' ? '#333' : '#e1e5e9'};
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          margin: 8px 0;
        }
        
        .stacksgate-cancel-button:hover,
        .stacksgate-disconnect-button:hover {
          border-color: ${this.theme === 'dark' ? '#555' : '#ccc'};
        }
        
        .stacksgate-payment-summary {
          background: ${this.theme === 'dark' ? '#2a2a2a' : '#f9f9f9'};
          padding: 16px;
          border-radius: 8px;
          margin: 16px 0;
        }
        
        .stacksgate-amount-display {
          text-align: center;
          margin: 16px 0;
        }
        
        .stacksgate-amount-btc {
          display: block;
          font-size: 24px;
          font-weight: 600;
          color: #f7931a;
        }
        
        .stacksgate-amount-usd {
          display: block;
          font-size: 14px;
          color: ${this.theme === 'dark' ? '#aaa' : '#666'};
          margin-top: 4px;
        }
        
        .stacksgate-detail-row {
          display: flex;
          justify-content: space-between;
          margin: 8px 0;
          font-size: 14px;
        }
        
        .stacksgate-wallet-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: ${this.theme === 'dark' ? '#2a2a2a' : '#f0f8ff'};
          padding: 12px;
          border-radius: 8px;
          margin: 16px 0;
        }
        
        .stacksgate-wallet-status {
          color: #28a745;
          font-weight: 600;
          font-size: 12px;
        }
        
        .stacksgate-wallet-address {
          font-size: 12px;
          color: ${this.theme === 'dark' ? '#aaa' : '#666'};
          display: block;
        }
        
        .stacksgate-success {
          text-align: center;
          padding: 40px 0;
        }
        
        .stacksgate-success-icon {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: #28a745;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 30px;
          margin: 0 auto 20px;
        }
        
        .stacksgate-error {
          text-align: center;
          padding: 40px 0;
        }
        
        .stacksgate-error-icon {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: #dc3545;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 30px;
          margin: 0 auto 20px;
        }
        
        .stacksgate-link {
          color: #f7931a;
          text-decoration: none;
        }
        
        .stacksgate-link:hover {
          text-decoration: underline;
        }
        
        .stacksgate-wallet-help {
          text-align: center;
          font-size: 12px;
          color: ${this.theme === 'dark' ? '#aaa' : '#666'};
          margin: 16px 0;
        }
        
        .stacksgate-processing-note,
        .stacksgate-success-note {
          font-size: 12px;
          color: ${this.theme === 'dark' ? '#aaa' : '#666'};
          text-align: center;
          margin-top: 16px;
        }
        
        .stacksgate-status-processing {
          color: #ffc107;
          text-transform: capitalize;
        }
      </style>
    `;
  }
}