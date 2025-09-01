import { EventEmitter } from '../utils/EventEmitter';
import { openContractCall, showConnect } from '@stacks/connect';

export interface PaymentRequest {
  paymentIntentId: string;
  amount: number; // in satoshis
  recipientAddress: string;
}

export interface WalletConnectorState {
  isConnected: boolean;
  address: string | null;
  walletType: 'leather' | 'xverse' | null;
  balance: number; // sBTC balance in satoshis
}

export class WalletConnector extends EventEmitter {
  private state: WalletConnectorState = {
    isConnected: false,
    address: null,
    walletType: null,
    balance: 0,
  };

  private userData: any = null;

  constructor() {
    super();
    this.checkExistingConnection();
  }

  // Check if wallet is already connected
  private async checkExistingConnection(): Promise<void> {
    try {
      // Check if Stacks Connect has existing session
      if (typeof window !== 'undefined' && (window as any).StacksProvider) {
        const provider = (window as any).StacksProvider;
        
        // Check if already connected
        if (provider.isSignedIn && provider.isSignedIn()) {
          const userData = provider.loadUserData();
          if (userData && userData.profile && userData.profile.stxAddress) {
            this.userData = { userSession: provider };
            const address = userData.profile.stxAddress.testnet || userData.profile.stxAddress.mainnet;
            await this.updateConnectionState(address);
          }
        }
      }

      // Fallback: Check localStorage for previous session
      const savedUserData = localStorage.getItem('stacksUserData');
      if (savedUserData && !this.state.isConnected) {
        const userData = JSON.parse(savedUserData);
        if (userData && userData.profile && userData.profile.stxAddress) {
          const address = userData.profile.stxAddress.testnet || userData.profile.stxAddress.mainnet;
          await this.updateConnectionState(address);
        }
      }
    } catch (error) {
      console.debug('No existing wallet connection found:', error);
      // Clear any corrupted data
      localStorage.removeItem('stacksUserData');
    }
  }

  // Connect to Stacks wallet
  async connect(): Promise<string> {
    return new Promise((resolve, reject) => {
      // Check if Stacks Connect is available
      if (!WalletConnector.isWalletAvailable()) {
        const error = new Error('No Stacks wallet found. Please install Leather or Xverse wallet.');
        this.emit('error', { error });
        reject(error);
        return;
      }

      try {
        showConnect({
          appDetails: {
            name: 'StacksGate',
            icon: window.location.origin + '/favicon.ico',
          },
          redirectTo: window.location.href,
          userSession: undefined, // Let Stacks Connect handle session
          onFinish: (data) => {
            try {
              this.userData = data;
              const userData = data.userSession.loadUserData();
              const address = userData.profile.stxAddress.testnet || userData.profile.stxAddress.mainnet;
              
              // Save user data to localStorage for persistence
              localStorage.setItem('stacksUserData', JSON.stringify(userData));
              
              this.updateConnectionState(address);
              this.emit('connected', { address, data });
              resolve(address);
            } catch (error) {
              console.error('Error processing wallet connection:', error);
              const connectionError = new Error('Failed to process wallet connection');
              this.emit('error', { error: connectionError });
              reject(connectionError);
            }
          },
          onCancel: () => {
            const error = new Error('User canceled wallet connection');
            this.emit('error', { error });
            reject(error);
          },
        });
      } catch (error) {
        console.error('Failed to initiate wallet connection:', error);
        this.emit('error', { error: error as Error });
        reject(error);
      }
    });
  }

  // Disconnect from wallet
  async disconnect(): Promise<void> {
    try {
      if (this.userData && this.userData.userSession) {
        this.userData.userSession.signUserOut();
      }
      
      // Clear localStorage
      localStorage.removeItem('stacksUserData');
      
      // Reset state
      this.state = {
        isConnected: false,
        address: null,
        walletType: null,
        balance: 0,
      };

      this.userData = null;
      this.emit('disconnected');
    } catch (error) {
      this.emit('error', { error: error as Error });
      throw error;
    }
  }

  // Update connection state and fetch balance
  private async updateConnectionState(address: string): Promise<void> {
    this.state = {
      isConnected: true,
      address,
      walletType: this.detectWalletType(),
      balance: 0, // Will be updated by fetchBalance
    };

    // Fetch sBTC balance
    try {
      await this.fetchBalance();
    } catch (error) {
      console.warn('Failed to fetch sBTC balance:', error);
    }
  }

  // Detect which wallet is being used
  private detectWalletType(): 'leather' | 'xverse' | null {
    if ((window as any).LeatherProvider) {
      return 'leather';
    }
    if ((window as any).XverseProviders) {
      return 'xverse';
    }
    return null;
  }

  // Fetch sBTC balance for connected address
  async fetchBalance(): Promise<number> {
    if (!this.state.address) {
      throw new Error('No wallet connected');
    }

    try {
      // In a real implementation, you would call the StacksGate API or Stacks API
      // to get the sBTC balance. For now, we'll mock this.
      
      // Mock balance - in production, fetch from actual sBTC contract
      const balance = 0; // await this.getSBTCBalance(this.state.address);
      
      this.state.balance = balance;
      this.emit('balance_updated', { balance, address: this.state.address });
      
      return balance;
    } catch (error) {
      console.error('Failed to fetch sBTC balance:', error);
      throw error;
    }
  }

  // Initiate sBTC payment transaction
  async initiatePayment(request: PaymentRequest): Promise<string> {
    if (!this.state.isConnected || !this.state.address) {
      throw new Error('Wallet not connected');
    }

    try {
      // For sBTC payments, we need to call the sBTC contract
      // This is a simplified version - in production, you'd need to construct
      // the proper contract call based on the sBTC implementation
      
      const contractAddress = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM'; // Testnet sBTC contract
      const contractName = 'sbtc-token';
      const functionName = 'transfer';

      return new Promise((resolve, reject) => {
        openContractCall({
          contractAddress,
          contractName,
          functionName,
          functionArgs: [
            // Function arguments would depend on the actual sBTC contract
            // This is a placeholder implementation
          ],
          appDetails: {
            name: 'StacksGate',
            icon: 'https://stacksgate.com/icon.png',
          },
          onFinish: (data) => {
            const txId = data.txId;
            this.emit('transaction_signed', { txId, paymentIntentId: request.paymentIntentId });
            resolve(txId);
          },
          onCancel: () => {
            const error = new Error('User canceled transaction');
            this.emit('error', { error });
            reject(error);
          },
        });
      });
    } catch (error) {
      this.emit('error', { error: error as Error });
      throw error;
    }
  }

  // Check if wallet extension is installed
  static isWalletAvailable(): boolean {
    return !!(
      (window as any).LeatherProvider || 
      (window as any).XverseProviders ||
      (window as any).StacksProvider
    );
  }

  // Get list of available wallets
  static getAvailableWallets(): string[] {
    const wallets: string[] = [];
    
    if ((window as any).LeatherProvider) {
      wallets.push('Leather');
    }
    
    if ((window as any).XverseProviders) {
      wallets.push('Xverse');
    }
    
    return wallets;
  }

  // Get current state
  getState(): WalletConnectorState {
    return { ...this.state };
  }

  // Check if connected
  isConnected(): boolean {
    return this.state.isConnected;
  }

  // Get connected address
  getAddress(): string | null {
    return this.state.address;
  }

  // Get sBTC balance
  getBalance(): number {
    return this.state.balance;
  }

  // Get wallet type
  getWalletType(): string | null {
    return this.state.walletType;
  }

  // Switch network (testnet/mainnet)
  async switchNetwork(network: 'testnet' | 'mainnet'): Promise<void> {
    // This would depend on wallet capabilities
    // Most wallets handle network switching in their UI
    console.log(`Switching to ${network} - check wallet for network selection`);
    this.emit('network_switch_requested', { network });
  }

  // Sign a message (for verification purposes)
  async signMessage(message: string): Promise<string> {
    if (!this.userData || !this.userData.userSession) {
      throw new Error('Wallet not connected');
    }

    try {
      // Implementation depends on wallet capabilities
      // This is a placeholder
      throw new Error('Message signing not implemented');
    } catch (error) {
      this.emit('error', { error: error as Error });
      throw error;
    }
  }
}