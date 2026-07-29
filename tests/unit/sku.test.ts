import { describe, it, expect } from "vitest";
import { getSkuGroup, getSkuCategory } from "../../packages/shared/src/sku.ts";

describe("getSkuGroup", () => {
  it("末尾の -セグメント を外す（角括弧は残す）", () => {
    expect(getSkuGroup("B-AKT-T2[12-13]-043")).toBe("B-AKT-T2[12-13]");
    expect(getSkuGroup("M1-T12-0251")).toBe("M1-T12");
    expect(getSkuGroup("AJS-02")).toBe("AJS");
  });
});

describe("getSkuCategory", () => {
  it("B- 始まりは先頭2セグメント", () => {
    expect(getSkuCategory("B-AKT-T2[12-13]-043")).toBe("B-AKT");
    expect(getSkuCategory("B-KR1-XYZ")).toBe("B-KR1");
  });
  it("B- 以外は先頭1セグメント", () => {
    expect(getSkuCategory("M1-T12-0251")).toBe("M1");
    expect(getSkuCategory("AJS-02")).toBe("AJS");
    expect(getSkuCategory("W")).toBe("W");
  });
  it("空文字でも落ちない", () => {
    expect(getSkuCategory("")).toBe("");
  });
});
