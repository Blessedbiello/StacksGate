-- StacksGate Database Schema
-- PostgreSQL initialization script

-- Create database if not exists (handled by docker-compose)
-- CREATE DATABASE IF NOT EXISTS stacksgate;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Merchants table
CREATE TABLE merchants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    business_name VARCHAR(255) NOT NULL,
    website_url VARCHAR(255),
    api_key_public VARCHAR(255) UNIQUE NOT NULL,
    api_key_secret VARCHAR(255) UNIQUE NOT NULL,
    webhook_url VARCHAR(500),
    webhook_secret VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment intents table
CREATE TABLE payment_intents (
    id VARCHAR(50) PRIMARY KEY, -- pi_xxxxx format
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    amount_sats BIGINT NOT NULL, -- Amount in satoshis
    amount_usd DECIMAL(10, 2), -- USD equivalent at creation time
    currency VARCHAR(3) DEFAULT 'BTC',
    status VARCHAR(50) DEFAULT 'requires_payment', -- requires_payment, processing, succeeded, failed, canceled
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- sBTC specific fields
    stacks_address VARCHAR(255), -- Customer's Stacks address
    bitcoin_address VARCHAR(255), -- Bitcoin deposit address
    sbtc_tx_id VARCHAR(255), -- sBTC transaction ID
    confirmation_count INTEGER DEFAULT 0,
    
    -- Webhook tracking
    webhook_delivered BOOLEAN DEFAULT false,
    webhook_attempts INTEGER DEFAULT 0,
    last_webhook_attempt TIMESTAMP,
    
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment intent events for audit trail
CREATE TABLE payment_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_intent_id VARCHAR(50) NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL, -- payment_intent.created, payment_intent.processing, etc.
    data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Webhook delivery logs
CREATE TABLE webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    payment_intent_id VARCHAR(50) REFERENCES payment_intents(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    webhook_url VARCHAR(500) NOT NULL,
    request_payload JSONB NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    delivered BOOLEAN DEFAULT false,
    attempt_number INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- sBTC transaction monitoring
CREATE TABLE sbtc_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_intent_id VARCHAR(50) REFERENCES payment_intents(id) ON DELETE CASCADE,
    bitcoin_txid VARCHAR(255), -- Bitcoin transaction ID
    stacks_txid VARCHAR(255), -- Stacks transaction ID
    deposit_address VARCHAR(255) NOT NULL,
    amount_sats BIGINT NOT NULL,
    confirmation_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending', -- pending, confirmed, failed
    block_height INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_merchants_email ON merchants(email);
CREATE INDEX idx_merchants_api_key_public ON merchants(api_key_public);
CREATE INDEX idx_payment_intents_merchant_id ON payment_intents(merchant_id);
CREATE INDEX idx_payment_intents_status ON payment_intents(status);
CREATE INDEX idx_payment_intents_created_at ON payment_intents(created_at);
CREATE INDEX idx_payment_events_payment_intent_id ON payment_events(payment_intent_id);
CREATE INDEX idx_webhook_logs_merchant_id ON webhook_logs(merchant_id);
CREATE INDEX idx_sbtc_transactions_payment_intent_id ON sbtc_transactions(payment_intent_id);
CREATE INDEX idx_sbtc_transactions_bitcoin_txid ON sbtc_transactions(bitcoin_txid);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_merchants_updated_at BEFORE UPDATE ON merchants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_intents_updated_at BEFORE UPDATE ON payment_intents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample merchant for development
INSERT INTO merchants (
    email, 
    password_hash, 
    business_name, 
    website_url,
    api_key_public,
    api_key_secret,
    webhook_url
) VALUES (
    'demo@stacksgate.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4/5k4mUlg6', -- 'password123'
    'Demo Merchant',
    'https://demo.stacksgate.com',
    'pk_test_' || encode(gen_random_bytes(24), 'hex'),
    'sk_test_' || encode(gen_random_bytes(32), 'hex'),
    'https://demo.stacksgate.com/webhook'
);