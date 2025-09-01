import {
  StacksTestnet,
  StacksMainnet,
  StacksNetwork,
} from '@stacks/network';
import {
  makeSTXTokenTransfer,
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  createStacksPrivateKey,
  getAddressFromPrivateKey,
  TransactionVersion,
  uintCV,
  principalCV,
  noneCV,
  bufferCVFromString,
  standardPrincipalCV,
} from '@stacks/transactions';
import { StacksApiSocketClient } from '@stacks/blockchain-api-client';
import { logger } from '@/utils/logger';
import { cacheGet, cacheSet } from '@/utils/redis';

export interface StacksConfig {
  network: StacksNetwork;
  apiUrl: string;
  isMainnet: boolean;
}

export interface SBTCDepositParams {
  recipientAddress: string;
  amountSats: number;
  memo?: string;
}

export interface SBTCWithdrawalParams {
  bitcoinAddress: string;
  amountSats: number;
  memo?: string;
}

export interface TransactionStatus {
  txid: string;
  status: 'pending' | 'confirmed' | 'failed';
  blockHeight?: number;
  confirmations?: number;
  error?: string;
}

export class StacksService {
  private network: StacksNetwork;
  private apiUrl: string;
  private isMainnet: boolean;
  private socketClient: StacksApiSocketClient;

  constructor() {
    const networkType = process.env.STACKS_NETWORK || 'testnet';
    this.isMainnet = networkType === 'mainnet';
    
    if (this.isMainnet) {
      this.network = new StacksMainnet();
      this.apiUrl = process.env.STACKS_API_URL || 'https://api.mainnet.hiro.so';
    } else {
      this.network = new StacksTestnet();
      this.apiUrl = process.env.STACKS_API_URL || 'https://api.testnet.hiro.so';
    }

    this.network.coreApiUrl = this.apiUrl;
    this.socketClient = new StacksApiSocketClient({ url: this.apiUrl });

    logger.info('StacksService initialized', {
      network: networkType,
      apiUrl: this.apiUrl,
    });
  }

  getNetwork(): StacksNetwork {
    return this.network;
  }

  getConfig(): StacksConfig {
    return {
      network: this.network,
      apiUrl: this.apiUrl,
      isMainnet: this.isMainnet,
    };
  }

  // Generate a new Stacks address for deposits
  generateDepositAddress(): { address: string; privateKey: string } {
    const privateKey = createStacksPrivateKey();
    const address = getAddressFromPrivateKey(
      privateKey.data,
      this.isMainnet ? TransactionVersion.Mainnet : TransactionVersion.Testnet
    );

    return {
      address,
      privateKey: privateKey.data,
    };
  }

  // Monitor sBTC deposit transactions
  async monitorSBTCDeposit(bitcoinTxid: string, expectedAmount: number): Promise<TransactionStatus> {
    const cacheKey = `sbtc_deposit:${bitcoinTxid}`;
    
    try {
      // Check cache first
      const cachedStatus = await cacheGet<TransactionStatus>(cacheKey);
      if (cachedStatus && cachedStatus.status !== 'pending') {
        return cachedStatus;
      }

      // First, check if the Bitcoin transaction exists and is confirmed
      const btcResponse = await fetch(`${this.apiUrl}/extended/v1/tx/${bitcoinTxid}`);
      
      if (!btcResponse.ok) {
        if (btcResponse.status === 404) {
          // Transaction not found yet
          const status: TransactionStatus = {
            txid: bitcoinTxid,
            status: 'pending',
          };
          await cacheSet(cacheKey, status, 30); // Cache for 30 seconds
          return status;
        }
        throw new Error(`Failed to fetch Bitcoin transaction: ${btcResponse.statusText}`);
      }

      const btcTxData = await btcResponse.json();
      
      // Check if Bitcoin transaction is confirmed
      if (!btcTxData.canonical || btcTxData.tx_status !== 'success') {
        const status: TransactionStatus = {
          txid: bitcoinTxid,
          status: 'pending',
          blockHeight: btcTxData.block_height,
          confirmations: btcTxData.confirmations || 0,
        };
        await cacheSet(cacheKey, status, 30);
        return status;
      }

      // Look for sBTC contract events related to this transaction
      const eventsResponse = await fetch(`${this.apiUrl}/extended/v1/tx/${bitcoinTxid}/events`);
      
      if (eventsResponse.ok) {
        const eventsData = await eventsResponse.json();
        
        // Look for sBTC mint events
        const sbtcEvent = eventsData.events?.find((event: any) => 
          event.event_type === 'smart_contract_log' &&
          (event.contract_log?.contract_id?.includes('sbtc') || 
           event.contract_log?.contract_id?.includes('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM'))
        );

        if (sbtcEvent) {
          const status: TransactionStatus = {
            txid: bitcoinTxid,
            status: 'confirmed',
            blockHeight: btcTxData.block_height,
            confirmations: btcTxData.confirmations || 0,
          };
          await cacheSet(cacheKey, status, 300); // Cache confirmed for 5 minutes
          return status;
        }
      }

      // Check for sBTC balance changes (alternative approach)
      // This would require knowing the recipient address
      const status: TransactionStatus = {
        txid: bitcoinTxid,
        status: btcTxData.confirmations >= 1 ? 'confirmed' : 'pending',
        blockHeight: btcTxData.block_height,
        confirmations: btcTxData.confirmations || 0,
      };

      // Cache based on status
      const cacheTime = status.status === 'confirmed' ? 300 : 30;
      await cacheSet(cacheKey, status, cacheTime);
      
      return status;
    } catch (error) {
      logger.error('Failed to monitor sBTC deposit:', { bitcoinTxid, error });
      
      const errorStatus: TransactionStatus = {
        txid: bitcoinTxid,
        status: 'failed',
        error: (error as Error).message,
      };
      
      // Cache error status for a short time
      await cacheSet(cacheKey, errorStatus, 60);
      return errorStatus;
    }
  }

  // Get sBTC balance for an address
  async getSBTCBalance(address: string): Promise<number> {
    const cacheKey = `sbtc_balance:${address}`;
    
    try {
      // Check cache first
      const cachedBalance = await cacheGet<number>(cacheKey);
      if (cachedBalance !== null) {
        return cachedBalance;
      }

      // Get sBTC contract address - using official testnet contract
      const sbtcTokenContract = process.env.SBTC_TOKEN_CONTRACT || 
        (this.isMainnet 
          ? 'SP3DX3H4FEYZJZ586MFBS25ZW3HZDMEW92260R2PR.sbtc-token' 
          : 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token'
        );
      
      // Use the fungible token balance endpoint
      const response = await fetch(
        `${this.apiUrl}/extended/v1/tokens/ft/${sbtcTokenContract}/balances/${address}`
      );

      if (!response.ok) {
        // If 404, address has no balance (0)
        if (response.status === 404) {
          await cacheSet(cacheKey, 0, 30);
          return 0;
        }
        throw new Error(`Failed to fetch sBTC balance: ${response.statusText}`);
      }

      const data = await response.json();
      const balance = parseInt(data.balance || '0');

      // Cache for 30 seconds
      await cacheSet(cacheKey, balance, 30);
      
      logger.debug('Retrieved sBTC balance', { address, balance, contract: sbtcTokenContract });
      
      return balance;
    } catch (error) {
      logger.error('Failed to get sBTC balance:', { address, error });
      // Return cached balance if available, otherwise 0
      const cachedBalance = await cacheGet<number>(cacheKey);
      return cachedBalance || 0;
    }
  }

  // Transfer sBTC tokens (SIP-010 compliant)
  async transferSBTC(recipientAddress: string, amount: number, senderPrivateKey: string, memo?: string): Promise<string> {
    try {
      const senderAddress = getAddressFromPrivateKey(
        senderPrivateKey,
        this.isMainnet ? TransactionVersion.Mainnet : TransactionVersion.Testnet
      );

      // Get sBTC token contract
      const [contractAddress, contractName] = (process.env.SBTC_TOKEN_CONTRACT || 
        (this.isMainnet 
          ? 'SP3DX3H4FEYZJZ586MFBS25ZW3HZDMEW92260R2PR.sbtc-token' 
          : 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token'
        )).split('.');

      // Create SIP-010 transfer transaction
      const txOptions = {
        contractAddress,
        contractName,
        functionName: 'transfer',
        functionArgs: [
          uintCV(amount), // amount
          standardPrincipalCV(senderAddress), // sender
          standardPrincipalCV(recipientAddress), // recipient  
          memo ? bufferCVFromString(memo) : noneCV() // memo
        ],
        senderKey: senderPrivateKey,
        network: this.network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Deny, // Safer for token transfers
      };

      const transaction = await makeContractCall(txOptions);
      const txid = await broadcastTransaction(transaction, this.network);

      logger.info('sBTC transfer initiated', {
        txid,
        senderAddress,
        recipientAddress,
        amount,
        contract: `${contractAddress}.${contractName}`
      });

      return txid;
    } catch (error) {
      logger.error('Failed to transfer sBTC:', error);
      throw error;
    }
  }

  // Initiate sBTC deposit using official deposit contract
  async initiateSBTCDeposit(amount: number, recipientAddress: string, senderPrivateKey: string): Promise<string> {
    try {
      const senderAddress = getAddressFromPrivateKey(
        senderPrivateKey,
        this.isMainnet ? TransactionVersion.Mainnet : TransactionVersion.Testnet
      );

      // Get sBTC deposit contract
      const [contractAddress, contractName] = (process.env.SBTC_DEPOSIT_CONTRACT || 
        'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-deposit').split('.');

      // Create deposit transaction
      const txOptions = {
        contractAddress,
        contractName,
        functionName: 'initiate-deposit',
        functionArgs: [
          uintCV(amount), // amount in sats
          standardPrincipalCV(recipientAddress), // recipient
          bufferCVFromString('StacksGate deposit') // memo
        ],
        senderKey: senderPrivateKey,
        network: this.network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
      };

      const transaction = await makeContractCall(txOptions);
      const txid = await broadcastTransaction(transaction, this.network);

      logger.info('sBTC deposit initiated', {
        txid,
        senderAddress,
        recipientAddress,
        amount,
        contract: `${contractAddress}.${contractName}`
      });

      return txid;
    } catch (error) {
      logger.error('Failed to initiate sBTC deposit:', error);
      throw error;
    }
  }

  // Initiate sBTC withdrawal  
  async initiateSBTCWithdrawal(params: SBTCWithdrawalParams, senderPrivateKey: string): Promise<string> {
    try {
      const senderAddress = getAddressFromPrivateKey(
        senderPrivateKey,
        this.isMainnet ? TransactionVersion.Mainnet : TransactionVersion.Testnet
      );

      // Get sBTC deposit contract (handles both deposits and withdrawals)
      const [contractAddress, contractName] = (process.env.SBTC_DEPOSIT_CONTRACT || 
        'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-deposit').split('.');

      // Create withdrawal transaction
      const txOptions = {
        contractAddress,
        contractName,
        functionName: 'initiate-withdrawal',
        functionArgs: [
          uintCV(params.amountSats), // amount in sats
          bufferCVFromString(params.bitcoinAddress), // bitcoin address
          bufferCVFromString(params.memo || 'StacksGate withdrawal') // memo
        ],
        senderKey: senderPrivateKey,
        network: this.network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
      };

      const transaction = await makeContractCall(txOptions);
      const txid = await broadcastTransaction(transaction, this.network);

      logger.info('sBTC withdrawal initiated', {
        txid,
        senderAddress,
        bitcoinAddress: params.bitcoinAddress,
        amountSats: params.amountSats,
        contract: `${contractAddress}.${contractName}`
      });

      return txid;
    } catch (error) {
      logger.error('Failed to initiate sBTC withdrawal:', error);
      throw error;
    }
  }

  // Get transaction status
  async getTransactionStatus(txid: string): Promise<TransactionStatus> {
    const cacheKey = `tx_status:${txid}`;
    
    try {
      // Check cache first
      const cachedStatus = await cacheGet<TransactionStatus>(cacheKey);
      if (cachedStatus && cachedStatus.status === 'confirmed') {
        return cachedStatus;
      }

      const response = await fetch(`${this.apiUrl}/extended/v1/tx/${txid}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch transaction status: ${response.statusText}`);
      }

      const data = await response.json();
      
      let status: 'pending' | 'confirmed' | 'failed';
      if (data.tx_status === 'success') {
        status = 'confirmed';
      } else if (data.tx_status === 'abort_by_response' || data.tx_status === 'abort_by_post_condition') {
        status = 'failed';
      } else {
        status = 'pending';
      }

      const result: TransactionStatus = {
        txid,
        status,
        blockHeight: data.block_height,
        confirmations: data.confirmations,
        error: data.tx_status === 'abort_by_response' ? data.tx_result?.repr : undefined,
      };

      // Cache confirmed/failed transactions for longer
      const cacheTime = status === 'pending' ? 30 : 300; // 30s for pending, 5min for final
      await cacheSet(cacheKey, result, cacheTime);
      
      return result;
    } catch (error) {
      logger.error('Failed to get transaction status:', { txid, error });
      
      return {
        txid,
        status: 'failed',
        error: (error as Error).message,
      };
    }
  }

  // Subscribe to transaction events
  subscribeToTransaction(txid: string, callback: (data: any) => void): () => void {
    const subscription = this.socketClient.subscribeTransaction(txid, (data) => {
      logger.debug('Transaction event received', { txid, event: data });
      callback(data);
    });

    // Return unsubscribe function
    return () => {
      subscription.unsubscribe();
    };
  }

  // Get current Bitcoin price in USD (for sBTC conversion)
  async getBitcoinPriceUSD(): Promise<number> {
    const cacheKey = 'btc_price_usd';
    
    try {
      // Check cache first (5 minute cache)
      const cachedPrice = await cacheGet<number>(cacheKey);
      if (cachedPrice !== null) {
        return cachedPrice;
      }

      // Try multiple price sources for reliability
      const priceSources = [
        {
          name: 'coinbase',
          url: 'https://api.coinbase.com/v2/exchange-rates?currency=BTC',
          parser: (data: any) => parseFloat(data.data.rates.USD)
        },
        {
          name: 'coingecko',
          url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
          parser: (data: any) => data.bitcoin.usd
        },
        {
          name: 'kraken',
          url: 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD',
          parser: (data: any) => parseFloat(Object.values(data.result)[0].c[0])
        }
      ];

      for (const source of priceSources) {
        try {
          const response = await fetch(source.url, {
            timeout: 5000, // 5 second timeout per source
          });
          
          if (!response.ok) continue;

          const data = await response.json();
          const price = source.parser(data);

          if (price && price > 0) {
            // Cache for 5 minutes
            await cacheSet(cacheKey, price, 300);
            
            logger.debug('Retrieved Bitcoin price', { source: source.name, price });
            return price;
          }
        } catch (error) {
          logger.warn(`Failed to get price from ${source.name}:`, error);
          continue;
        }
      }

      // If all sources fail, use fallback
      throw new Error('All price sources failed');
    } catch (error) {
      logger.error('Failed to get Bitcoin price from all sources:', error);
      
      // Return cached price if available
      const cachedPrice = await cacheGet<number>(cacheKey);
      if (cachedPrice !== null) {
        logger.info('Using cached Bitcoin price as fallback', { price: cachedPrice });
        return cachedPrice;
      }
      
      // Final fallback price (approximate current BTC price)
      const fallbackPrice = 45000;
      logger.warn('Using fallback Bitcoin price', { price: fallbackPrice });
      
      // Cache fallback for a short time
      await cacheSet(cacheKey, fallbackPrice, 60);
      return fallbackPrice;
    }
  }

  // Validate Stacks address
  isValidStacksAddress(address: string): boolean {
    try {
      // Basic validation - Stacks addresses start with SP (mainnet) or ST (testnet)
      const prefix = this.isMainnet ? 'SP' : 'ST';
      return address.startsWith(prefix) && address.length === 41;
    } catch (error) {
      return false;
    }
  }

  // Get network info
  async getNetworkInfo(): Promise<any> {
    try {
      const response = await fetch(`${this.apiUrl}/v2/info`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch network info: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      logger.error('Failed to get network info:', error);
      throw error;
    }
  }

  // Clean up resources
  disconnect(): void {
    if (this.socketClient) {
      // Close socket connections
      logger.info('StacksService disconnected');
    }
  }
}