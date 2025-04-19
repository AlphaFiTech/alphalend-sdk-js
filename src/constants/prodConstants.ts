export const prodConstants = {
  SUI_CLOCK_OBJECT_ID: "0x6",

  // AlphaFi constants
  ALPHAFI_ORACLE_PACKAGE_ID:
    "0xfa586dca0c394eb1b1a963c9dcd6a834a7b7cad05eae9ccf0f4f0de6fa13590a",

  ALPHAFI_ORACLE_OBJECT_ID:
    "0x880656d2ea985abc7c9db203595d203cdfb1c511bba44302ea1465ff744b5ebb",

  ALPHAFI_ORACLE_ADMIN_CAP_ID:
    "0x16567b0eb680c5b3d3e1b707702880c230d313dc97e6a768d957c65c754602c8",

  ALPHAFI_STDLIB_PACKAGE_ID: "",

  // AlphaLend constants
  ALPHALEND_PACKAGE_ID: "", // Replace with actual package ID

  LENDING_PROTOCOL_ID: "", // Replace with actual protocol object ID

  LENDING_PROTOCOL_CAP_ID: "", // Replace with actual protocol cap ID

  POSITION_CAP_TYPE: "", // Replace with actual position cap type

  POSITION_TABLE_ID: "", // Replace with actual position table ID

  ACTIVE_MARKETS: [""], // to-do: think of a way to store this outside sdk(db or seperate contract)

  // Pyth Constants
  PYTH_PACKAGE_ID:
    "0x04e20ddf36af412a4096f9014f4a565af9e812db9a05cc40254846cf6ed0ad91",

  PYTH_STATE_ID:
    "0x1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8",

  WORMHOLE_PACKAGE_ID:
    "0x5306f64e312b581766351c07af79c72fcb1cd25147157fdc2f8ad76de9a3fb6a",

  WORMHOLE_STATE_ID:
    "0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c",

  PYTH_PRICE_INDENTIFIER_TYPE:
    "0x04e20ddf36af412a4096f9014f4a565af9e812db9a05cc40254846cf6ed0ad91::price_identifier::PriceIdentifier",

  PYTH_MAINNET_API_ENDPOINT: "https://hermes.pyth.network",

  PYTH_PRICE_PATH: "/api/latest_price_feeds",

  // Coin Types
  SUI_COIN_TYPE: "0x2::sui::SUI",

  USDT_COIN_TYPE:
    "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",

  USDC_COIN_TYPE:
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",

  WUSDC_COIN_TYPE:
    "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",

  VSUI_COIN_TYPE:
    "0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT",

  STSUI_COIN_TYPE:
    "0xd1b72982e40348d069bb1ff701e634c117bb5f741f44dff91e472d3b01461e55::stsui::STSUI",
};
