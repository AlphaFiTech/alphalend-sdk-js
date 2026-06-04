# @mysten/sui v2 Compatibility Fixes

Catalogue of all workarounds applied during the `@mysten/sui 1.x → 2.17.0` migration.
Each entry notes the broken package, the symptom, the fix applied, and the upstream condition
that makes the fix removable.

---

## 1. `@mysten/bcs` v1 aliases

Broken packages (as of 2026-06-03):

| Package                                    | Used in                          | Installed                       | v1 names imported                                                             |
| ------------------------------------------ | -------------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| `@cetusprotocol/cetus-sui-clmm-sdk@5.4.0`  | alphalend-sdk-js, alphafi-sdk-js | `@mysten/bcs@2.x` via overrides | `fromB64`, `toB64`, `fromHEX`, `toHEX`, `fromB58`, `toB58` from `@mysten/bcs` |
| `@mysten/sui.js` (legacy, inside 7k/flowx) | alphalend-sdk-js                 | same                            | same                                                                          |

**Symptom:** Webpack build errors — `export 'fromB64' was not found in '@mysten/bcs'`.

**Fix applied:** `alphafi-fe/src/shims/bcsCompat.js` — re-exports all of `@mysten/bcs@2.x`
plus the renamed v1 aliases. Aliased globally in `webpack.config.js`:

```js
'@mysten/bcs': path.resolve(__dirname, 'src/shims/bcsCompat.js')
```

Safe to apply globally because `bcs` encoding utils have identical semantics in v1 and v2 —
there are no callers that would break from getting the v2 implementation under a v1 name.

**Removable when:** `@cetusprotocol/cetus-sui-clmm-sdk` ships a release that uses v2 names
(`fromBase64` etc.) natively. Latest as of this date: `5.4.0` — still v1 API.
Check: `npm view @cetusprotocol/cetus-sui-clmm-sdk peerDependencies`

---

## 2. `@mysten/sui/client` — `SuiClient` / `getFullnodeUrl` moved to `@mysten/sui/jsonRpc`

Broken packages (as of 2026-06-03):

| Package                                            | Used in                                           | v1 names imported                                       |
| -------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| `@bluefin-exchange/bluefin7k-aggregator-sdk@5.5.1` | alphalend-sdk-js (via `@7kprotocol/sdk-ts@3.6.0`) | `SuiClient`, `getFullnodeUrl` from `@mysten/sui/client` |
| `@flowx-finance/sdk@1.15.0`                        | alphalend-sdk-js (via `@7kprotocol/sdk-ts@3.6.0`) | same                                                    |
| `@cetusprotocol/aggregator-sdk@1.5.5`              | alphalend-sdk-js, alphafi-sdk-js                  | same                                                    |

**Symptom:** Webpack warnings — `export 'SuiClient' was not found in '@mysten/sui/client'`.
**Runtime impact:** `bluefin7k-aggregator-sdk/config/index.js` constructs `new SuiClient()` at
**module load** (not lazily), so any import of `@7kprotocol/sdk-ts` would have thrown in the
browser, breaking all 7k-routed swap pairs (cetus, aftermath, bluefin, flowx routes).

**Fix applied:** `alphafi-fe/src/shims/suiClientCompat.js` — re-exports all of
`@mysten/sui/client` v2 plus:

```js
export {
  SuiJsonRpcClient as SuiClient,
  getJsonRpcFullnodeUrl as getFullnodeUrl,
} from "@mysten/sui/dist/jsonRpc/index.mjs";
```

`SuiJsonRpcClient` is a safe drop-in: accepts `{ url }` with no `network` required and
retains all legacy RPC methods (`getCoins`, `getObject`, `getDynamicFields`, etc.).

Wired via a **context-scoped** `NormalModuleReplacementPlugin` in `webpack.config.js`:

```js
new webpack.NormalModuleReplacementPlugin(
  /^@mysten\/sui\/client$/,
  (resource) => {
    if (!resource.context.includes("alphalend-sdk-js")) return;
    resource.request = path.resolve(__dirname, "src/shims/suiClientCompat.js");
  },
);
```

**Critical:** scoped to `alphalend-sdk-js` tree only. `alphafi-sdk` and `alpha/sui-alpha-sdk`
are still on `@mysten/sui@1.45.0` and must resolve to their own native `SuiClient`. A global
alias would break them.

**Removable when:** `@7kprotocol/sdk-ts` ships a stable v2 release. `5.0.0-beta.2` already
declares `peerDependencies: { "@mysten/sui": "^2.17.0" }` and pulls in v2-ready bluefin7k/flowx
versions. Upgrade path:

```json
// alphalend-sdk-js/package.json
"@7kprotocol/sdk-ts": "^5.0.0"  // once stable
```

This removes the need for the `suiClientCompat.js` shim and the scoped replacement plugin.

---

## 3. `@mysten/sui/utils` — `fromHEX` / `toHEX` renamed to `fromHex` / `toHex`

Broken packages (as of 2026-06-03):

| Package                     | Used in                                           | v1 names imported                           |
| --------------------------- | ------------------------------------------------- | ------------------------------------------- |
| `@flowx-finance/sdk@1.15.0` | alphalend-sdk-js (via `@7kprotocol/sdk-ts@3.6.0`) | `fromHEX`, `toHEX` from `@mysten/sui/utils` |

**Symptom:** Webpack warnings — `export 'fromHEX' was not found in '@mysten/sui/utils'`.

**Fix applied:** `alphafi-fe/src/shims/suiUtilsCompat.js` — re-exports all of
`@mysten/sui/utils` v2 plus the full set of v1-cased aliases:

```js
export { fromHex as fromHEX, toHex as toHEX, fromBase64 as fromB64, ... }
```

Same scoped `NormalModuleReplacementPlugin` as above (client and utils share one plugin call).

**Removable when:** same trigger as fix #2 — `@7kprotocol/sdk-ts` stable v2 pulls in
`@flowx-finance/sdk@2.x` which already uses v2 names.

---

## 4. `bignumber.js` ESM/CJS interop — `BigNumber is not a constructor`

**Broken package:** `@cetusprotocol/aggregator-sdk@1.5.5` (introduced in this release; `1.4.2`
did not have this dependency).

**Dependency chain:**
`alphafi-sdk-js → @cetusprotocol/aggregator-sdk@1.5.5 → json-bigint@1.0.0`

`json-bigint` lazily does `require('bignumber.js')` inside its parser, expecting to receive the
`BigNumber` constructor function. With `conditionNames: ['browser', 'import', 'require', 'default']`
in webpack, `bignumber.js@9.3.1` can resolve to its ESM `bignumber.mjs` entry. When `json-bigint`
(CJS) then `require()`s it, webpack's ESM→CJS interop returns the namespace object
`{ default: BigNumber, BigNumber: BigNumber }` instead of the constructor, causing
`new BigNumber(string)` to throw at runtime.

**Symptom:** Runtime browser error — `TypeError: BigNumber is not a constructor` when calling
`getCetusSwapQuote()` (the aggregator SDK parses its API response with `json-bigint`).

**Fix applied:** Webpack alias forcing `bignumber.js` to its CJS file, bypassing `exports` map:

```js
'bignumber.js': path.resolve(__dirname, 'node_modules/bignumber.js/bignumber.js')
```

**Removable when:** `json-bigint` is updated to use static `import` (ESM) or `@cetusprotocol/aggregator-sdk`
replaces `json-bigint` with a pure-ESM bigint parser. Alternatively, if
`conditionNames` is ever narrowed to remove `'import'` for CJS modules, this also resolves.

---

## 5. `@naviprotocol/lending@1.4.6` — `SuiClient`/`getFullnodeUrl` from `@mysten/sui/client`

**Broken package:** `@naviprotocol/lending@1.4.6`
**Was used in:** `alphalend-sdk-js` (was a direct dependency; now removed)

**Symptom:** Same as fix #2 — `SuiClient`/`getFullnodeUrl` no longer exported from
`@mysten/sui/client` in v2. Navi's `dist/index.esm.js` line 3:

```js
import { SuiClient as de, getFullnodeUrl as me } from "@mysten/sui/client";
```

Worse: Navi runs `new SuiClient({ url: getFullnodeUrl("mainnet") })` at module **top-level**,
so merely importing it throws under v2. Because `alphalend-sdk-js`'s entry point re-exports the
flash-repay path, this crashed `import "@alphafi/alphalend-sdk"` itself.

**Original fix (removed):** a `patch-package` patch that rewrote line 3 of Navi's prebuilt dist
via a `"postinstall": "patch-package"` hook. This worked for **this repo's own dev/CI install
only**. It was NOT safe for published npm consumers: the `patches/` dir isn't in `files` (not
published), `patch-package` was a devDependency (absent downstream), and even shipped, `patch-package`
can't reliably patch a _hoisted transitive_ dep from a nested package's postinstall. So consumers
on `@mysten/sui` v2 would still crash on import.

**Current fix (vendoring):** the three flash-loan helpers we use (`flashloanPTB`,
`repayFlashLoanPTB`, `getAllFlashLoanAssets`) are vendored, faithfully ported from Navi's public
source, into `src/vendor/naviFlashloan.ts`. That file imports only v2-native `@mysten/sui` symbols
(`Transaction` type + `normalizeStructTag`) and does no eager client construction, so it works for
external npm consumers with no patch. The `@naviprotocol/lending` dependency, the `patches/` dir,
the `postinstall` hook, and the `patch-package` devDependency were all removed.

**Source of truth for the port:**
<https://github.com/naviprotocol/naviprotocol-monorepo/tree/main/packages/lending/src>
(`flashloan.ts`, `config.ts`, `pool.ts`, `utils.ts`, `market.ts` — vendored from v1.4.6).

**Removable when:** `@naviprotocol/lending` publishes a release that imports from
`@mysten/sui/jsonRpc` natively. Check: `npm view @naviprotocol/lending version`.
When that ships, delete `src/vendor/naviFlashloan.ts`, re-add `@naviprotocol/lending`, and
import the three helpers from it again.

---

## 6. `@cetusprotocol/cetus-sui-clmm-sdk@5.4.0` in alphalend-sdk-js — latent risk (not yet broken, no active shim)

**Package:** `@cetusprotocol/cetus-sui-clmm-sdk@5.4.0` listed as a direct `dependency` in
`alphalend-sdk-js/package.json`.

**Issue:** This package calls `getFullnodeUrl("testnet")` at **module top-level** (not inside a
function or class) and defines `RpcModule extends SuiClient` — both using v1 names from
`@mysten/sui/client`. Because of the global `overrides: { "@mysten/sui": "^2.17.0" }`, if this
package were ever imported, it would crash at module load.

**Current status: NOT a live problem.** No file in `alphalend-sdk-js/src/` imports this package,
and it does not appear in the built dist. It is an **unused direct dependency** that was declared
in `package.json` but has no source import anywhere in the codebase.

**Actions:**

- **Short-term:** Remove `@cetusprotocol/cetus-sui-clmm-sdk` from alphalend-sdk-js's
  `dependencies` in `package.json` since nothing imports it. This eliminates the latent risk.
- **If re-introduced:** Either upgrade to a v2-compatible cetus-clmm release, or add it to the
  scoped `NormalModuleReplacementPlugin` for `@mysten/sui/client` in `alphafi-fe/webpack.config.js`
  AND create a `patch-package` patch for the `getFullnodeUrl("testnet")` top-level call in the
  Node/test context.

## 7. `aftermath-ts-sdk@1.3.29` — v1 names in JSDoc only (no action needed)

**Package:** `aftermath-ts-sdk@1.3.29`, pulled in transitively by
`@7kprotocol/sdk-ts@3.6.0 → @flowx-finance/sdk@1.15.0`.

**Symptom check:** `import { SuiClient, SuiHTTPTransport } from "@mysten/sui/client"` appears
at line 36 of `dist/general/providers/aftermathApi.js` — but **only inside a JSDoc comment
block**, never as a live import statement. The module itself does not import from
`@mysten/sui/client` at runtime.

**Status:** Not broken, no shim or patch needed. Documented here because `aftermath-ts-sdk@2.x`
(peer `@mysten/sui >=2.0.0`) is available — this gets resolved automatically when
`@7kprotocol/sdk-ts` is upgraded to v5 (fix #2 upgrade path).

## 8. `@alphafi/stsui-sdk` — peer `@mysten/sui ^1.21.2` (older versions)

`stsui-sdk` was updated to `2.0.0` which now declares `@mysten/sui ^2.17.0`. The fix was to
bump the package and add `"@mysten/sui": "^2.17.0"` override in both `alphafi-sdk-js` and
`alphalend-sdk-js`. Documented here because if `stsui-sdk` is ever rolled back, the override
will mask the version mismatch silently.

---

## 9. Source-level renames (alphalend-sdk-js, applied permanently)

These are done and committed — no shims needed, listed for audit completeness.

| File                       | Change                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/models/blockchain.ts` | `SuiClient` → `SuiJsonRpcClient`, `getFullnodeUrl` → `getJsonRpcFullnodeUrl` (import from `@mysten/sui/jsonRpc`) |
| `src/models/blockchain.ts` | GraphQL schema import: `@mysten/sui/graphql/schemas/latest` → `@mysten/sui/graphql/schema`                       |
| `src/models/blockchain.ts` | `SuiGraphQLClient` construction: added `network` param                                                           |
| `src/core/client.ts`       | Same `SuiClient` → `SuiJsonRpcClient` rename                                                                     |

---

## Upgrade roadmap (priority order)

1. **`@7kprotocol/sdk-ts` stable v2** — single bump that eliminates fixes #2, #3, and
   `@bluefin-exchange/bluefin7k-aggregator-sdk` + `@flowx-finance/sdk` v1 shims.
   Watch: <https://www.npmjs.com/package/@7kprotocol/sdk-ts> — `5.0.0-beta.2` is out now.

2. **`@naviprotocol/lending` v2-clean release** — lets us drop the vendored copy (fix #5).
   Watch: <https://www.npmjs.com/package/@naviprotocol/lending> — latest `1.4.6` still broken.
   To remove: delete `src/vendor/naviFlashloan.ts`, re-add the dependency, and import the three
   flash-loan helpers from `@naviprotocol/lending` again.

3. **`@cetusprotocol/cetus-sui-clmm-sdk` v2-clean release** — eliminates fix #1 (`bcsCompat`
   shim). Latest as of 2026-06-03: `5.4.0` still on v1 bcs names.

4. **`json-bigint` replacement in `@cetusprotocol/aggregator-sdk`** — eliminates fix #4.

**Immediate action (no upstream needed):** Remove the unused `@cetusprotocol/cetus-sui-clmm-sdk`
dep from `alphalend-sdk-js/package.json` (fix #6) — it has no source imports and is a latent crash risk.

When fixes #1–#3 are done, the entire `alphafi-fe/src/shims/` directory, the related
`NormalModuleReplacementPlugin` entries in `webpack.config.js`, and the `patches/` patch file
can all be deleted.
