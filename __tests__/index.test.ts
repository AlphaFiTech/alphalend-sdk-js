import { AlphalendClient, getUserPositionCapId } from "../src";

describe("index exports", () => {
  it("should export AlphalendClient", () => {
    expect(AlphalendClient).toBeDefined();
  });

  it("should export getUserPositionCapId", () => {
    expect(getUserPositionCapId).toBeDefined();
  });
});
