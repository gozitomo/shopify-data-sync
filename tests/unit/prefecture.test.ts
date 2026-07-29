import { describe, it, expect } from "vitest";
import { toJapanesePrefecture } from "../../packages/shared/src/prefecture.ts";

describe("toJapanesePrefecture", () => {
  it("英語名を日本語に変換", () => {
    expect(toJapanesePrefecture("Nagano")).toBe("長野県");
    expect(toJapanesePrefecture("Tokyo")).toBe("東京都");
    expect(toJapanesePrefecture("Osaka")).toBe("大阪府");
  });
  it("マクロン付き(Tōkyō等)も変換", () => {
    expect(toJapanesePrefecture("Tōkyō")).toBe("東京都");
    expect(toJapanesePrefecture("Ōsaka")).toBe("大阪府");
    expect(toJapanesePrefecture("Hyōgo")).toBe("兵庫県");
  });
  it("未知の値はそのまま返す", () => {
    expect(toJapanesePrefecture("Unknown")).toBe("Unknown");
  });
});
