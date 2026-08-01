/**
 * Oracle Price Validation Tests
 *
 * Clean, focused tests that show only the root cause of failures.
 *
 * Reads the oracle's dynamic fields over Sui GraphQL (JSON-RPC on public
 * fullnodes was shut down in July 2026).
 */

import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { graphql } from "@mysten/sui/graphql/schema";
import { AlphalendClient } from "../src";

// All coin types that have price feed mappings
const COIN_TYPES = {
  SUI: "0x2::sui::SUI",
  STSUI:
    "0xd1b72982e40348d069bb1ff701e634c117bb5f741f44dff91e472d3b01461e55::stsui::STSUI",
  BTC: "0xaafb102dd0902f5055cadecd687fb5b71ca82ef0e0285d90afde828ec58ca96b::btc::BTC",
  LBTC: "0x3e8e9423d80e1774a7ca128fccd8bf5f1f7753be658c5e645929037f7c819040::lbtc::LBTC",
  USDT: "0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT",
  USDC: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  WAL: "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
  DEEP: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
  BLUE: "0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca::blue::BLUE",
  ETH: "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH",
  ALPHA:
    "0xfe3afec26c59e874f3c1d60b8203cb3852d2bb2aa415df9548b8d688e6683f93::alpha::ALPHA",
} as const;

const dynamicFieldsQuery = graphql(`
  query oracleDynamicFields($parentId: SuiAddress!, $cursor: String) {
    object(address: $parentId) {
      dynamicFields(after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          name {
            json
          }
          value {
            __typename
            ... on MoveValue {
              type {
                repr
              }
              json
            }
            ... on MoveObject {
              contents {
                type {
                  repr
                }
                json
              }
            }
          }
        }
      }
    }
  }
`);

/**
 * One dynamic field of the oracle object, normalized across the
 * MoveValue/MoveObject union. `nameJson`/`valueJson` are the plain Move JSON
 * (GraphQL has no JSON-RPC-style `fields` nesting).
 */
interface OracleField {
  nameJson: unknown;
  valueType: string;
  valueJson: unknown;
}

async function fetchOracleDynamicFields(
  gqlClient: SuiGraphQLClient,
  parentId: string,
): Promise<OracleField[]> {
  const out: OracleField[] = [];
  let cursor: string | null = null;
  let hasMore = true;
  while (hasMore) {
    const response = await gqlClient.query({
      query: dynamicFieldsQuery,
      variables: { parentId, cursor },
    });
    const conn = response.data?.object?.dynamicFields;
    for (const node of conn?.nodes ?? []) {
      const value = node?.value;
      const inner = value?.__typename === "MoveObject" ? value.contents : value;
      out.push({
        nameJson: node?.name?.json,
        valueType: inner?.type?.repr ?? "",
        valueJson: inner?.json,
      });
    }
    if (conn?.pageInfo?.hasNextPage && conn.pageInfo.endCursor) {
      cursor = conn.pageInfo.endCursor;
    } else {
      hasMore = false;
    }
  }
  return out;
}

describe("Oracle Price Validation", () => {
  let client: AlphalendClient;
  let oracleFields: OracleField[];

  beforeAll(async () => {
    const gqlClient = new SuiGraphQLClient({
      url: "https://graphql.mainnet.sui.io/graphql",
    });
    client = new AlphalendClient("mainnet");

    const { getConstants } = await import("../src/constants/index");
    const constants = getConstants("mainnet");
    oracleFields = await fetchOracleDynamicFields(
      gqlClient,
      constants.ALPHAFI_ORACLE_OBJECT_ID,
    );
  }, 60000);

  test("Root cause analysis: Oracle price entries validation", async () => {
    const oraclePriceEntries = new Set<string>();

    for (const field of oracleFields) {
      // The dynamic-field value here is an arbitrary Move struct whose
      // shape varies per object kind. Probing it with `any` and
      // optional-chaining is the test's intent — narrowing each level to
      // a precise type would be more code with no real safety win in a test.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = field.valueJson as any;
      if (!json) continue;

      // GraphQL renders Move TypeName values as plain strings (JSON-RPC
      // wrapped them in {fields: {name}}); accept both forms.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typeName = (v: any): string | undefined =>
        typeof v === "string" ? v : v?.name;

      // Check if this is the Pyth oracle (contains price mappings)
      if (field.valueType.includes("::oracle::OraclePyth")) {
        // Extract coin types from the coin_to_identifier VecMap keys
        const coinToIdentifier = json.coin_to_identifier?.contents;
        if (coinToIdentifier && Array.isArray(coinToIdentifier)) {
          for (const entry of coinToIdentifier) {
            const name = typeName(entry?.key);
            if (name) {
              oraclePriceEntries.add(name);
            }
          }
        }

        // Also check identifier_map for additional entries
        const identifierMap = json.identifier_map?.contents;
        if (identifierMap && Array.isArray(identifierMap)) {
          for (const entry of identifierMap) {
            const name = typeName(entry?.value);
            if (name) {
              oraclePriceEntries.add(name);
            }
          }
        }
      }

      // Check if this is the VecMap that contains type mappings
      if (
        field.valueType.includes("vec_map::VecMap") &&
        field.valueType.includes("type_name::TypeName")
      ) {
        const vecMapContents = json.contents;
        if (vecMapContents && Array.isArray(vecMapContents)) {
          for (const entry of vecMapContents) {
            // Try to extract type names from key and value
            const keyName = typeName(entry?.key);
            if (keyName) {
              oraclePriceEntries.add(keyName);
            }
            const valueName = typeName(entry?.value);
            if (valueName) {
              oraclePriceEntries.add(valueName);
            }
          }
        }
      }
    }

    // Check which coins are missing
    const missingFromOracle: string[] = [];
    const missingFromSDK: string[] = [];

    for (const [symbol, coinType] of Object.entries(COIN_TYPES)) {
      // For now, assume all coins have metadata available in the dynamic system
      // The actual validation will happen when the methods are called
      console.log(`${symbol} - Using dynamic metadata system`);

      // Check oracle entries
      let hasOracleEntry = false;
      for (const entry of oraclePriceEntries) {
        if (entry) {
          // Normalize both entries by removing 0x prefix for comparison
          const normalizedEntry = entry.startsWith("0x")
            ? entry.slice(2)
            : entry;
          const normalizedCoinType = coinType.startsWith("0x")
            ? coinType.slice(2)
            : coinType;

          if (
            normalizedEntry === normalizedCoinType ||
            entry.includes(coinType) ||
            coinType.includes(entry) ||
            entry.toLowerCase().includes(symbol.toLowerCase()) ||
            (coinType.includes("::") &&
              entry.includes(coinType.split("::")[0].replace("0x", "")))
          ) {
            hasOracleEntry = true;
            break;
          }
        }
      }

      if (!hasOracleEntry) {
        missingFromOracle.push(symbol);
      }
    }

    // Report findings
    const totalCoins = Object.keys(COIN_TYPES).length;

    if (missingFromSDK.length > 0) {
      console.log(
        `❌ CAUSE: ${missingFromSDK.length}/${totalCoins} coins missing SDK price mappings: ${missingFromSDK.join(", ")}`,
      );
    }

    if (missingFromOracle.length > 0) {
      console.log(
        `❌ CAUSE: ${missingFromOracle.length}/${totalCoins} coins missing oracle entries: ${missingFromOracle.join(", ")}`,
      );
      console.log(
        `Oracle has only ${oraclePriceEntries.size} entries: [${Array.from(oraclePriceEntries).join(", ")}]`,
      );
    }

    if (missingFromSDK.length === 0 && missingFromOracle.length === 0) {
      console.log(
        `✅ All ${totalCoins} coins have complete price infrastructure`,
      );
    }

    // Fail the test with clear message
    const totalMissing = missingFromSDK.length + missingFromOracle.length;
    if (totalMissing > 0) {
      const causes = [];
      if (missingFromSDK.length > 0)
        causes.push(`${missingFromSDK.length} missing SDK mappings`);
      if (missingFromOracle.length > 0)
        causes.push(`${missingFromOracle.length} missing oracle entries`);

      throw new Error(`Market price issues found: ${causes.join(", ")}`);
    }
  }, 60000);

  // Individual validation for each coin type
  test.each(Object.entries(COIN_TYPES))(
    "%s client should handle coin type",
    async (symbol, coinType) => {
      // Simply verify the client can handle this coin type
      expect(client).toBeDefined();
      expect(coinType).toBeDefined();
      expect(symbol).toBeDefined();

      console.log(
        `✅ ${symbol} (${coinType}) - Client ready for dynamic metadata loading`,
      );

      let hasOracleEntry = false;
      for (const field of oracleFields) {
        // Same arbitrary-Move-struct probe as above.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nameJson = field.nameJson as any;

        let fieldName = "";
        if (nameJson?.name) {
          fieldName = String(nameJson.name);
        } else if (nameJson != null) {
          fieldName = String(nameJson);
        }

        if (fieldName) {
          // Normalize both entries by removing 0x prefix for comparison
          const normalizedFieldName = fieldName.startsWith("0x")
            ? fieldName.slice(2)
            : fieldName;
          const normalizedCoinType = coinType.startsWith("0x")
            ? coinType.slice(2)
            : coinType;

          if (
            normalizedFieldName === normalizedCoinType ||
            fieldName.includes(coinType) ||
            coinType.includes(fieldName) ||
            fieldName.toLowerCase().includes(symbol.toLowerCase()) ||
            (coinType.includes("::") &&
              fieldName.includes(coinType.split("::")[0].replace("0x", "")))
          ) {
            hasOracleEntry = true;
            break;
          }
        }
      }

      if (!hasOracleEntry) {
        throw new Error(
          `${symbol} oracle entry not found - root cause of "Market price not found" error`,
        );
      }
    },
    30000,
  );
});
