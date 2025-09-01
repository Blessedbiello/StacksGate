import { EventEmitter } from '../utils/EventEmitter';
import { SimpleStacksGateAPI, PaymentIntent, APIConfig } from '../sdk/SimpleStacksGateAPI';
import { SimpleWalletConnector } from './SimpleWalletConnector';
import { SimpleUIRenderer } from './SimpleUIRenderer';

export interface WidgetConfig {
  paymentIntentId: string;
  api: SimpleStacksGateAPI;
  config: any;
  containerId?: string;
  theme?: 'light' | 'dark' | 'auto';
  showLogo?: boolean;
  customStyles?: Record<string, string>;
  onSuccess?: (paymentIntent: PaymentIntent) => void;
  onError?: (error: Error) => void;
  onCancel?: () => void;
}

export interface WidgetState {
  phase: 'loading' | 'connect_wallet' | 'confirm_payment' | 'processing' | 'success' | 'error' | 'expired';
  paymentIntent: PaymentIntent | null;
  walletConnected: boolean;
  walletAddress: string | null;
  error: Error | null;
  isPolling: boolean;
}

export class StacksGateWidget extends EventEmitter {
  private config: WidgetConfig;
  private state: WidgetState;
  private container: HTMLElement | null = null;
  private walletConnector: SimpleWalletConnector;
  private uiRenderer: SimpleUIRenderer;
  private pollStopFunction: (() => void) | null = null;
  private destroyed = false;

  constructor(config: WidgetConfig) {
    super();
    
    this.config = config;
    this.state = {
      phase: 'loading',
      paymentIntent: null,
      walletConnected: false,
      walletAddress: null,
      error: null,
      isPolling: false,
    };

    this.walletConnector = new SimpleWalletConnector();
    this.uiRenderer = new SimpleUIRenderer({
      theme: config.theme || 'auto',
      showLogo: config.showLogo !== false,
      customStyles: config.customStyles,
    });

    // Setup wallet connector events
    this.setupWalletConnectorEvents();

    // Initialize the widget
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Find or create container
      if (this.config.containerId) {
        this.container = document.getElementById(this.config.containerId);
        if (!this.container) {
          throw new Error(`Container with ID "${this.config.containerId}" not found`);
        }
      } else {
        // Create a new container
        this.container = document.createElement('div');
        this.container.id = `stacksgate-widget-${Date.now()}`;
        document.body.appendChild(this.container);
      }

      // Load payment intent
      await this.loadPaymentIntent();
      
      // Render initial UI
      this.renderUI();
      
      // Start polling if payment is in progress
      if (this.state.paymentIntent?.status === 'processing') {
        this.startPolling();
      }

      this.emit('initialized', { widget: this });
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  private async loadPaymentIntent(): Promise<void> {
    try {
      const paymentIntent = await this.config.api.getPaymentIntent(this.config.paymentIntentId);
      
      this.setState({
        paymentIntent,
        phase: this.determinePhase(paymentIntent),
      });

      this.emit('payment_intent_loaded', { paymentIntent });
    } catch (error) {
      throw new Error(`Failed to load payment intent: ${(error as Error).message}`);
    }
  }

  private determinePhase(paymentIntent: PaymentIntent): WidgetState['phase'] {
    if (paymentIntent.status === 'succeeded') {
      return 'success';
    }
    
    if (paymentIntent.status === 'failed' || paymentIntent.status === 'canceled') {
      return 'error';
    }

    // Check if expired
    if (paymentIntent.expires_at * 1000 < Date.now()) {
      return 'expired';
    }

    if (paymentIntent.status === 'processing') {
      return 'processing';
    }

    if (paymentIntent.status === 'requires_payment') {
      return this.state.walletConnected ? 'confirm_payment' : 'connect_wallet';
    }

    return 'loading';
  }

  private setupWalletConnectorEvents(): void {
    this.walletConnector.on('connected', (data: any) => {
      const { address } = data;
      this.setState({
        walletConnected: true,
        walletAddress: address,
        phase: this.state.paymentIntent ? 'confirm_payment' : 'connect_wallet',
      });
      
      this.renderUI();
      this.emit('wallet_connected', { address });
    });

    this.walletConnector.on('disconnected', () => {
      this.setState({
        walletConnected: false,
        walletAddress: null,
        phase: 'connect_wallet',
      });
      
      this.renderUI();
      this.emit('wallet_disconnected');
    });

    this.walletConnector.on('error', (data: any) => {
      const { error } = data;
      this.handleError(error);
    });

    this.walletConnector.on('transaction_signed', (data: any) => {
      const { txId } = data;
      this.setState({
        phase: 'processing',
      });
      
      this.renderUI();
      this.startPolling();
      this.emit('transaction_signed', { txId });
    });
  }

  private renderUI(): void {
    if (!this.container || this.destroyed) {
      return;
    }

    const uiConfig = {
      state: this.state,
      config: this.config,
      onConnectWallet: () => this.connectWallet(),
      onDisconnectWallet: () => this.disconnectWallet(),
      onConfirmPayment: () => this.confirmPayment(),
      onCancel: () => this.cancel(),
      onRetry: () => this.retry(),
    };

    this.container.innerHTML = this.uiRenderer.render(uiConfig);
    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    if (!this.container) return;

    // Connect wallet button
    const connectButton = this.container.querySelector('[data-action="connect-wallet"]');
    connectButton?.addEventListener('click', () => this.connectWallet());

    // Disconnect wallet button
    const disconnectButton = this.container.querySelector('[data-action="disconnect-wallet"]');
    disconnectButton?.addEventListener('click', () => this.disconnectWallet());

    // Confirm payment button
    const confirmButton = this.container.querySelector('[data-action="confirm-payment"]');
    confirmButton?.addEventListener('click', () => this.confirmPayment());

    // Cancel button
    const cancelButton = this.container.querySelector('[data-action="cancel"]');
    cancelButton?.addEventListener('click', () => this.cancel());

    // Retry button
    const retryButton = this.container.querySelector('[data-action="retry"]');
    retryButton?.addEventListener('click', () => this.retry());
  }

  private async connectWallet(): Promise<void> {
    try {
      await this.walletConnector.connect();
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  private async disconnectWallet(): Promise<void> {
    try {
      await this.walletConnector.disconnect();
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  private async confirmPayment(): Promise<void> {
    if (!this.state.paymentIntent || !this.state.walletAddress) {
      this.handleError(new Error('Payment intent or wallet address not available'));
      return;
    }

    try {
      this.setState({ phase: 'processing' });
      this.renderUI();

      await this.walletConnector.initiatePayment({
        paymentIntentId: this.state.paymentIntent.id,
        amount: this.state.paymentIntent.amount_sats,
        recipientAddress: this.state.walletAddress,
      });

      // Polling will be started by wallet connector event
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  private cancel(): void {
    this.stopPolling();
    this.emit('canceled');
    
    if (this.config.onCancel) {
      this.config.onCancel();
    }
  }

  private async retry(): Promise<void> {
    try {
      await this.loadPaymentIntent();
      this.renderUI();
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  private startPolling(): void {
    if (this.state.isPolling || !this.state.paymentIntent) {
      return;
    }

    this.setState({ isPolling: true });

    this.pollStopFunction = this.config.api.pollPaymentIntent(
      this.state.paymentIntent.id,
      (paymentIntent) => {
        this.setState({
          paymentIntent,
          phase: this.determinePhase(paymentIntent),
        });
        
        this.renderUI();

        // Handle final states
        if (paymentIntent.status === 'succeeded') {
          this.stopPolling();
          this.emit('success', { paymentIntent });
          
          if (this.config.onSuccess) {
            this.config.onSuccess(paymentIntent);
          }
        } else if (['failed', 'canceled'].includes(paymentIntent.status)) {
          this.stopPolling();
          this.handleError(new Error(`Payment ${paymentIntent.status}`));
        }
      }
    );
  }

  private stopPolling(): void {
    if (this.pollStopFunction) {
      this.pollStopFunction();
      this.pollStopFunction = null;
    }
    
    this.setState({ isPolling: false });
  }

  private handleError(error: Error): void {
    this.setState({
      phase: 'error',
      error,
    });
    
    this.renderUI();
    this.emit('error', { error });
    
    if (this.config.onError) {
      this.config.onError(error);
    }
  }

  private setState(updates: Partial<WidgetState>): void {
    this.state = { ...this.state, ...updates };
  }

  // Public methods
  
  getState(): WidgetState {
    return { ...this.state };
  }

  async refresh(): Promise<void> {
    await this.loadPaymentIntent();
    this.renderUI();
  }

  show(): void {
    if (this.container) {
      this.container.style.display = '';
    }
  }

  hide(): void {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.stopPolling();
    
    if (this.container && !this.config.containerId) {
      // Only remove container if we created it
      this.container.remove();
    } else if (this.container) {
      // Clear content if using existing container
      this.container.innerHTML = '';
    }

    this.walletConnector.disconnect().catch(() => {
      // Ignore disconnection errors during destruction
    });

    this.emit('destroyed');
    this.removeAllListeners();
  }
}