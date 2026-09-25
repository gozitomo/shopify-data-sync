import { describe, it, expect, vi, beforeEach } from "vitest";

// GoogleAuth/Impersonated はGCP実クレデンシャルに依存するため、テストではモックする。
vi.mock("google-auth-library", () => {
  return {
    GoogleAuth: class {
      getClient() {
        return Promise.resolve({
          getAccessToken: () => Promise.resolve({ token: "fake-token" }),
        });
      }
    },
    Impersonated: class {
      getAccessToken() {
        return Promise.resolve({ token: "fake-token" });
      }
    },
  };
});

const { listFilesInFolder, downloadDriveFile } = await import(
  "../../packages/shared/src/google-drive.ts"
);

function mockFetch(responses: Array<{ ok: boolean; status?: number; body: any; isBuffer?: boolean }>) {
  const calls: { url: string; init: any }[] = [];
  let i = 0;
  const fn = vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const r = responses[Math.min(i, responses.length - 1)]!;
    i++;
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 400),
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
      arrayBuffer: async () => (r.isBuffer ? r.body : new ArrayBuffer(0)),
    } as any;
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

beforeEach(() => vi.unstubAllGlobals());

describe("listFilesInFolder", () => {
  it("フォルダIDでクエリして直下のファイル一覧を返す", async () => {
    const calls = mockFetch([
      {
        ok: true,
        body: {
          files: [
            { id: "f1", name: "20260925.jpg", mimeType: "image/jpeg", modifiedTime: "2026-09-25T00:00:00Z" },
          ],
        },
      },
    ]);

    const files = await listFilesInFolder("folder-1");

    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe("20260925.jpg");
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get("q")).toBe("'folder-1' in parents and trashed = false");
    expect(calls[0]!.init.headers.Authorization).toBe("Bearer fake-token");
  });

  it("nextPageTokenがあれば複数回叩いて全件集める", async () => {
    const calls = mockFetch([
      { ok: true, body: { files: [{ id: "f1", name: "a.jpg", mimeType: "image/jpeg", modifiedTime: "t" }], nextPageToken: "p2" } },
      { ok: true, body: { files: [{ id: "f2", name: "b.jpg", mimeType: "image/jpeg", modifiedTime: "t" }] } },
    ]);

    const files = await listFilesInFolder("folder-1");

    expect(files.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(calls).toHaveLength(2);
    const url2 = new URL(calls[1]!.url);
    expect(url2.searchParams.get("pageToken")).toBe("p2");
  });

  it("APIエラー時は例外を投げる", async () => {
    mockFetch([{ ok: false, status: 403, body: { error: { message: "boom" } } }]);
    await expect(listFilesInFolder("folder-1")).rejects.toThrow("Driveファイル一覧取得失敗");
  });
});

describe("downloadDriveFile", () => {
  it("alt=mediaでファイル本体を取得しBufferを返す", async () => {
    const data = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer;
    const calls = mockFetch([{ ok: true, body: data, isBuffer: true }]);

    const buf = await downloadDriveFile("f1");

    expect(buf.subarray(0, 4).toString("hex")).toBe("ffd8ffe0");
    expect(calls[0]!.url).toBe("https://www.googleapis.com/drive/v3/files/f1?alt=media");
  });

  it("APIエラー時は例外を投げる", async () => {
    mockFetch([{ ok: false, status: 404, body: { error: { message: "not found" } } }]);
    await expect(downloadDriveFile("f1")).rejects.toThrow("Driveファイル取得失敗");
  });
});
