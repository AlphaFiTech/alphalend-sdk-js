export const devConstants = {
  SUI_CLOCK_OBJECT_ID: "0x6",
  SUI_SYSTEM_STATE_ID: "0x5",

  // AlphaFi constants
  ALPHAFI_ORACLE_PACKAGE_ID:
    "0x89580b04cbd27ad924f8aadffd7722934d35e597477b22c9c8cf01f29bfecce4",

  ALPHAFI_ORACLE_OBJECT_ID:
    "0xd248eeaa6575d564d5cde3ce743bad27523d807c04db7918bf22db133889d42a",

  ALPHAFI_ORACLE_ADMIN_CAP_ID:
    "0x00d8933cea5c14f5880041c0ff9c1087d1f73a5e3cbcf01754faa33e8698365b",

  ALPHAFI_STDLIB_PACKAGE_ID:
    "0xcdd17db56599b54352a039ece4f8f63d6dc1450924a6c92b2e360385a1373926",

  // AlphaLend constants
  ALPHALEND_PACKAGE_ID:
    "0x3a5b20b8925a3e71a8fc11497c0ece0cd999a6d3b70b8aefc572db383206b960", // Replace with actual package ID

  LENDING_PROTOCOL_ID:
    "0x3f4edc803168fb3512761982dcbfd3f44435437fdc72e09e94f619be7ea4bfe8", // Replace with actual protocol object ID

  LENDING_PROTOCOL_CAP_ID:
    "0x499e69292f3d48dac3d232a69492e7ed7637038b60c33166e6b438dbc5ef7bf8", // Replace with actual protocol cap ID

  POSITION_CAP_TYPE:
    "0xc38cff778ec27081dd2c59276e493b481e8f882450124b614bef06b19cf59fa7::position::PositionCap", // Replace with actual position cap type

  POSITION_TABLE_ID:
    "0xe63c3cd7f89ccd9aaef33c473e67475b6964ff0ea4b57ffe952408bee9d589a1", // Replace with actual position table ID

  MARKETS_TABLE_ID:
    "0x4e85a7deaad8bd35ec74e35129e94cdfbed640b5dee07b8c63c4df7b7bb6d6cd",

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
