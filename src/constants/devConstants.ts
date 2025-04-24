export const devConstants = {
  SUI_CLOCK_OBJECT_ID: "0x6",
  SUI_SYSTEM_STATE_ID: "0x5",

  // AlphaFi constants
  ALPHAFI_ORACLE_PACKAGE_ID:
    "0xd487043371c7405c50c9c3a3130c6f866f313ad0538f16e72478ff2bd6bc8525",

  ALPHAFI_ORACLE_OBJECT_ID:
    "0x355ed2a3110588dce4127e0c0548dbd2194e944fab73bdedcebe4d0a250a9e2a",

  ALPHAFI_ORACLE_ADMIN_CAP_ID:
    "0x42c0b79773907f2348c8474de5fe334f691cec037f6162914e021d9949a92c0a",

  ALPHAFI_STDLIB_PACKAGE_ID:
    "0xce9c2ecf1ff6768c2096516dd21bad3880bb71b88d330fb77e7cbd746a46a9ae",

  // AlphaLend constants
  ALPHALEND_PACKAGE_ID:
    "0x27207f26b1fd8cf74d6c22255ad044e153dcaa82175ff74c99f94c690e4aa4f7", // Replace with actual package ID

  LENDING_PROTOCOL_ID:
    "0x995c0c8ca0b0dd676a855e6dd435e1fd9813305366baad3e8052bfa7f306f9a5", // Replace with actual protocol object ID

  LENDING_PROTOCOL_CAP_ID:
    "0x1e8357fb9edd15dc6e83c4785318ba4cd8a1de3e4ef9ff543bd9f4e6a7be2879", // Replace with actual protocol cap ID

  POSITION_CAP_TYPE:
    "0x06e65071782a787fee1a8d6833be20ee6104294be61e724e77f8faaadc4adb08::position::PositionCap", // Replace with actual position cap type

  POSITION_TABLE_ID:
    "0xf0c5071d164de9d7e3c7cbeb692d2bcd3c59cbf67f870c9b35f88a049bba8f84", // Replace with actual position table ID

  MARKETS_TABLE_ID:
    "0xfb993d4f2e8ba871247f221b83db01aab72ae0c9778287c2577d76017dbe37bb",

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
