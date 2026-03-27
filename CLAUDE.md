# AlphaLend SDK JavaScript

## Adding New Coin Types

Coin must be configured in `alphalend-contracts` first.

### Step 1: Update Constants

- **Production**: `src/constants/prodConstants.ts`
- **Development**: `src/constants/devConstants.ts`

```typescript
export const SYMBOL_COIN_TYPE = "0x...::module::TYPE";
export const SYMBOL_DECIMALS = 9;
```

### Step 2: Update Type Definitions

```typescript
export type SupportedCoin = "SUI" | "USDC" | ... | "SYMBOL";
```

### Step 3: Update Helper Functions

Add to `getCoinDecimals()` and similar utility functions.

### Build & Test

```bash
npm test
npm run build
```

### Important Notes

- Keep production and development constants in sync
- Coin types must match exactly with contract definitions
- Test with actual blockchain interactions before deployment
