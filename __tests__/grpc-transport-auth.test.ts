import { Blockchain } from "../src/models/blockchain";
import { AlphalendClient } from "../src/core/client";

// SuiGrpcClient's convenience constructor drops `meta`, so the token must ride
// on an explicitly-built transport. These tests pin the property actually
// shipped: the transport's defaultOptions carry the x-token metadata.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const transportOf = (client: any) => client.ledgerService._transport;

describe("gRPC transport auth", () => {
  it("Blockchain attaches grpcToken as x-token metadata on the transport", () => {
    const blockchain = new Blockchain(
      "mainnet",
      undefined,
      "https://example.invalid:443",
      "TEST_TOKEN",
    );
    expect(transportOf(blockchain.suiGrpcClient).defaultOptions.meta).toEqual({
      "x-token": "TEST_TOKEN",
    });
  });

  it("Blockchain sends no metadata when grpcToken is absent", () => {
    const blockchain = new Blockchain("mainnet");
    expect(
      transportOf(blockchain.suiGrpcClient).defaultOptions.meta,
    ).toBeUndefined();
  });

  it("AlphalendClient threads options through to the transport", () => {
    const client = new AlphalendClient("mainnet", undefined, {
      grpcUrl: "https://example.invalid:443",
      grpcToken: "TEST_TOKEN",
    });
    expect(
      transportOf(client.blockchain.suiGrpcClient).defaultOptions.meta,
    ).toEqual({ "x-token": "TEST_TOKEN" });
  });
});
