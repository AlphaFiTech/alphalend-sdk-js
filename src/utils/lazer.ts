import { Inputs, Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID, fromHex } from "@mysten/sui/utils";

// Per-attempt request timeout (4s). The proxy serves a cached blob, so sub-second is normal; this
// bounds a wedged proxy whose hung fetch would otherwise never reject, with headroom for a cold
// mobile connection.
const LAZER_FETCH_TIMEOUT_MS = 4000;
const LAZER_FETCH_ATTEMPTS = 3;

export async function fetchLazerUpdateBytes(
  proxyUrl: string,
): Promise<Uint8Array> {
  const url = `${proxyUrl.replace(/\/+$/, "")}/lazer/update`;
  let attempt = 0;
  let lastErr: unknown;

  while (attempt < LAZER_FETCH_ATTEMPTS) {
    attempt++;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      LAZER_FETCH_TIMEOUT_MS,
    );

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Lazer proxy request failed: ${res.status}`);
      const { hex } = (await res.json()) as { hex?: string };
      if (!hex) throw new Error("Lazer proxy response missing hex");
      return fromHex(hex);
    } catch (err) {
      lastErr = err;
      if (attempt < LAZER_FETCH_ATTEMPTS) {
        // exponential backoff + jitter before retrying
        await new Promise((r) =>
          setTimeout(r, 300 * 2 ** attempt + Math.floor(Math.random() * 150)),
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastErr;
}

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
