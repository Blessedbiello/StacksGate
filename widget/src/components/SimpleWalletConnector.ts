import { EventEmitter } from '../utils/EventEmitter';

export interface PaymentRequest {
  paymentIntentId: string;
  amount: number;
  recipientAddress: string;
}

export class SimpleWalletConnector extends EventEmitter {
  private connected = false;
  private address: string | null = null;

  constructor() {
    super();
  }

  async connect(): Promise<string> {
    // Simplified connection for MVP - just simulate a connection
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const mockAddress = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
        this.connected = true;
        this.address = mockAddress;
        this.emit('connected', { address: mockAddress });
        resolve(mockAddress);
      }, 1000);
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.address = null;
    this.emit('disconnected');
  }

  async initiatePayment(request: PaymentRequest): Promise<string> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const mockTxId = 'tx_' + Date.now();
        this.emit('transaction_signed', { txId: mockTxId });
        resolve(mockTxId);
      }, 2000);
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  getAddress(): string | null {
    return this.address;
  }
}