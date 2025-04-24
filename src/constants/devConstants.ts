export const devConstants = {
  SUI_CLOCK_OBJECT_ID: "0x6",
  SUI_SYSTEM_STATE_ID: "0x5",

  // AlphaFi constants
  ALPHAFI_ORACLE_PACKAGE_ID:
    "0x68a47d52922190b77f4ce816c0b95f7f70f3cdcb28b4a94c06f8022868c8e0b3",

  ALPHAFI_ORACLE_OBJECT_ID:
    "0x861f999e74242e19d14ae9e4b63d3ed9d243f65103a3ab828553935e4aa2a076",

  ALPHAFI_ORACLE_ADMIN_CAP_ID:
    "0xef2a27a5fbe7427b203db6a5d35909bed0a1f04028b19917940262c91cb1acc2",

  ALPHAFI_STDLIB_PACKAGE_ID:
    "0x828bbbd018db947949ea75b0c1e53e66d5fada05a70f3e1fdb0683b18265def0",

  // AlphaLend constants
  ALPHALEND_PACKAGE_ID:
    "0x3158fcba720cd0982009e1c23b79715cf45fdd2797e66c0d3eace9ac41391ce1", // Replace with actual package ID

  LENDING_PROTOCOL_ID:
    "0x2912352e71981b1add509c891b303d156152dcbdd3aedf255d4c92e625221c39", // Replace with actual protocol object ID

  LENDING_PROTOCOL_CAP_ID:
    "0xe3fcf31ad5a3c444ab9c97dd6c8b038ca84f3afd3d80a42f4a17d0783e6435d8", // Replace with actual protocol cap ID

  POSITION_CAP_TYPE:
    "0x3158fcba720cd0982009e1c23b79715cf45fdd2797e66c0d3eace9ac41391ce1::position::PositionCap", // Replace with actual position cap type

  POSITION_TABLE_ID:
    "0x4245829efc710180cfc0c41a7d7bc518271e45bbd58162a9682db24fc8403c50", // Replace with actual position table ID

  MARKETS_TABLE_ID:
    "0x4659444499794cd964b3485c1f240110af0f608dbb21446f42b4bb57f0fcbf24",

  ACTIVE_MARKETS: [1, 3], // to-do: think of a way to store this outside sdk(db or seperate contract)

  // Pyth Constants
  PYTH_PACKAGE_ID:
    "0xabf837e98c26087cba0883c0a7a28326b1fa3c5e1e2c5abdb486f9e8f594c837",

  PYTH_STATE_ID:
    "0x243759059f4c3111179da5878c12f68d612c21a8d54d85edc86164bb18be1c7c",

  WORMHOLE_PACKAGE_ID:
    "0xf47329f4344f3bf0f8e436e2f7b485466cff300f12a166563995d3888c296a94",

  WORMHOLE_STATE_ID:
    "0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790",

  PYTH_PRICE_INDENTIFIER_TYPE:
    "0xabf837e98c26087cba0883c0a7a28326b1fa3c5e1e2c5abdb486f9e8f594c837::price_identifier::PriceIdentifier",

  PYTH_MAINNET_API_ENDPOINT: "https://hermes-beta.pyth.network",

  PYTH_PRICE_PATH: "/api/latest_price_feeds",

  // Coin Types
  SUI_COIN_TYPE: "0x2::sui::SUI",

  USDT_COIN_TYPE:
    "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",

  USDC_COIN_TYPE:
    "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC",

  WUSDC_COIN_TYPE:
    "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",

  VSUI_COIN_TYPE:
    "0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT",

  STSUI_COIN_TYPE:
    "0xd1b72982e40348d069bb1ff701e634c117bb5f741f44dff91e472d3b01461e55::stsui::STSUI",
};
