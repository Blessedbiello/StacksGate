"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StacksService = void 0;
const network_1 = require("@stacks/network");
const transactions_1 = require("@stacks/transactions");
const blockchain_api_client_1 = require("@stacks/blockchain-api-client");
const logger_1 = require("@/utils/logger");
const redis_1 = require("@/utils/redis");
class StacksService {
    network;
    apiUrl;
    isMainnet;
    socketClient;
    constructor() {
        const networkType = process.env.STACKS_NETWORK || 'testnet';
        this.isMainnet = networkType === 'mainnet';
        if (this.isMainnet) {
            this.network = new network_1.StacksMainnet();
            this.apiUrl = process.env.STACKS_API_URL || 'https://api.mainnet.hiro.so';
        }
        else {
            this.network = new network_1.StacksTestnet();
            this.apiUrl = process.env.STACKS_API_URL || 'https://api.testnet.hiro.so';
        }
        this.network.coreApiUrl = this.apiUrl;
        this.socketClient = new blockchain_api_client_1.StacksApiSocketClient({ url: this.apiUrl });
        logger_1.logger.info('StacksService initialized', {
            network: networkType,
            apiUrl: this.apiUrl,
        });
    }
    getNetwork() {
        return this.network;
    }
    getConfig() {
        return {
            network: this.network,
            apiUrl: this.apiUrl,
            isMainnet: this.isMainnet,
        };
    }
    generateDepositAddress() {
        const privateKey = (0, transactions_1.createStacksPrivateKey)();
        const address = (0, transactions_1.getAddressFromPrivateKey)(privateKey.data, this.isMainnet ? transactions_1.TransactionVersion.Mainnet : transactions_1.TransactionVersion.Testnet);
        return {
            address,
            privateKey: privateKey.data,
        };
    }
    async monitorSBTCDeposit(bitcoinTxid, expectedAmount) {
        const cacheKey = `sbtc_deposit:${bitcoinTxid}`;
        try {
            const cachedStatus = await (0, redis_1.cacheGet)(cacheKey);
            if (cachedStatus && cachedStatus.status !== 'pending') {
                return cachedStatus;
            }
            const btcResponse = await fetch(`${this.apiUrl}/extended/v1/tx/${bitcoinTxid}`);
            if (!btcResponse.ok) {
                if (btcResponse.status === 404) {
                    const status = {
                        txid: bitcoinTxid,
                        status: 'pending',
                    };
                    await (0, redis_1.cacheSet)(cacheKey, status, 30);
                    return status;
                }
                throw new Error(`Failed to fetch Bitcoin transaction: ${btcResponse.statusText}`);
            }
            const btcTxData = await btcResponse.json();
            if (!btcTxData.canonical || btcTxData.tx_status !== 'success') {
                const status = {
                    txid: bitcoinTxid,
                    status: 'pending',
                    blockHeight: btcTxData.block_height,
                    confirmations: btcTxData.confirmations || 0,
                };
                await (0, redis_1.cacheSet)(cacheKey, status, 30);
                return status;
            }
            const eventsResponse = await fetch(`${this.apiUrl}/extended/v1/tx/${bitcoinTxid}/events`);
            if (eventsResponse.ok) {
                const eventsData = await eventsResponse.json();
                const sbtcEvent = eventsData.events?.find((event) => event.event_type === 'smart_contract_log' &&
                    (event.contract_log?.contract_id?.includes('sbtc') ||
                        event.contract_log?.contract_id?.includes('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM')));
                if (sbtcEvent) {
                    const status = {
                        txid: bitcoinTxid,
                        status: 'confirmed',
                        blockHeight: btcTxData.block_height,
                        confirmations: btcTxData.confirmations || 0,
                    };
                    await (0, redis_1.cacheSet)(cacheKey, status, 300);
                    return status;
                }
            }
            const status = {
                txid: bitcoinTxid,
                status: btcTxData.confirmations >= 1 ? 'confirmed' : 'pending',
                blockHeight: btcTxData.block_height,
                confirmations: btcTxData.confirmations || 0,
            };
            const cacheTime = status.status === 'confirmed' ? 300 : 30;
            await (0, redis_1.cacheSet)(cacheKey, status, cacheTime);
            return status;
        }
        catch (error) {
            logger_1.logger.error('Failed to monitor sBTC deposit:', { bitcoinTxid, error });
            const errorStatus = {
                txid: bitcoinTxid,
                status: 'failed',
                error: error.message,
            };
            await (0, redis_1.cacheSet)(cacheKey, errorStatus, 60);
            return errorStatus;
        }
    }
    async getSBTCBalance(address) {
        const cacheKey = `sbtc_balance:${address}`;
        try {
            const cachedBalance = await (0, redis_1.cacheGet)(cacheKey);
            if (cachedBalance !== null) {
                return cachedBalance;
            }
            const sbtcTokenContract = process.env.SBTC_TOKEN_CONTRACT ||
                (this.isMainnet
                    ? 'SP3DX3H4FEYZJZ586MFBS25ZW3HZDMEW92260R2PR.sbtc-token'
                    : 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token');
            const response = await fetch(`${this.apiUrl}/extended/v1/tokens/ft/${sbtcTokenContract}/balances/${address}`);
            if (!response.ok) {
                if (response.status === 404) {
                    await (0, redis_1.cacheSet)(cacheKey, 0, 30);
                    return 0;
                }
                throw new Error(`Failed to fetch sBTC balance: ${response.statusText}`);
            }
            const data = await response.json();
            const balance = parseInt(data.balance || '0');
            await (0, redis_1.cacheSet)(cacheKey, balance, 30);
            logger_1.logger.debug('Retrieved sBTC balance', { address, balance, contract: sbtcTokenContract });
            return balance;
        }
        catch (error) {
            logger_1.logger.error('Failed to get sBTC balance:', { address, error });
            const cachedBalance = await (0, redis_1.cacheGet)(cacheKey);
            return cachedBalance || 0;
        }
    }
    async transferSBTC(recipientAddress, amount, senderPrivateKey, memo) {
        try {
            const senderAddress = (0, transactions_1.getAddressFromPrivateKey)(senderPrivateKey, this.isMainnet ? transactions_1.TransactionVersion.Mainnet : transactions_1.TransactionVersion.Testnet);
            const [contractAddress, contractName] = (process.env.SBTC_TOKEN_CONTRACT ||
                (this.isMainnet
                    ? 'SP3DX3H4FEYZJZ586MFBS25ZW3HZDMEW92260R2PR.sbtc-token'
                    : 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token')).split('.');
            const txOptions = {
                contractAddress,
                contractName,
                functionName: 'transfer',
                functionArgs: [
                    (0, transactions_1.uintCV)(amount),
                    (0, transactions_1.standardPrincipalCV)(senderAddress),
                    (0, transactions_1.standardPrincipalCV)(recipientAddress),
                    memo ? (0, transactions_1.bufferCVFromString)(memo) : (0, transactions_1.noneCV)()
                ],
                senderKey: senderPrivateKey,
                network: this.network,
                anchorMode: transactions_1.AnchorMode.Any,
                postConditionMode: transactions_1.PostConditionMode.Deny,
            };
            const transaction = await (0, transactions_1.makeContractCall)(txOptions);
            const txid = await (0, transactions_1.broadcastTransaction)(transaction, this.network);
            logger_1.logger.info('sBTC transfer initiated', {
                txid,
                senderAddress,
                recipientAddress,
                amount,
                contract: `${contractAddress}.${contractName}`
            });
            return txid;
        }
        catch (error) {
            logger_1.logger.error('Failed to transfer sBTC:', error);
            throw error;
        }
    }
    async initiateSBTCDeposit(amount, recipientAddress, senderPrivateKey) {
        try {
            const senderAddress = (0, transactions_1.getAddressFromPrivateKey)(senderPrivateKey, this.isMainnet ? transactions_1.TransactionVersion.Mainnet : transactions_1.TransactionVersion.Testnet);
            const [contractAddress, contractName] = (process.env.SBTC_DEPOSIT_CONTRACT ||
                'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-deposit').split('.');
            const txOptions = {
                contractAddress,
                contractName,
                functionName: 'initiate-deposit',
                functionArgs: [
                    (0, transactions_1.uintCV)(amount),
                    (0, transactions_1.standardPrincipalCV)(recipientAddress),
                    (0, transactions_1.bufferCVFromString)('StacksGate deposit')
                ],
                senderKey: senderPrivateKey,
                network: this.network,
                anchorMode: transactions_1.AnchorMode.Any,
                postConditionMode: transactions_1.PostConditionMode.Allow,
            };
            const transaction = await (0, transactions_1.makeContractCall)(txOptions);
            const txid = await (0, transactions_1.broadcastTransaction)(transaction, this.network);
            logger_1.logger.info('sBTC deposit initiated', {
                txid,
                senderAddress,
                recipientAddress,
                amount,
                contract: `${contractAddress}.${contractName}`
            });
            return txid;
        }
        catch (error) {
            logger_1.logger.error('Failed to initiate sBTC deposit:', error);
            throw error;
        }
    }
    async initiateSBTCWithdrawal(params, senderPrivateKey) {
        try {
            const senderAddress = (0, transactions_1.getAddressFromPrivateKey)(senderPrivateKey, this.isMainnet ? transactions_1.TransactionVersion.Mainnet : transactions_1.TransactionVersion.Testnet);
            const [contractAddress, contractName] = (process.env.SBTC_DEPOSIT_CONTRACT ||
                'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-deposit').split('.');
            const txOptions = {
                contractAddress,
                contractName,
                functionName: 'initiate-withdrawal',
                functionArgs: [
                    (0, transactions_1.uintCV)(params.amountSats),
                    (0, transactions_1.bufferCVFromString)(params.bitcoinAddress),
                    (0, transactions_1.bufferCVFromString)(params.memo || 'StacksGate withdrawal')
                ],
                senderKey: senderPrivateKey,
                network: this.network,
                anchorMode: transactions_1.AnchorMode.Any,
                postConditionMode: transactions_1.PostConditionMode.Allow,
            };
            const transaction = await (0, transactions_1.makeContractCall)(txOptions);
            const txid = await (0, transactions_1.broadcastTransaction)(transaction, this.network);
            logger_1.logger.info('sBTC withdrawal initiated', {
                txid,
                senderAddress,
                bitcoinAddress: params.bitcoinAddress,
                amountSats: params.amountSats,
                contract: `${contractAddress}.${contractName}`
            });
            return txid;
        }
        catch (error) {
            logger_1.logger.error('Failed to initiate sBTC withdrawal:', error);
            throw error;
        }
    }
    async getTransactionStatus(txid) {
        const cacheKey = `tx_status:${txid}`;
        try {
            const cachedStatus = await (0, redis_1.cacheGet)(cacheKey);
            if (cachedStatus && cachedStatus.status === 'confirmed') {
                return cachedStatus;
            }
            const response = await fetch(`${this.apiUrl}/extended/v1/tx/${txid}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch transaction status: ${response.statusText}`);
            }
            const data = await response.json();
            let status;
            if (data.tx_status === 'success') {
                status = 'confirmed';
            }
            else if (data.tx_status === 'abort_by_response' || data.tx_status === 'abort_by_post_condition') {
                status = 'failed';
            }
            else {
                status = 'pending';
            }
            const result = {
                txid,
                status,
                blockHeight: data.block_height,
                confirmations: data.confirmations,
                error: data.tx_status === 'abort_by_response' ? data.tx_result?.repr : undefined,
            };
            const cacheTime = status === 'pending' ? 30 : 300;
            await (0, redis_1.cacheSet)(cacheKey, result, cacheTime);
            return result;
        }
        catch (error) {
            logger_1.logger.error('Failed to get transaction status:', { txid, error });
            return {
                txid,
                status: 'failed',
                error: error.message,
            };
        }
    }
    subscribeToTransaction(txid, callback) {
        const subscription = this.socketClient.subscribeTransaction(txid, (data) => {
            logger_1.logger.debug('Transaction event received', { txid, event: data });
            callback(data);
        });
        return () => {
            subscription.unsubscribe();
        };
    }
    async getBitcoinPriceUSD() {
        const cacheKey = 'btc_price_usd';
        try {
            const cachedPrice = await (0, redis_1.cacheGet)(cacheKey);
            if (cachedPrice !== null) {
                return cachedPrice;
            }
            const priceSources = [
                {
                    name: 'coinbase',
                    url: 'https://api.coinbase.com/v2/exchange-rates?currency=BTC',
                    parser: (data) => parseFloat(data.data.rates.USD)
                },
                {
                    name: 'coingecko',
                    url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
                    parser: (data) => data.bitcoin.usd
                },
                {
                    name: 'kraken',
                    url: 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD',
                    parser: (data) => parseFloat(Object.values(data.result)[0].c[0])
                }
            ];
            for (const source of priceSources) {
                try {
                    const response = await fetch(source.url, {
                        timeout: 5000,
                    });
                    if (!response.ok)
                        continue;
                    const data = await response.json();
                    const price = source.parser(data);
                    if (price && price > 0) {
                        await (0, redis_1.cacheSet)(cacheKey, price, 300);
                        logger_1.logger.debug('Retrieved Bitcoin price', { source: source.name, price });
                        return price;
                    }
                }
                catch (error) {
                    logger_1.logger.warn(`Failed to get price from ${source.name}:`, error);
                    continue;
                }
            }
            throw new Error('All price sources failed');
        }
        catch (error) {
            logger_1.logger.error('Failed to get Bitcoin price from all sources:', error);
            const cachedPrice = await (0, redis_1.cacheGet)(cacheKey);
            if (cachedPrice !== null) {
                logger_1.logger.info('Using cached Bitcoin price as fallback', { price: cachedPrice });
                return cachedPrice;
            }
            const fallbackPrice = 45000;
            logger_1.logger.warn('Using fallback Bitcoin price', { price: fallbackPrice });
            await (0, redis_1.cacheSet)(cacheKey, fallbackPrice, 60);
            return fallbackPrice;
        }
    }
    isValidStacksAddress(address) {
        try {
            const prefix = this.isMainnet ? 'SP' : 'ST';
            return address.startsWith(prefix) && address.length === 41;
        }
        catch (error) {
            return false;
        }
    }
    async getNetworkInfo() {
        try {
            const response = await fetch(`${this.apiUrl}/v2/info`);
            if (!response.ok) {
                throw new Error(`Failed to fetch network info: ${response.statusText}`);
            }
            return response.json();
        }
        catch (error) {
            logger_1.logger.error('Failed to get network info:', error);
            throw error;
        }
    }
    disconnect() {
        if (this.socketClient) {
            logger_1.logger.info('StacksService disconnected');
        }
    }
}
exports.StacksService = StacksService;
