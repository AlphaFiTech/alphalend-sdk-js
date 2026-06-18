/**
 * Pyth Lazer mock-signer e2e (testnet, gasless `devInspect`) — the full push path WITHOUT a Pyth token.
 *
 * What it proves: the SDK's {@link appendLazerUpdate} builds a PTB that the REAL on-chain Lazer verifier
 * accepts and that `alphafi_oracle::ingest_lazer_update` writes the price end-to-end. We can't fetch a
 * real Pyth-signed payload here (the access token lives only in the backend proxy), so we sign the Lazer
 * `leEcdsa` update with a key WE control — the exact wire format Pyth uses, only the signer differs — and
 * register it on a self-published harness verifier whose `state::set_trusted_signer` is permissionless.
 *
 * Why it's keyless and deterministic: verify -> ingest -> read all run in ONE `devInspect`. devInspect
 * executes the commands in order in-memory and never commits, so the `ingest_lazer_update` mutation is
 * visible to the `get_price` read in the same call. No funded key, no gas, and the read-back reflects the
 * value WE just signed (a distinctive $1337, distinct from any previously-stored testnet price) — so a
 * pass means this run's verify+ingest actually wrote, not that an old value happened to be there.
 *
 * Gated behind `LAZER_E2E=1` (needs testnet network + the harness/oracle objects below), so the default
 * `npm test` (CI) skips it. Run it on demand with:
 *   LAZER_E2E=1 npm test -- lazer.e2e
 *
 * @noble/curves + @noble/hashes are provided transitively by @mysten/sui (same as the contracts-repo
 * signer); this test imports them directly rather than adding a dependency.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { appendLazerUpdate } from "../src/utils/lazer.js";

// --- Testnet mock-signer harness deployment (see oracle-migration/lazer-migration/testnet-e2e) ---------
// alphafi_oracle refactored to the ingest_lazer_update consumer; SUI is registered to Lazer feed_id 2.
const ORACLE_PKG =
  "0xa22cc6fa2ed207568b620e5adcc6b28999f4ad50110f342fe6f54a47d4705ef0";
const ORACLE_OBJ =
  "0xa577a610c3f604865b35ab65c99e3a9bc8186cf6899cfd08158b90f651c85bea";
// Self-published `pyth_lazer` (full v2 source) whose set_trusted_signer is permissionless, plus its State.
const HARNESS_PKG =
  "0xf9686303df959b4b6a000fcac0befe0cc2cee24f2c2ec02dae914b3c525a5639";
const HARNESS_STATE =
  "0x470a1b15fae80369812c0f96f70788321f6f822ff8b8f35884743c175919fc39";
const CLOCK = "0x6";
const SUI_T = "0x2::sui::SUI";
// devInspect needs only a syntactically-valid sender (no funds / no signing).
const SENDER = `0x${"11".repeat(32)}`;

// Signed feed values. Distinctive $1337 (not the $2500 a prior testnet run stored) so the read-back can
// ONLY match if this devInspect's verify+ingest wrote it. ema == spot so the circuit breaker diff is 0;
// conf of $1 is ~0.07% of price, well inside the 10% band the oracle enforces.
const FEED_ID = 2;
const EXPO = -8;
const PRICE_M = 133_700_000_000n; // 1337.00000000 (x1e8, expo -8)
const EMA_M = 133_700_000_000n;
const CONF_M = 100_000_000n; //    1.00
const ECONF_M = 100_000_000n; //   1.00
const SCALE = 10n ** 18n; // alphafi_stdlib::math::Number value scale
const EXPECTED_USD = 1337;

// Fixed mock secp256k1 key (testnet-only, reproducible). Its compressed pubkey is the trusted signer.
const MOCK_PRIV = Uint8Array.from(Buffer.from("01".repeat(32), "hex"));
const MOCK_PUB = secp256k1.getPublicKey(MOCK_PRIV, true);

const u8 = (n: number) => Uint8Array.from([n & 0xff]);
const u16le = (n: number) => Uint8Array.from([n & 0xff, (n >> 8) & 0xff]);
const u32le = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
};
const u64le = (n: bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
};
const cat = (...xs: Uint8Array[]) =>
  Uint8Array.from(xs.flatMap((x) => Array.from(x)));

// secp256k1 recoverable signature over a 32-byte digest -> r||s||recid (65 bytes), Pyth leEcdsa layout.
function signRecoverable(digest: Uint8Array): Uint8Array {
  const sig = secp256k1.sign(digest, MOCK_PRIV, {
    format: "recovered",
    prehash: false,
  }) as unknown;
  if (sig instanceof Uint8Array) {
    // @noble v2 "recovered" format prepends the recid; reorder to r||s||recid.
    return cat(sig.slice(1), u8(sig[0]));
  }
  const s = sig as { toCompactRawBytes(): Uint8Array; recovery: number };
  return cat(s.toCompactRawBytes(), u8(s.recovery));
}

// Build a signed Lazer leEcdsa update: one feed with the full property set ingest_lazer_update requires
// (price=0, exponent=4, confidence=5, ema_price=10, ema_confidence=11). On-chain the signature is checked
// as secp256k1_ecrecover(sig, payload, keccak256), so we sign keccak256(payload).
function buildSignedUpdate(tsMicros: bigint): Uint8Array {
  const UPDATE_MAGIC = 1296547300; // 0x4D47BDE4
  const PAYLOAD_MAGIC = 2479346549; // 0x93C7D375
  const expoU16 = EXPO < 0 ? 0x10000 + EXPO : EXPO; // two's-complement -> i16::from_u16
  const feed = cat(
    u32le(FEED_ID),
    u8(5), // properties_count
    u8(0),
    u64le(PRICE_M),
    u8(4),
    u16le(expoU16),
    u8(5),
    u64le(CONF_M),
    u8(10),
    u64le(EMA_M),
    u8(11),
    u64le(ECONF_M),
  );
  const payload = cat(
    u32le(PAYLOAD_MAGIC),
    u64le(tsMicros),
    u8(4), // channel 4 = fixed_rate@1000ms
    u8(1), // feed_count
    feed,
  );
  const digest = keccak_256(payload);
  return cat(u32le(UPDATE_MAGIC), signRecoverable(digest), u16le(payload.length), payload);
}

// Decode a Move `Number { value: u256 }` (BCS = bare 32-byte LE u256) from a devInspect return value.
function decodeNumberValue(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
  return v;
}

const RUN = process.env.LAZER_E2E === "1";

(RUN ? describe : describe.skip)(
  "Lazer mock-signer e2e (testnet devInspect, keyless)",
  () => {
    it("appendLazerUpdate: verify -> ingest_lazer_update -> read writes the signed price", async () => {
      const client = new SuiJsonRpcClient({
        url: "https://fullnode.testnet.sui.io",
        network: "testnet",
      });

      // appendLazerUpdate references the Oracle as an explicit mutable SharedObjectRef (mirroring the Pyth
      // writer), so it needs the Oracle's initial shared version — fetch it live.
      const oracleObj = await client.getObject({
        id: ORACLE_OBJ,
        options: { showOwner: true },
      });
      const owner = oracleObj.data?.owner as
        | { Shared?: { initial_shared_version: number | string } }
        | undefined;
      const initialSharedVersion = owner?.Shared?.initial_shared_version;
      if (!initialSharedVersion) {
        throw new Error(
          `Oracle ${ORACLE_OBJ} not found or not shared on testnet (deployment pruned?)`,
        );
      }

      // Stamp the payload with the on-chain clock time so the freshness gate (max_age) and the monotonic
      // last_updated guard always pass — the read-back then reflects THIS run's write.
      const clockObj = await client.getObject({
        id: CLOCK,
        options: { showContent: true },
      });
      const clockContent = clockObj.data?.content as
        | { fields?: { timestamp_ms?: string } }
        | undefined;
      const clockMs = BigInt(clockContent?.fields?.timestamp_ms ?? Date.now());
      const update = buildSignedUpdate(clockMs * 1000n);

      const tx = new Transaction();
      tx.setSender(SENDER);
      // Permissionless: (re)assert our mock signer as trusted (simulated inside the devInspect).
      tx.moveCall({
        target: `${HARNESS_PKG}::state::set_trusted_signer`,
        arguments: [
          tx.object(HARNESS_STATE),
          tx.pure.vector("u8", Array.from(MOCK_PUB)),
          tx.pure.u64(4102444800n), // expiry: year 2100
        ],
      });
      // The SDK function under test: verify-in-PTB + oracle::ingest_lazer_update.
      appendLazerUpdate(
        tx,
        HARNESS_PKG,
        ORACLE_PKG,
        ORACLE_OBJ,
        String(initialSharedVersion),
        HARNESS_STATE,
        update,
      );
      // Read SUI's price back: type_name::get -> get_price_info -> get_price.
      const tn = tx.moveCall({
        target: "0x1::type_name::get",
        typeArguments: [SUI_T],
      });
      const pi = tx.moveCall({
        target: `${ORACLE_PKG}::oracle::get_price_info`,
        arguments: [tx.object(ORACLE_OBJ), tn],
      });
      tx.moveCall({
        target: `${ORACLE_PKG}::oracle::get_price`,
        arguments: [pi],
      });

      const sim = await client.devInspectTransactionBlock({
        sender: SENDER,
        transactionBlock: tx,
      });

      if (sim.effects?.status?.status !== "success") {
        throw new Error(
          `devInspect failed: ${JSON.stringify(sim.effects?.status)}`,
        );
      }

      const results = sim.results ?? [];
      const rv = results[results.length - 1]?.returnValues?.[0];
      expect(rv).toBeTruthy();
      const value = decodeNumberValue(Uint8Array.from(rv![0] as number[]));
      // eslint-disable-next-line no-console
      console.log(
        `[lazer e2e] devInspect=success  signed=$${EXPECTED_USD}  on-chain get_price=$${
          Number(value) / 1e18
        }  (Number.value=${value})`,
      );

      // price = mantissa * 10^expo * SCALE = 1337e8 * 1e-8 * 1e18 = 1337 * SCALE, exactly.
      expect(value).toBe(BigInt(EXPECTED_USD) * SCALE);
      expect(Number(value / SCALE)).toBe(EXPECTED_USD);
    }, 60_000);
  },
);
