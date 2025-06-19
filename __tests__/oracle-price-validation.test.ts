/**
 * Oracle Price Validation Tests
 *
 * Clean, focused tests that show only the root cause of failures.
 */

import { SuiClient } from "@mysten/sui/client";
import { AlphalendClient } from "../src";
import {
  pythPriceFeedIdMap,
  priceInfoObjectIdMap,
  decimalsMap,
} from "../src/utils/priceFeedIds";

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

describe("Oracle Price Validation", () => {
  let client: AlphalendClient;
  let suiClient: SuiClient;

  beforeAll(() => {
    suiClient = new SuiClient({
      url: "https://fullnode.mainnet.sui.io/",
    });
    client = new AlphalendClient("mainnet", suiClient);
  });

  test("Root cause analysis: Oracle price entries validation", async () => {
    // Get oracle entries
    const { getConstants } = await import("../src/constants/index");
    const constants = getConstants("mainnet");

    const dynamicFields = await suiClient.getDynamicFields({
      parentId: constants.ALPHAFI_ORACLE_OBJECT_ID,
    });

    const oraclePriceEntries = new Set<string>();

    for (const field of dynamicFields.data) {
      try {
        const fieldObject = await suiClient.getObject({
          id: field.objectId,
          options: { showContent: true },
        });

        if (fieldObject.data?.content && "fields" in fieldObject.data.content) {
          const content = fieldObject.data.content as any;

          // Check if this is the Pyth oracle (contains price mappings)
          if (field.objectType.includes("::oracle::OraclePyth")) {
            // Extract coin types from the coin_list_map VecMap
            const coinListMap = content.fields?.value?.fields?.coin_list_map?.fields?.contents;
            if (coinListMap && Array.isArray(coinListMap)) {
              for (const entry of coinListMap) {
                if (entry?.fields?.key?.fields?.name) {
                  const coinType = entry.fields.key.fields.name;
                  oraclePriceEntries.add(coinType);
                }
              }
            }

            // Also check identifier_map for additional entries
            const identifierMap = content.fields?.value?.fields?.identifier_map?.fields?.contents;
            if (identifierMap && Array.isArray(identifierMap)) {
              for (const entry of identifierMap) {
                if (entry?.fields?.value?.fields?.name) {
                  const coinType = entry.fields.value.fields.name;
                  oraclePriceEntries.add(coinType);
                }
              }
            }
          }

          // Check if this is the VecMap that contains type mappings
          if (field.objectType.includes("vec_map::VecMap") && field.objectType.includes("type_name::TypeName")) {
            const vecMapContents = content.fields?.value?.fields?.contents;
            if (vecMapContents && Array.isArray(vecMapContents)) {
              for (const entry of vecMapContents) {
                // Try to extract type names from key and value
                if (entry?.fields?.key?.fields?.name) {
                  const coinType = entry.fields.key.fields.name;
                  oraclePriceEntries.add(coinType);
                }
                if (entry?.fields?.value?.fields?.name) {
                  const coinType = entry.fields.value.fields.name;
                  oraclePriceEntries.add(coinType);
                }
              }
            }
          }
        }
      } catch (error) {
        continue;
      }
    }

    // Check which coins are missing
    const missingFromOracle: string[] = [];
    const missingFromSDK: string[] = [];

    for (const [symbol, coinType] of Object.entries(COIN_TYPES)) {
      // Check SDK mappings
      const hasPythFeed = !!pythPriceFeedIdMap[coinType];
      const hasPriceObject = !!priceInfoObjectIdMap[coinType];
      const hasDecimals = decimalsMap[coinType] !== undefined;

      if (!hasPythFeed || !hasPriceObject || !hasDecimals) {
        missingFromSDK.push(symbol);
      }

      // Check oracle entries
      let hasOracleEntry = false;
      for (const entry of oraclePriceEntries) {
        if (entry) {
          // Normalize both entries by removing 0x prefix for comparison
          const normalizedEntry = entry.startsWith('0x') ? entry.slice(2) : entry;
          const normalizedCoinType = coinType.startsWith('0x') ? coinType.slice(2) : coinType;
          
          if (
            normalizedEntry === normalizedCoinType ||
            entry.includes(coinType) ||
            coinType.includes(entry) ||
            entry.toLowerCase().includes(symbol.toLowerCase()) ||
            (coinType.includes("::") && entry.includes(coinType.split("::")[0].replace('0x', '')))
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
    "%s must have oracle price entry",
    async (symbol, coinType) => {
      // Check SDK mapping
      const hasPythFeed = !!pythPriceFeedIdMap[coinType];
      const hasPriceObject = !!priceInfoObjectIdMap[coinType];
      const hasDecimals = decimalsMap[coinType] !== undefined;

      if (!hasPythFeed || !hasPriceObject || !hasDecimals) {
        throw new Error(
          `${symbol} missing SDK mappings: Pyth=${hasPythFeed}, Object=${hasPriceObject}, Decimals=${hasDecimals}`,
        );
      }

      // Check oracle entry
      const { getConstants } = await import("../src/constants/index");
      const constants = getConstants("mainnet");

      const dynamicFields = await suiClient.getDynamicFields({
        parentId: constants.ALPHAFI_ORACLE_OBJECT_ID,
      });

      let hasOracleEntry = false;
      for (const field of dynamicFields.data) {
        try {
          const fieldObject = await suiClient.getObject({
            id: field.objectId,
            options: { showContent: true },
          });

          if (
            fieldObject.data?.content &&
            "fields" in fieldObject.data.content
          ) {
            const content = fieldObject.data.content as any;

            let fieldName = "";
            if (content.fields?.name?.fields?.name) {
              fieldName = content.fields.name.fields.name;
            } else if (content.fields?.name) {
              fieldName = String(content.fields.name);
            }

            if (fieldName) {
              // Normalize both entries by removing 0x prefix for comparison
              const normalizedFieldName = fieldName.startsWith('0x') ? fieldName.slice(2) : fieldName;
              const normalizedCoinType = coinType.startsWith('0x') ? coinType.slice(2) : coinType;
              
              if (
                normalizedFieldName === normalizedCoinType ||
                fieldName.includes(coinType) ||
                coinType.includes(fieldName) ||
                fieldName.toLowerCase().includes(symbol.toLowerCase()) ||
                (coinType.includes("::") && fieldName.includes(coinType.split("::")[0].replace('0x', '')))
              ) {
                hasOracleEntry = true;
                break;
              }
            }
          }
        } catch (error) {
          continue;
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
