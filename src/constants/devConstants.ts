export const devConstants = {
  SUI_CLOCK_OBJECT_ID: "0x6",

  // AlphaFi constants
  ALPHAFI_ORACLE_PACKAGE_ID:
    "0x2fc8339ed4c6c4b597a353380f781b7a8144a5bb59fb968aad959c0edd193893",

  ALPHAFI_ORACLE_OBJECT_ID:
    "0x1db5b88a2e19739a06803476c9b5f4afebaed9194db59bfcb6e68542d0d8caa1",

  ADMIN_CAP_ID:
    "0x5e676b201dec046f14ba9660b41fc8ba8fa1c3a448769551518384d330a7310c",

  // AlphaLend constants
  ALPHALEND_PACKAGE_ID: "", // Replace with actual package ID

  ALPHALEND_ORACLE_OBJECT_ID: "", // Replace with actual oracle object ID

  LENDING_PROTOCOL_ID: "", // Replace with actual protocol object ID

  LENDING_PROTOCOL_CAP_ID: "", // Replace with actual protocol cap ID

  POSITION_CAP_TYPE: "", // Replace with actual position cap type

  ACTIVE_MARKETS: [""], // to-do: think of a way to store this outside sdk(db or seperate contract)

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
