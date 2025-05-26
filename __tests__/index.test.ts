import { AlphalendClient, getUserPositionCapId, updatePythIdentifierForCoin } from "..";

describe("index exports", () => {
  it("should export AlphalendClient", () => {
    expect(AlphalendClient).toBeDefined();
  });

  it("should export getUserPositionCapId", () => {
    expect(getUserPositionCapId).toBeDefined();
  });

  it("should export updatePythIdentifierForCoin", () => {
    expect(updatePythIdentifierForCoin).toBeDefined();
  });
});