import cron from "node-cron";
import { AlphalendClient } from "../src/core/client";
import { Transaction } from "@mysten/sui/transactions";
import { getExecStuff } from "./testRun";
import { SuiTransactionBlockResponse } from "@mysten/sui/client";

cron.schedule("* * * * *", async () => {
  const { suiClient, keypair, address } = getExecStuff();
  const alphalendClient = new AlphalendClient("mainnet", suiClient);
  let tx = new Transaction();
  await alphalendClient.updatePrices(tx, [
    "0x2::sui::SUI",
    "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
    "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  ]);

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
    .then((res: SuiTransactionBlockResponse) => {
      console.log("Transaction executed successfully");
      console.log(res.digest);
      res.transaction?.data.gasData.payment
    })
    .catch((error) => {
      console.error(error);
    });
});
