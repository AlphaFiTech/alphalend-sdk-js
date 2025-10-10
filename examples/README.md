# AlphaLend SDK Examples

This directory contains example scripts demonstrating how to use the AlphaLend SDK.

## Prerequisites

1. Install dependencies:
```bash
npm install
```

2. Build the SDK:
```bash
npm run build
```

## Running Examples

### Get User Portfolio

Fetches and displays a user's portfolio information from the AlphaLend protocol.

```bash
# Using environment variables
USER_ADDRESS=0x... NETWORK=mainnet node examples/getUserPortfolio.mjs

# Or edit the script to hardcode your address
node examples/getUserPortfolio.mjs
```

**Environment Variables:**
- `USER_ADDRESS`: The Sui address to fetch portfolio for
- `NETWORK`: Network to use (`mainnet`, `testnet`, or `devnet`) - defaults to `mainnet`

### Diagnose Initialization Issues

Tests the SDK initialization and coin metadata fetching to help diagnose issues.

```bash
node examples/diagnoseInit.mjs
```

This diagnostic script will:
- Test GraphQL API connectivity
- Fetch and validate coin metadata
- Identify any missing or null data
- Provide detailed analysis and recommendations

## Common Issues

### Error: "Cannot read properties of null (reading 'coinInfo')"

This error occurs when the GraphQL API returns incomplete or null coin information during initialization.

**Root Cause:**
The SDK fetches coin metadata (decimals, price feed IDs, symbols) from the AlphaLend GraphQL API during initialization. If the API response contains null values for required fields, the initialization fails.

**Solution:**
1. Run the diagnostic script: `node examples/diagnoseInit.mjs`
2. Check network connectivity to `https://api.alphalend.xyz/public/graphql`
3. Ensure all markets have complete coin metadata in the API
4. Contact the AlphaLend team if the diagnostic shows API issues

### Error: "Failed to initialize market data"

This error occurs when the GraphQL API request fails entirely.

**Solution:**
1. Run the diagnostic: `node examples/diagnoseInit.mjs`
2. Verify you have an internet connection
3. Check for firewall or proxy issues blocking the request
4. Contact support if the API endpoint is unreachable
