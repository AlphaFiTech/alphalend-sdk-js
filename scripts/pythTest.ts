import {
  SuiPriceServiceConnection,
  SuiPythClient,
} from "@pythnetwork/pyth-sui-js";
import { getConstants } from "../src/constants";
import { getExecStuff } from "./testRun";
import { Transaction } from "@mysten/sui/transactions";

async function run() {
  const { suiClient, keypair } = getExecStuff();
  const constants = getConstants("mainnet");
  const pythClient = new SuiPythClient(
    suiClient,
    constants.PYTH_STATE_ID,
    constants.WORMHOLE_STATE_ID,
  );
  const pythConnection = new SuiPriceServiceConnection(
    "https://hermes.pyth.network",
  );

  const tx = new Transaction();
  const priceIDs = [
    "0a03c915d98ab4084795d283e20f08d7130acd826bca180754b120bfc202f2fb",
  ];
  const priceFeedUpdateData =
    await pythConnection.getPriceFeedsUpdateData(priceIDs);

  const priceInfoObjectIds = await pythClient.updatePriceFeeds(
    tx,
    priceFeedUpdateData,
    priceIDs,
  );

  await suiClient
    .signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      requestType: "WaitForLocalExecution",
      options: {
        showEffects: true,
        showBalanceChanges: true,
        showObjectChanges: true,
      },
    })
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
    })
    .catch((error) => {
      console.error(error);
    });
}

// run();
