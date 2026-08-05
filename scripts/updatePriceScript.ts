import cron from "node-cron";
import { AlphalendClient } from "../src/core/client";
import { Transaction } from "@mysten/sui/transactions";
import { getExecStuff } from "./testRun";

cron.schedule("* * * * *", async () => {
  const { suiClient, keypair } = getExecStuff();
  const alphalendClient = new AlphalendClient("mainnet");
  const tx = new Transaction();
  await alphalendClient.updatePrices(tx, [
    "0x2::sui::SUI",
    "0x44f838219cf67b058f3b37907b655f226153c18e33dfcd0da559a844fea9b1c1::usdsui::USDSUI",
    "0x876a4b7bce8aeaef60464c11f4026903e9afacab79b9b142686158aa86560b50::xbtc::XBTC",
    // "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    "0x66629328922d609cf15af779719e248ae0e63fe0b9d9739623f763b33a9c97da::esui::ESUI",
  ]);

  try {
    const res = await suiClient.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      include: {
        effects: true,
        balanceChanges: true,
        objectTypes: true,
      },
    });
    if (res.$kind === "FailedTransaction") {
      console.error(
        `Transaction ${res.FailedTransaction.digest} failed:`,
        res.FailedTransaction.status.error?.message,
      );
      return;
    }
    await suiClient.waitForTransaction({ result: res });
    console.log("Transaction executed successfully");
    console.log(res.Transaction.digest);
  } catch (error) {
    console.error(error);
  }
});
