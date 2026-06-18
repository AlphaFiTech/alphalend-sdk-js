/**
 * Pyth Lazer price path: fetch one signed payload from the backend proxy, then IN THE PTB verify it via the
 * real on-chain `pyth_lazer` package and feed the verified `Update` to `oracle::ingest_lazer_update`. The
 * access token must never reach the browser, so the payload comes from the proxy, not the official
 * token+WebSocket client.
 */
import { Inputs, Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID, fromHex } from "@mysten/sui/utils";

/**
 * Fetch one fresh signed Lazer `update` blob from the backend proxy (`GET {proxyUrl}/lazer/update`),
 * ready for {@link appendLazerUpdate}. `maxAgeMs` (the per-network `LAZER_MAX_PROXY_AGE_MS` constant,
 * mirroring the proxy's own `LAZER_STALE_MS`) is the client-side freshness ceiling. Retries transient
 * failures with exponential backoff + jitter (the proxy 503s briefly during a Lazer WS reconnect; `fetch`
 * has no built-in retry), then fails closed — no Pyth fallback.
 */
export async function fetchLazerUpdateBytes(
  proxyUrl: string,
  maxAgeMs: number,
): Promise<Uint8Array> {
  const url = `${proxyUrl.replace(/\/+$/, "")}/lazer/update`;
  const attempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Lazer proxy request failed: ${response.status}`);
      }
      const { hex, ageMs } = (await response.json()) as {
        hex: string;
        ageMs: number;
      };
      // Fail closed: the proxy always sends ageMs on a 200 (and 503s when stale), so a missing/NaN
      // value means a malformed or wrong endpoint — never silently skip the freshness gate.
      if (typeof ageMs !== "number" || Number.isNaN(ageMs)) {
        throw new Error("Lazer proxy response missing ageMs");
      }
      if (ageMs > maxAgeMs) {
        throw new Error(`Lazer proxy payload is stale: ${ageMs}ms`);
      }
      return fromHex(hex);
    } catch (e) {
      lastErr = e;
      if (attempt < attempts) {
        // Exponential backoff with jitter (~600ms, ~1200ms). The proxy 503s during a Lazer WS reconnect
        // whose supervisor sleeps ~1s between attempts, so the total retry window must exceed that 1s — a
        // linear ~900ms budget could give up mid-reconnect. Jitter avoids a thundering herd of clients
        // retrying in lockstep after a shared blip.
        const backoffMs = 300 * 2 ** attempt + Math.floor(Math.random() * 150);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
  }
  throw lastErr;
}

/**
 * Append the permissionless Lazer refresh to a PTB before any oracle price read. Two move calls:
 *   1. verify the signed Lazer update IN THE PTB via the real on-chain `pyth_lazer` package (Pyth's
 *      "verify in PTBs, not contracts" model) → a verified `Update`;
 *   2. hand that `Update` to `oracle::ingest_lazer_update`, which writes every tracked feed it carries.
 * Verifying in the PTB means our oracle never links the verifier fn, so a Pyth verifier upgrade only
 * changes `lazerPackageId` here — no oracle republish. One call refreshes every feed in `updateBytes`.
 *
 * `lazerPackageId` MUST be the package version exposing `parse_and_verify_le_ecdsa_update_v2` (the v2 id),
 * not the type-origin id. `oracleInitialSharedVersion` is the global Oracle's initial shared version —
 * passed so the mutating `ingest_lazer_update` references the Oracle as an explicit mutable
 * `SharedObjectRef`, exactly like the Pyth writer (`update_price_from_pyth`) it replaces.
 */
export function appendLazerUpdate(
  tx: Transaction,
  lazerPackageId: string,
  oraclePackageId: string,
  oracleObjectId: string,
  oracleInitialSharedVersion: string,
  lazerStateId: string,
  updateBytes: Uint8Array,
): void {
  const verifiedUpdate = tx.moveCall({
    target: `${lazerPackageId}::pyth_lazer::parse_and_verify_le_ecdsa_update_v2`,
    arguments: [
      tx.object(lazerStateId),
      tx.object(SUI_CLOCK_OBJECT_ID),
      tx.pure.vector("u8", Array.from(updateBytes)),
    ],
  });
  tx.moveCall({
    target: `${oraclePackageId}::oracle::ingest_lazer_update`,
    arguments: [
      // Explicit mutable shared ref + initial shared version, mirroring update_price_from_pyth.
      tx.object(
        Inputs.SharedObjectRef({
          objectId: oracleObjectId,
          initialSharedVersion: oracleInitialSharedVersion,
          mutable: true,
        }),
      ),
      verifiedUpdate,
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
}
