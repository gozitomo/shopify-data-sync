import { describe, it, expect } from "vitest";
import { normalizePhone } from "../../packages/shared/src/phone.ts";

describe("normalizePhone", () => {
  it("+81 を 0 に変換（区切りも吸収）", () => {
    expect(normalizePhone("+81 90-8904-6773")).toBe("090-8904-6773");
    expect(normalizePhone("+819012345678")).toBe("09012345678");
    expect(normalizePhone("+81-80-1234-5678")).toBe("080-1234-5678");
  });
  it("国内表記・空はそのまま", () => {
    expect(normalizePhone("090-1111-2222")).toBe("090-1111-2222");
    expect(normalizePhone("")).toBe("");
  });
});
