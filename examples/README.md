# AlphaLend SDK Examples

This directory contains example scripts demonstrating how to use the AlphaLend SDK.

## Setup

### Test with Published SDK (v1.1.20)

This tests the published npm package version that users will install:

```bash
cd examples
npm install
```

This installs `@alphafi/alphalend-sdk@1.1.20` from npm.

### Test with Local Build

To test with your local development version:

```bash
# From the root SDK directory
npm install
npm run build
```

## Running Examples

### 1. Get User Portfolio (Published SDK)

Uses the published `@alphafi/alphalend-sdk@1.1.20` from npm:

```bash
cd examples
npm install
USER_ADDRESS=0x... node getUserPortfolioPublished.mjs
```

Or use the npm script:
```bash
cd examples
npm install
USER_ADDRESS=0x... npm run test:published
```

**Environment Variables:**
- `USER_ADDRESS`: The Sui address to fetch portfolio for (required)
- `NETWORK`: Network to use (`mainnet`, `testnet`, or `devnet`) - defaults to `mainnet`

### 2. Get User Portfolio (Local Build)

Uses the local build from `../dist/esm/`:

```bash
# First build the SDK
cd ..
npm run build

# Then run the example
cd examples
USER_ADDRESS=0x... node getUserPortfolioLocal.mjs
```

Or use the npm script:
```bash
cd examples
USER_ADDRESS=0x... npm run test:local
```

### 3. Diagnose Initialization Issues

Tests the SDK initialization and coin metadata fetching to help diagnose issues:

```bash
cd examples
node diagnoseInit.mjs
```

Or use the npm script:
```bash
cd examples
npm run diagnose
```

This diagnostic script will:
- Test GraphQL API connectivity
- Fetch and validate coin metadata
- Identify any missing or null data
- Provide detailed analysis and recommendations

## File Overview

| File | Purpose | SDK Source |
|------|---------|------------|
| `getUserPortfolioPublished.mjs` | Test with published npm package | `@alphafi/alphalend-sdk` (v1.1.20) |
| `getUserPortfolioLocal.mjs` | Test with local build | `../dist/esm/index.js` |
| `diagnoseInit.mjs` | Diagnostic tool for API/initialization issues | N/A (direct API test) |
| `package.json` | Dependencies for published SDK testing | Specifies v1.1.20 |

## Common Issues

### Error: "Cannot read properties of null (reading 'coinInfo')"

This error occurs when the GraphQL API returns incomplete or null coin information during initialization.

**Root Cause:**
The SDK fetches coin metadata (decimals, price feed IDs, symbols) from the AlphaLend GraphQL API during initialization. If the API response contains null values for required fields, the initialization fails.

**Solution:**
1. Run the diagnostic script: `node diagnoseInit.mjs`
2. Check network connectivity to `https://api.alphalend.xyz/public/graphql`
3. Ensure all markets have complete coin metadata in the API
4. Contact the AlphaLend team if the diagnostic shows API issues

### Error: "Failed to initialize market data"

This error occurs when the GraphQL API request fails entirely.

**Solution:**
1. Run the diagnostic: `node diagnoseInit.mjs`
2. Verify you have an internet connection
3. Check for firewall or proxy issues blocking the request
4. Contact support if the API endpoint is unreachable

### Error: "Cannot find module '@alphafi/alphalend-sdk'"

You haven't installed the dependencies in the examples directory.

**Solution:**
```bash
cd examples
npm install
```

### Error: "Cannot find module '../dist/esm/index.js'"

The local SDK hasn't been built yet.

**Solution:**
```bash
cd ..
npm run build
cd examples
```

## Example Usage

### Testing Published SDK with Mainnet Address

```bash
cd examples
npm install
USER_ADDRESS=0x742ce1243c22e38ec338293847a2b4c4e5d3f8a2c1a8e9f0b2c3d4e5f6 node getUserPortfolioPublished.mjs
```

### Testing Local Build with Testnet

```bash
# Build SDK first
cd ..
npm run build

# Run example
cd examples
USER_ADDRESS=0x742ce1243c22e38ec338293847a2b4c4e5d3f8a2c1a8e9f0b2c3d4e5f6 NETWORK=testnet node getUserPortfolioLocal.mjs
```

### Run Diagnostic Only

```bash
cd examples
node diagnoseInit.mjs
```

## Additional Documentation

- **TROUBLESHOOTING.md** - Comprehensive troubleshooting guide
- **ISSUE_ANALYSIS.md** - Technical analysis of the coinInfo error
