import { describe, it, expect } from "vitest";
import { parseCsv } from "../../packages/frontend/app/lib/csv.ts";

describe("parseCsv", () => {
  it("クォート内のカンマを分割しない", () => {
    const rows = parseCsv('"a","b,c","d"');
    expect(rows).toEqual([["a", "b,c", "d"]]);
  });
  it('"" を 1つの " に復元', () => {
    const rows = parseCsv('"he said ""hi"""');
    expect(rows).toEqual([['he said "hi"']]);
  });
  it("CRLF 改行で複数行", () => {
    const rows = parseCsv('"1","2"\r\n"3","4"');
    expect(rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });
  it("B2発行済み相当: FO id/伝票番号/注文番号を拾える", () => {
    const line = `"7939155361894","0","0","390368620552",${'"",'.repeat(70)}"注文番号","4386"`;
    const rows = parseCsv(line);
    expect(rows[0][0]).toBe("7939155361894");
    expect(rows[0][3]).toBe("390368620552");
    expect(rows[0][75]).toBe("4386");
  });
});
