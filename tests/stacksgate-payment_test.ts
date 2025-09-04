import {
  Clarinet,
  Tx,
  Chain,
  Account,
  types
} from 'https://deno.land/x/clarinet@v1.5.4/index.ts';
import { assertEquals } from 'https://deno.land/std@0.166.0/testing/asserts.ts';

Clarinet.test({
  name: "Can create payment intent",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const merchant = accounts.get('wallet_1')!;
    
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksgate-payment',
        'create-payment',
        [
          types.ascii("test-payment-123"),
          types.uint(100000), // 0.001 BTC in sats
          types.principal(merchant.address)
        ],
        deployer.address
      )
    ]);
    
    assertEquals(block.receipts.length, 1);
    assertEquals(block.receipts[0].result, `(ok "test-payment-123")`);
  },
});

Clarinet.test({
  name: "Can retrieve payment details",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const merchant = accounts.get('wallet_1')!;
    
    // Create payment first
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksgate-payment', 
        'create-payment',
        [
          types.ascii("test-payment-456"),
          types.uint(50000),
          types.principal(merchant.address)
        ],
        deployer.address
      )
    ]);
    
    // Retrieve payment
    let getPayment = chain.callReadOnlyFn(
      'stacksgate-payment',
      'get-payment', 
      [types.ascii("test-payment-456")],
      deployer.address
    );
    
    assertEquals(getPayment.result.includes('merchant: ' + deployer.address), true);
    assertEquals(getPayment.result.includes('amount: u50000'), true);
    assertEquals(getPayment.result.includes('status: "pending"'), true);
  },
});

Clarinet.test({
  name: "Cannot create payment with zero amount",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const merchant = accounts.get('wallet_1')!;
    
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksgate-payment',
        'create-payment',
        [
          types.ascii("invalid-payment"),
          types.uint(0), // Invalid zero amount
          types.principal(merchant.address)
        ],
        deployer.address
      )
    ]);
    
    assertEquals(block.receipts.length, 1);
    assertEquals(block.receipts[0].result, `(err u400)`); // ERR_INVALID_AMOUNT
  },
});

Clarinet.test({
  name: "Can check sBTC balance requirement",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    
    // Check if deployer can afford a payment
    // Note: In devnet, accounts are automatically funded with sBTC
    let canAfford = chain.callReadOnlyFn(
      'stacksgate-payment',
      'can-afford-payment',
      [
        types.principal(deployer.address),
        types.uint(100000) // 0.001 BTC in sats
      ],
      deployer.address
    );
    
    // Should be true in devnet (auto-funded accounts)
    assertEquals(canAfford.result, 'true');
  },
});

Clarinet.test({
  name: "Can get contract stats",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    
    let stats = chain.callReadOnlyFn(
      'stacksgate-payment',
      'get-stats',
      [],
      deployer.address
    );
    
    assertEquals(stats.result.includes('contract-owner: ' + deployer.address), true);
  },
});