import { Inputs, Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID, fromHex } from "@mysten/sui/utils";

export async function fetchLazerUpdateBytes(
  proxyUrl: string,
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
      const { hex } = (await response.json()) as {
        hex: string;
      };
      if (typeof hex !== "string" || hex.length === 0) {
        throw new Error("Lazer proxy response missing hex");
      }
      return fromHex(hex);
    } catch (e) {
      lastErr = e;
      if (attempt < attempts) {
        const backoffMs = 300 * 2 ** attempt + Math.floor(Math.random() * 150);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
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
