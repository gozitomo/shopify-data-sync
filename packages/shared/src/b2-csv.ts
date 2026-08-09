import { getShopifyToken } from "./get-shopify-token.js";
import { toJapanesePrefecture } from "./prefecture.js";
import { B2_COLUMNS } from "./b2-columns.js";
import { getSkuCategory } from "./sku.js";
import { normalizePhone } from "./phone.js";
// 全角カタカナ→半角カタカナ変換テーブル
const ZEN_TO_HAN: Record<string, string> = {
  'ァ':'ｧ','ア':'ｱ','ィ':'ｨ','イ':'ｲ','ゥ':'ｩ','ウ':'ｳ','ェ':'ｪ','エ':'ｴ',
  'ォ':'ｫ','オ':'ｵ','カ':'ｶ','ガ':'ｶﾞ','キ':'ｷ','ギ':'ｷﾞ','ク':'ｸ','グ':'ｸﾞ',
  'ケ':'ｹ','ゲ':'ｹﾞ','コ':'ｺ','ゴ':'ｺﾞ','サ':'ｻ','ザ':'ｻﾞ','シ':'ｼ','ジ':'ｼﾞ',
  'ス':'ｽ','ズ':'ｽﾞ','セ':'ｾ','ゼ':'ｾﾞ','ソ':'ｿ','ゾ':'ｿﾞ','タ':'ﾀ','ダ':'ﾀﾞ',
  'チ':'ﾁ','ヂ':'ﾁﾞ','ッ':'ｯ','ツ':'ﾂ','ヅ':'ﾂﾞ','テ':'ﾃ','デ':'ﾃﾞ','ト':'ﾄ',
  'ド':'ﾄﾞ','ナ':'ﾅ','ニ':'ﾆ','ヌ':'ﾇ','ネ':'ﾈ','ノ':'ﾉ','ハ':'ﾊ','バ':'ﾊﾞ',
  'パ':'ﾊﾟ','ヒ':'ﾋ','ビ':'ﾋﾞ','ピ':'ﾋﾟ','フ':'ﾌ','ブ':'ﾌﾞ','プ':'ﾌﾟ','ヘ':'ﾍ',
  'ベ':'ﾍﾞ','ペ':'ﾍﾟ','ホ':'ﾎ','ボ':'ﾎﾞ','ポ':'ﾎﾟ','マ':'ﾏ','ミ':'ﾐ','ム':'ﾑ',
  'メ':'ﾒ','モ':'ﾓ','ャ':'ｬ','ヤ':'ﾔ','ュ':'ｭ','ユ':'ﾕ','ョ':'ｮ','ヨ':'ﾖ',
  'ラ':'ﾗ','リ':'ﾘ','ル':'ﾙ','レ':'ﾚ','ロ':'ﾛ','ワ':'ﾜ','ヲ':'ｦ','ン':'ﾝ',
  'ヴ':'ｳﾞ','ー':'ｰ','。':'｡','「':'｢','」':'｣','、':'､','・':'･',
};
function toHanKana(s: string): string {
  return s.replace(/[ァ-ヴー。「」、・]/g, (ch) => ZEN_TO_HAN[ch] ?? ch);
}

const API_VERSION = "2026-01";
const COLUMN_COUNT = 95;

// ヤマトB2クラウド「外部データ取り込み基本レイアウト」の列インデックス（0始まり）
const COL = {
  customerMgmtNo: 0, // お客様管理番号（=FulfillmentOrder id）
  slipType: 1, // 送り状種類
  coolType: 2, // クール区分
  shipDate: 4, // 出荷予定日
  toPhone: 8, // お届け先電話番号
  toZip: 10, // お届け先郵便番号
  toAddress: 11, // お届け先住所
  toBuilding: 12, // お届け先アパートマンション名
  toCompany: 13, // お届け先会社・部門１
  toName: 15, // お届け先名
  handling1: 30, // 荷扱い１
  handling2: 31, // 荷扱い２
  note: 32, // 記事
  fromPhone: 19, // ご依頼主電話番号
  fromZip: 21, // ご依頼主郵便番号
  fromAddress: 22, // ご依頼主住所
  fromBuilding: 23, // ご依頼主アパートマンション
  fromName: 24, // ご依頼主名
  itemName1: 27, // 品名１
  billingCustomerCode: 39, // 請求先顧客コード
  freightMgmtNo: 41, // 運賃管理番号
  searchKeyTitle1: 74, // 検索キータイトル1
  searchKey1: 75, // 検索キー1（=注文番号）
} as const;

export type SenderInfo = {
  name: string;
  zip: string;
  address: string;
  phone: string;
  yamatoCustomerCode: string;
  freightManagementNo: string;
};

function csvCell(value: string): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

// Shift-JIS(CP932)で化ける文字を安全な等価文字へ置換
function sjisSafe(s: string): string {
  return String(s ?? "")
    .replace(/〜/g, "～") // 〜(波ダッシュ) → ～(全角チルダ)
    .replace(/−/g, "－") // −(マイナス) → －
    .replace(/[—―]/g, "―"); // ダッシュ類を統一
}

// 全角=2/半角=1で数え、全角25文字(=半角50)相当で切り詰める
function truncateWidth(s: string, maxFullWidth = 25): string {
  const budget = maxFullWidth * 2;
  let used = 0;
  let out = "";
  for (const ch of s) {
    const w = ch.charCodeAt(0) > 0x7f ? 2 : 1;
    if (used + w > budget) break;
    used += w;
    out += ch;
  }
  return out;
}

// 品名を "kg" までで切り捨てる（例: "桃 - 秀 / 4.0kg（約...）/ ..." → "桃 - 秀 / 4.0kg"）
function nameUpToKg(name: string): string {
  const s = name ?? "";
  const i = s.indexOf("kg");
  return i >= 0 ? s.slice(0, i + 2) : s;
}

function buildToAddress(addr: any): string {
  if (!addr) return "";
  const province = addr.province ? toJapanesePrefecture(addr.province) : "";
  return `${province}${addr.city ?? ""}${toHanKana(addr.address1 ?? "")}`.trim();
}

function gidToId(gid: string): string {
  return gid.split("/").pop() ?? gid;
}

function today(): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Shopifyの開いているFulfillmentOrderごとに1行（=1伝票）のB2クラウド取込CSVを生成。
 * 伝票番号(列3)は空欄（B2が採番）。お客様管理番号にFO idを入れて発行後に紐付け可能にする。
 */
export type B2Entry = {
  orderName: string;
  foId: string;
  recipientName: string;
  zip: string;
  prefJp: string; // 注文の都道府県(日本語)
  fullAddress: string; // 都道府県+市区町村+番地+建物
  items: { sku: string; qty: number }[];
};

// クール便モード
// none: 全て常温 / all: 全て冷蔵 / region: 九州・沖縄・北海道のみ冷蔵
export type CoolMode = "none" | "all" | "region";

// 冷蔵対象地域（regionモード時）
const COOL_REGIONS = new Set([
  "北海道",
  "沖縄県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
]);

export type B2Filters = {
  orders?: string[]; // 注文番号(#なし可)。指定時はその注文だけ
  sku?: string; // SKU(前方一致)。指定時はそのSKUを含むFOだけ
  coolMode?: CoolMode;
  excludeFoIds?: Set<string>; // 一括時: 既登録FOを除外する集合
  shipDate?: string;
  includeHeader?: boolean;
};

export async function buildB2Csv(
  sender: SenderInfo,
  filters: B2Filters = {},
): Promise<{ csv: string; count: number; entries: B2Entry[] }> {
  const {
    orders,
    sku,
    coolMode = "none",
    excludeFoIds,
    shipDate = today(),
    includeHeader = true,
  } = filters;
  const domain = process.env.SHOP_DOMAIN;
  const token = await getShopifyToken();

  const parts = [
    "-status:cancelled",
    "(fulfillment_status:unfulfilled OR fulfillment_status:partial)",
  ];
  if (orders && orders.length > 0) {
    // 注文番号で限定（#の有無どちらでも検索できるよう name: を使用）
    const names = orders.map((o) => `name:${o.replace(/^#/, "")}`).join(" OR ");
    parts.push(`(${names})`);
  } else {
    // 注文指定が無いときだけ当年に限定
    parts.push(`created_at:>=${new Date().getFullYear()}-01-01`);
  }
  const orderQuery = parts.join(" AND ");

  const query = `
    query($cursor: String, $queryStr: String) {
      orders(first: 50, after: $cursor, sortKey: CREATED_AT, query: $queryStr) {
        pageInfo { hasNextPage endCursor }
        edges { node {
          name
          phone
          cancelledAt
          shippingAddress {
            firstName lastName company
            zip province city address1 address2
            phone
          }
          billingAddress {
            firstName lastName
            zip province city address1 address2
            phone
          }
          customer { displayName }
          tags
          fulfillmentOrders(first: 20) {
            edges { node {
              id
              status
              lineItems(first: 100) {
                edges { node {
                  remainingQuantity
                  lineItem { name sku }
                }}
              }
            }}
          }
        }}
      }
    }
  `;

  const rows: string[][] = [];
  const entries: B2Entry[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await fetch(
      `https://${domain}.myshopify.com/admin/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token!,
        },
        body: JSON.stringify({
          query,
          variables: { cursor, queryStr: orderQuery },
        }),
      },
    );

    const result: any = await response.json();
    if (result.errors) {
      throw new Error(`Shopify API Error: ${JSON.stringify(result.errors)}`);
    }

    for (const orderEdge of result.data.orders.edges) {
      const order = orderEdge.node;
      if (order.cancelledAt) continue;
      const ship = order.shippingAddress;
      if (!ship) continue;

      for (const foEdge of order.fulfillmentOrders.edges) {
        const fo = foEdge.node;
        if (fo.status !== "OPEN") continue;
        const foId = gidToId(fo.id);
        // 一括出力時: 既にFirestoreに登録済みのFOは除外（注文番号指定時は渡さない）
        if (excludeFoIds?.has(foId)) continue;

        const items = fo.lineItems.edges
          .map((e: any) => e.node)
          .filter(
            (n: any) =>
              n.remainingQuantity > 0 &&
              !(n.lineItem.sku ?? "").startsWith("D-"), // デジタル商品(発送しない)は除外
          );
        if (items.length === 0) continue; // 全てデジタルなら伝票なし

        // SKU絞り込み（商品区分=getSkuCategory が一致するFOだけ残す）
        if (
          sku &&
          !items.some((n: any) => getSkuCategory(n.lineItem.sku ?? "") === sku)
        ) {
          continue;
        }

        // 品名: 各「個数×品名(kgまで)」を連結し全角25で切り詰め
        const itemName = truncateWidth(
          items
            .map(
              (n: any) =>
                `${n.remainingQuantity}×${nameUpToKg(n.lineItem.name)}`,
            )
            .join(" "),
        );

        // 配送先の都道府県(日本語)
        const shipPrefJp = ship.province
          ? toJapanesePrefecture(ship.province)
          : "";
        // クール区分: all=2 / region=対象地域なら2 / none=空白
        const coolType =
          coolMode === "all"
            ? "2"
            : coolMode === "region" && COOL_REGIONS.has(shipPrefJp)
              ? "2"
              : "";

        const row = new Array(COLUMN_COUNT).fill("");
        row[COL.customerMgmtNo] = foId;
        row[COL.slipType] = "0"; // 発払い
        row[COL.coolType] = coolType;
        row[COL.shipDate] = shipDate;
        row[COL.toPhone] = normalizePhone(ship.phone || order.phone || "");
        row[COL.toZip] = ship.zip ?? "";
        row[COL.toAddress] = buildToAddress(ship);
        row[COL.toBuilding] = ship.address2 ?? "";
        row[COL.toCompany] = ship.company ?? ""; // お届け先会社名
        row[COL.toName] =
          `${ship.lastName ?? ""} ${ship.firstName ?? ""}`.trim();
        row[COL.handling1] = "ナマモノ"; // 荷扱い１（固定）
        row[COL.handling2] = "取扱注意"; // 荷扱い２（固定）
        // 記事＝注文番号|タグ（記事は全角22文字まで）
        const tagsStr = Array.isArray(order.tags) ? order.tags.join(" ") : "";
        row[COL.note] = truncateWidth(
          `${order.name}${tagsStr ? ` ${tagsStr}` : ""}`,
          22,
        );
        // ご依頼主＝注文者(billing)。無ければ自社マスタにフォールバック
        const bill = order.billingAddress;
        const billName = bill
          ? `${bill.lastName ?? ""} ${bill.firstName ?? ""}`.trim()
          : "";
        if (bill && (bill.zip || bill.address1)) {
          row[COL.fromName] =
            billName || order.customer?.displayName || sender.name;
          row[COL.fromZip] = bill.zip ?? "";
          row[COL.fromAddress] =
            `${bill.province ? toJapanesePrefecture(bill.province) : ""}${bill.city ?? ""}${bill.address1 ?? ""}`;
          row[COL.fromBuilding] = bill.address2 ?? "";
          row[COL.fromPhone] =
            normalizePhone(bill.phone || order.phone || "") || sender.phone;
        } else {
          row[COL.fromName] = sender.name;
          row[COL.fromZip] = sender.zip;
          row[COL.fromAddress] = sender.address;
          row[COL.fromPhone] = sender.phone;
        }
        row[COL.itemName1] = itemName;
        row[COL.billingCustomerCode] = sender.yamatoCustomerCode;
        row[COL.freightMgmtNo] = sender.freightManagementNo;
        row[COL.searchKeyTitle1] = "注文番号";
        row[COL.searchKey1] = order.name;

        rows.push(row);
        entries.push({
          orderName: order.name,
          foId: foId,
          recipientName: row[COL.toName],
          zip: (ship.zip ?? "").replace(/[^0-9]/g, ""),
          prefJp: shipPrefJp,
          fullAddress: `${buildToAddress(ship)}${ship.address2 ?? ""}`,
          items: items.map((n: any) => ({
            sku: n.lineItem.sku ?? "",
            qty: n.remainingQuantity,
          })),
        });
      }
    }

    hasNextPage = result.data.orders.pageInfo.hasNextPage;
    cursor = result.data.orders.pageInfo.endCursor;
  }

  const allRows = includeHeader ? [B2_COLUMNS, ...rows] : rows;
  const csv = allRows
    .map((r) => r.map((c) => csvCell(sjisSafe(c))).join(","))
    .join("\r\n");
  return { csv, count: rows.length, entries };
}
