import type { Page } from "playwright";

const TOP_URL = "https://supportweb01.nd-agri.jp/ja_nagano?id=top_nagano";

const ORIGIN = "https://supportweb01.nd-agri.jp";

export type NagamaruDocumentLink = {
  date: string;
  name: string;
  url: string;
};

// ながまるWEBサービスにログインする。
// メールアドレス/パスワードは環境変数（NAGAMARU_EMAIL/NAGAMARU_PASSWORD）から読む。
export async function loginToNagamaru(page: Page): Promise<void> {
  const email = process.env.NAGAMARU_EMAIL;
  const password = process.env.NAGAMARU_PASSWORD;
  if (!email || !password) {
    throw new Error("NAGAMARU_EMAIL / NAGAMARU_PASSWORD が未設定です");
  }

  await page.goto(TOP_URL);
  // 「ログインでお困りの場合はこちら」等とテキストが被るため、role名ではなくクラスで特定する
  await page.locator("a.btn-sso").click();

  // pf-auth.nd-agri.jp (Auth0) の認証フォームに遷移する
  await page.getByRole("textbox", { name: "メールアドレス" }).fill(email);
  await page.getByRole("textbox", { name: "パスワード" }).fill(password);
  await page
    .getByRole("button", { name: "メールアドレスでログイン" })
    .click();

  // ながまるWEBサービスのトップに戻ってくるまで待つ
  await page.waitForURL(/supportweb01\.nd-agri\.jp/, { timeout: 30_000 });
}

// 販売精算書一覧（sales_info_pdf）を取得する。
// サイドバー経由のクリックでも同じ場所に着地するが、SPA内部のクエリID（?id=sales_info_pdf）へ
// ログイン後に直接遷移する方がクリック操作より単純で壊れにくいため、こちらを正とする。
export async function listSettlementDocuments(
  page: Page,
): Promise<NagamaruDocumentLink[]> {
  await page.goto(`${ORIGIN}/ja_nagano?id=sales_info_pdf`);
  return collectDownloadLinks(page);
}

// 購買品請求書一覧（billing_info_pdf）を取得する。listSettlementDocumentsと同じ理由で直接遷移する。
export async function listPurchaseInvoices(
  page: Page,
): Promise<NagamaruDocumentLink[]> {
  await page.goto(`${ORIGIN}/ja_nagano?id=billing_info_pdf`);
  return collectDownloadLinks(page);
}

// 一覧テーブル（table.list_table > tbody > tr、各行は td[0]=日付 td[1]=文書名、
// 行内の a[href^="/sys_attachment.do"] が実ファイルのダウンロードリンク）から
// 1ページ分のドキュメントを抽出する。
// 注: ページング（1 2 3 4 5...）には未対応。過去分を遡って取得する必要が出た場合は別途対応する。
async function collectDownloadLinks(
  page: Page,
): Promise<NagamaruDocumentLink[]> {
  await page.waitForLoadState("networkidle");
  await page.locator("table.list_table tbody tr").first().waitFor({
    state: "visible",
    timeout: 15_000,
  });
  const rows = await page.locator("table.list_table tbody tr").all();
  const results: NagamaruDocumentLink[] = [];
  for (const row of rows) {
    const cells = row.locator("td");
    const date = (await cells.nth(0).textContent())?.trim() ?? "";
    const name = (await cells.nth(1).textContent())?.trim() ?? "";
    const href = await row
      .locator('a[href^="/sys_attachment.do"]')
      .first()
      .getAttribute("href");
    if (!href) continue;
    results.push({ date, name, url: new URL(href, ORIGIN).toString() });
  }
  return results;
}

// 認証済みセッション（page.context()が持つCookie）を使って添付ファイルをダウンロードする。
export async function downloadDocument(
  page: Page,
  url: string,
): Promise<Buffer> {
  const res = await page.context().request.get(url);
  if (!res.ok()) {
    throw new Error(`ダウンロード失敗: HTTP ${res.status()} ${url}`);
  }
  return Buffer.from(await res.body());
}
