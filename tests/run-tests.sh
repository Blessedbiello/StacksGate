#!/bin/bash

# StacksGate Test Runner
# Runs all test suites for the StacksGate MVP

set -e  # Exit on any error

echo "🚀 StacksGate MVP Test Suite"
echo "=============================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL=${API_URL:-"http://localhost:3000"}
WEBHOOK_URL=${WEBHOOK_URL:-"https://webhook.site/$(uuidgen)"}

echo -e "${BLUE}Configuration:${NC}"
echo "  API URL: $API_URL"
echo "  Webhook URL: $WEBHOOK_URL"
echo ""

# Check if API is running
echo -e "${BLUE}🔍 Checking API availability...${NC}"
if ! curl -s -f "$API_URL/health" > /dev/null; then
    echo -e "${RED}❌ API is not available at $API_URL${NC}"
    echo "   Please start the backend server first:"
    echo "   cd backend && npm run dev"
    exit 1
fi
echo -e "${GREEN}✅ API is running${NC}"
echo ""

# Install test dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}📦 Installing test dependencies...${NC}"
    npm install
    echo ""
fi

# Track test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

run_test() {
    local test_name="$1"
    local test_command="$2"
    local test_description="$3"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo -e "${BLUE}🧪 Running $test_name...${NC}"
    echo "   $test_description"
    
    if eval "$test_command"; then
        echo -e "${GREEN}✅ $test_name PASSED${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}❌ $test_name FAILED${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    echo ""
}

# Run test suites
run_test "Webhook Security Test" \
         "API_URL=$API_URL node webhook-test.js" \
         "Tests webhook signature generation and verification"

run_test "API Integration Test" \
         "API_URL=$API_URL node api-test.js" \
         "Tests all REST API endpoints and error handling"

run_test "End-to-End Transaction Test" \
         "API_URL=$API_URL WEBHOOK_URL=$WEBHOOK_URL node e2e-transaction-test.js" \
         "Tests complete payment flow with webhooks"

# Test Summary
echo "=============================="
echo -e "${BLUE}📊 Test Summary${NC}"
echo "=============================="
echo "Total Tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 All tests passed! StacksGate MVP is ready!${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}💥 $FAILED_TESTS test(s) failed. Please check the output above.${NC}"
    exit 1
fi