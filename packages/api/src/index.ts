import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import cors from "cors";
import * as dotenv from "dotenv";
import type { Order, Product, SkuStats } from "./types.ts";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import {
  buildUnfulfilledCsv,
  buildB2Csv,
  getSkuCategory,
  type SenderInfo,
  fetchPeachSurveyRows,
  parsePeachSurveyRows,
  summarizePeachSurvey,
} from "@shopify-data-sync/shared";
import { validateAddresses } from "./address-validate";
import { fulfillByTracking } from "./fulfill";
import { triggerSync } from "./sync-job";
import iconv from "iconv-lite";

dotenv.config({ path: "../../.env" });

// Shopify認証情報（本番はSecret Managerから注入。ローカルは上のdotenvでprocess.envに入る）
const SHOPIFY_CLIENT_ID = defineSecret("SHOPIFY_CLIENT_ID");
const SHOPIFY_CLIENT_SECRET = defineSecret("SHOPIFY_CLIENT_SECRET");
const SHOP_DOMAIN = defineSecret("SHOP_DOMAIN");
// 日本郵便API（住所検証）
const JAPANPOST_CLIENT_ID = defineSecret("JAPANPOST_CLIENT_ID");
const JAPANPOST_CLIENT_SECRET = defineSecret("JAPANPOST_CLIENT_SECRET");

// settings コレクションの最新(ID=日付の最大)ドキュメントを依頼主マスタとして読む
async function loadSender(): Promise<SenderInfo> {
  const snap = await db.collection("settings").get();
  if (snap.empty) throw new Error("settings コレクションが空です");
  const latest = snap.docs.sort((a, b) => (a.id < b.id ? 1 : -1))[0];
  const d = latest.data();
  return {
    name: d.name,
    zip: d.zip,
    address: d.address,
    phone: d.phone,
    yamatoCustomerCode: d.yamatoCustomerCode,
    freightManagementNo: d.freightManagementNo,
  };
}

const app = express();
// ローカルではユーザーADCにプロジェクトIDが含まれず自動検出に失敗するため、
// .env の PROJECT_ID を明示的に渡す。本番(Cloud Functions)では未設定→自動検出。
initializeApp({ projectId: process.env.PROJECT_ID });
const db = getFirestore("shopify-data");

app.use(cors({ exposedHeaders: ["Content-Disposition"] }));
app.use(express.json());

// 許可するメールドメイン（特定メールのみに絞るならここを変更）
const ALLOWED_DOMAIN = "progress-farm.com";

// Firebase ID トークンを検証し、許可ドメインのユーザーだけ通すミドルウェア
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const match = (req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!match) {
    res.status(401).json({ error: "認証が必要です" });
    return;
  }
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    if (
      !decoded.email_verified ||
      !decoded.email?.endsWith(`@${ALLOWED_DOMAIN}`)
    ) {
      res.status(403).json({ error: "アクセス権限がありません" });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "トークンが無効です" });
  }
}

// 桃アンケート共有ページの許可リストは Firestore `peach_viewers`
// （ドキュメントID = メールアドレス小文字）で管理する。設定画面から登録・削除する。
const PEACH_VIEWERS = "peach_viewers";

// 桃アンケート用: 許可ドメイン or 許可リスト(Firestore)のユーザーだけ通す（少しだけ緩い）
async function requirePeachViewer(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const match = (req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!match) {
    res.status(401).json({ error: "認証が必要です" });
    return;
  }
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    const email = (decoded.email ?? "").toLowerCase();
    if (!decoded.email_verified) {
      res.status(403).json({ error: "閲覧権限がありません" });
      return;
    }
    // ドメイン所属なら即OK。それ以外は Firestore の許可リストを確認。
    if (email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      next();
      return;
    }
    const doc = await db.collection(PEACH_VIEWERS).doc(email).get();
    if (doc.exists) {
      next();
      return;
    }
    res.status(403).json({ error: "閲覧権限がありません" });
  } catch {
    res.status(401).json({ error: "トークンが無効です" });
  }
}

app.get("/api/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const currentYear = new Date().getFullYear();

    try {
      // 1. 商品マスタの取得
      const productsRes = await db.collection("products").get();
      const productItems = productsRes.docs.map((doc) => doc.data() as Product);
      // 2. 注文実績の取得
      const ordersRes = await db.collection("orders").get();
      const ordersItems = ordersRes.docs.map((doc) => doc.data() as Order);
      console.log(
        `3. データ取得完了！ 商品:${productsRes.size}件, 注文:${ordersRes.size}件`,
      );

      // 3. 注文データの集計
      const stats: Record<string, SkuStats> = {};

      ordersItems.forEach((item) => {
        const sku = item.sku;
        if (!stats[sku]) {
          stats[sku] = {
            unshipped: 0,
            currentShipped: 0,
            prevShipped: 0,
            prepreShipped: 0,
          };
        }
        if (!item.createdAt_sku) return;
        const datePart = item.createdAt_sku.split("#")[0];
        if (datePart) {
          const year = new Date(datePart).getFullYear();
          if (item.status === "UNFULFILLED") {
            stats[sku].unshipped += item.quantity || 0;
          } else if (item.status === "FULFILLED") {
            if (year === currentYear)
              stats[sku].currentShipped += item.quantity || 0;
            else if (year === currentYear - 1)
              stats[sku].prevShipped += item.quantity || 0;
            else if (year === currentYear - 2)
              stats[sku].prepreShipped += item.quantity || 0;
          }
        }
      });

      // 4. マスタと実績を結合して、UIが求める形式に変換
      const allRows = productItems.map((p) => {
        const s = stats[p.sku] || {
          unshipped: 0,
          currentShipped: 0,
          prevShipped: 0,
          prepreShipped: 0,
        };

        // 重量の数値取り出し (例: "5kg" -> 5)
        const weightsuffix = p.sku ? p.sku.slice(-3) : "";
        const weightValue = parseFloat(weightsuffix) / 10 || 0;

        return {
          sku: p.sku,
          title: p.product_name,
          variantTitle:
            p.variant_name !== "Default Title" ? p.variant_name : "",
          pId: p.product_id.split("/").pop(), // IDだけ抽出
          id: p.variant_id.split("/").pop(),
          status: p.status,
          inventory: p.inventory || 0,
          weightValue: weightValue,
          unshipped: s.unshipped,
          currentShipped: s.currentShipped,
          prevShipped: s.prevShipped,
          prepreShipped: s.prepreShipped,
        };
      });

      // 5. カテゴリ分け (例としてステータスで分ける)
      const activeRows = allRows.filter((r) => r.status === "ACTIVE");
      const archivedRows = allRows.filter((r) => r.status === "ARCHIVED");
      console.log(`4. active:${activeRows.length}件`);
      const nestedData = [
        {
          label: "販売中商品",
          data: [
            [
              "メイン",
              {
                rows: activeRows,
                totalWeight: activeRows.reduce(
                  (a, b) => a + b.unshipped * b.weightValue,
                  0,
                ),
              },
            ],
          ],
        },
        {
          label: "アーカイブ済み",
          data: [["過去商品", { rows: archivedRows, totalWeight: 0 }]],
        },
      ];
      console.log("5. 集計完了。レスポンスを返します");
      res.json({
        nestedData,
        previousYear: currentYear - 1,
        prepreYear: currentYear - 2,
      });
    } catch (error: any) {
      res.status(500).send(error.message);
    }
  } catch (error) {
    console.error(error);
    return { statusCode: 500, headers: "", body: (error as Error).message };
  }
});

// 桃アンケートの回答を品種ごとに集計（件数・各評価軸の平均）
app.get(
  "/api/peach-survey-summary",
  requirePeachViewer,
  async (req: Request, res: Response) => {
    try {
      // データ源は Google スプレッドシート（Slackフォームの回答）。
      const rows = await fetchPeachSurveyRows();
      const varieties = summarizePeachSurvey(parsePeachSurveyRows(rows));
      res.json({ varieties });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  },
);

// 桃アンケート共有ユーザー(許可リスト)の管理 — 社内(ドメイン)のみ操作可
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

app.get(
  "/api/peach-viewers",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const snap = await db.collection(PEACH_VIEWERS).get();
      const viewers = snap.docs
        .map((d) => ({
          email: d.id,
          addedAt: (d.data() as any).addedAt?.toDate?.()?.toISOString() ?? null,
        }))
        .sort((a, b) => a.email.localeCompare(b.email));
      res.json({ viewers });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  },
);

app.post(
  "/api/peach-viewers",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email ?? "")
        .trim()
        .toLowerCase();
      if (!EMAIL_RE.test(email)) {
        res.status(400).json({ error: "メールアドレスの形式が正しくありません" });
        return;
      }
      await db
        .collection(PEACH_VIEWERS)
        .doc(email)
        .set({ email, addedAt: new Date() }, { merge: true });
      res.json({ ok: true });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  },
);

app.delete(
  "/api/peach-viewers",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email ?? "")
        .trim()
        .toLowerCase();
      if (!email) {
        res.status(400).json({ error: "email が必要です" });
        return;
      }
      await db.collection(PEACH_VIEWERS).doc(email).delete();
      res.json({ ok: true });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  },
);

// 未発送明細のCSVを生成してダウンロード返却
app.get(
  "/api/export-unfulfilled",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { csv, rowCount } = await buildUnfulfilledCsv();
      console.log(`CSV生成完了: ${rowCount} 行`);
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="unfulfilled-${stamp}.csv"`,
      );
      res.send(csv);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  },
);

// SKU区分(グループ)一覧: products から「最後の-セグメントを除いた区分」を重複排除して返す
app.get(
  "/api/sku-groups",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const snap = await db.collection("products").get();
      const map = new Map<string, string>(); // group -> 代表商品名
      for (const doc of snap.docs) {
        const p = doc.data() as Product;
        // 販売中(ACTIVE)のみ。古い商品(ARCHIVED)・下書き(DRAFT)・
        // デジタル商品(D-始まり=発送しない)は除外
        if (!p.sku || p.status !== "ACTIVE" || p.sku.startsWith("D-")) continue;
        const group = getSkuCategory(p.sku);
        if (!group) continue;
        if (!map.has(group)) map.set(group, p.product_name ?? "");
      }
      const groups = [...map.entries()]
        .map(([group, productName]) => ({ group, productName }))
        .sort((a, b) => a.productName.localeCompare(b.productName, "ja"));
      res.json({ groups });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  },
);

// 出荷実績サマリ: fulfilled の shipments を日付(JST)ごとに集計し、SKU別出荷個数を返す
app.get(
  "/api/shipment-summary",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      // products: sku -> 表示名（商品名 + バリアント(荷姿)）
      const prodSnap = await db.collection("products").get();
      const nameBySku = new Map<string, string>();
      for (const doc of prodSnap.docs) {
        const p = doc.data() as Product;
        if (!p.sku) continue;
        const variant =
          p.variant_name && p.variant_name !== "Default Title"
            ? ` ${p.variant_name}`
            : "";
        nameBySku.set(p.sku, `${p.product_name ?? ""}${variant}`.trim());
      }

      const shipSnap = await db
        .collection("shipments")
        .where("status", "==", "fulfilled")
        .get();

      const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" });
      // 日付ごとに SKU別箱数(skus) と 荷物件数(parcels=伝票数) を集計する。
      const byDate = new Map<
        string,
        { skus: Map<string, number>; parcels: number }
      >();
      for (const doc of shipSnap.docs) {
        const data = doc.data();
        const at = data.fulfilledAt?.toDate?.();
        if (!at) continue;
        const date = fmt.format(at); // YYYY-MM-DD (JST)
        let e = byDate.get(date);
        if (!e) {
          e = { skus: new Map(), parcels: 0 };
          byDate.set(date, e);
        }
        e.parcels += 1; // shipmentドキュメント1件 = 1荷物
        for (const it of Array.isArray(data.items) ? data.items : []) {
          if (!it?.sku) continue;
          e.skus.set(it.sku, (e.skus.get(it.sku) ?? 0) + (Number(it.qty) || 0));
        }
      }

      const days = [...byDate.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // 日付降順
        .map(([date, e]) => ({
          date,
          parcels: e.parcels,
          total: [...e.skus.values()].reduce((a, b) => a + b, 0),
          rows: [...e.skus.entries()]
            .map(([sku, qty]) => ({ sku, name: nameBySku.get(sku) ?? sku, qty }))
            .sort((a, b) => a.name.localeCompare(b.name, "ja")),
        }));

      res.json({ days });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  },
);

// B2取込CSV生成: フィルタ → 住所検証 → 要確認があればCSVを返さない
app.post("/api/export-b2", requireAuth, async (req: Request, res: Response) => {
  try {
    const sender = await loadSender();
    const rawOrders = req.body?.orders;
    const orders =
      typeof rawOrders === "string" && rawOrders.trim()
        ? rawOrders.split(/[\s,、]+/).filter(Boolean)
        : Array.isArray(rawOrders)
          ? rawOrders
          : undefined;
    const sku =
      typeof req.body?.sku === "string" && req.body.sku.trim()
        ? req.body.sku.trim()
        : undefined;

    const coolMode = ["none", "all", "region"].includes(req.body?.coolMode)
      ? req.body.coolMode
      : "none";

    // 一括出力（注文番号指定なし）時は、登録済み(generated/labeled)のFOを除外。
    // 注文番号指定時は除外しない（登録済みでも再発行＝labeledを上書き）。
    let excludeFoIds: Set<string> | undefined;
    if (!orders) {
      const reg = await db
        .collection("shipments")
        .where("status", "in", ["generated", "labeled"])
        .get();
      excludeFoIds = new Set(reg.docs.map((d) => d.id));
    }

    const { csv, count, entries } = await buildB2Csv(sender, {
      orders,
      sku,
      coolMode,
      excludeFoIds,
    });
    if (entries.length === 0) {
      res.json({
        ok: false,
        suspects: [],
        total: 0,
        message: "該当する伝票がありません",
      });
      return;
    }

    const suspects = await validateAddresses(entries, db);
    if (suspects.length > 0) {
      res.json({ ok: false, suspects, total: count });
      return;
    }

    // 台帳に記録（非PIIのみ。FO id↔注文番号。伝票番号は発行後の取込で追記）
    for (let i = 0; i < entries.length; i += 400) {
      const batch = db.batch();
      for (const e of entries.slice(i, i + 400)) {
        batch.set(
          db.collection("shipments").doc(e.foId),
          {
            foId: e.foId,
            orderName: e.orderName,
            items: e.items,
            status: "generated",
            createdAt: new Date(),
          },
          { merge: true },
        );
      }
      await batch.commit();
    }

    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const buf = iconv.encode(csv, "Shift_JIS");
    res.json({
      ok: true,
      count,
      filename: `b2-${stamp}.csv`,
      csvBase64: buf.toString("base64"),
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});


// B2発行済みCSV取込: 伝票番号をFirestoreに記録（シールCSVは生成しない）
app.post(
  "/api/import-b2",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const raw = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const byFo = new Map<
        string,
        { foId: string; tracking: string; orderName: string }
      >();
      for (const r of raw) {
        const foId = String(r?.foId ?? "").trim();
        if (!foId) continue;
        byFo.set(foId, {
          foId,
          tracking: String(r?.tracking ?? "").trim(),
          orderName: String(r?.orderName ?? "").trim(),
        });
      }
      const rows = [...byFo.values()];
      if (rows.length === 0) {
        res.status(400).json({ error: "有効な行がありません" });
        return;
      }

      // 既存statusを取得（発送済みは labeled に戻さない）
      const statusByFo = new Map<string, string | undefined>();
      for (let i = 0; i < rows.length; i += 300) {
        const refs = rows
          .slice(i, i + 300)
          .map((r) => db.collection("shipments").doc(r.foId));
        const snaps = await db.getAll(...refs);
        for (const s of snaps) statusByFo.set(s.id, s.data()?.status);
      }

      // 伝票番号が空の行は失敗扱い
      const failed: { foId: string; orderName: string }[] = [];
      const valid = rows.filter((r) => {
        if (!r.tracking) {
          failed.push({ foId: r.foId, orderName: r.orderName });
          return false;
        }
        return true;
      });

      // Firestoreに伝票番号を記録
      for (let i = 0; i < valid.length; i += 400) {
        const batch = db.batch();
        for (const r of valid.slice(i, i + 400)) {
          const data: any = {
            foId: r.foId,
            orderName: r.orderName,
            trackingNumber: r.tracking,
            labeledAt: new Date(),
          };
          if (statusByFo.get(r.foId) !== "fulfilled") data.status = "labeled";
          batch.set(db.collection("shipments").doc(r.foId), data, {
            merge: true,
          });
        }
        await batch.commit();
      }

      res.json({ ok: true, count: valid.length, failed });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  },
);

// データ同期: 注文・商品の Cloud Run Job を起動（バックグラウンドで実行）
app.post(
  "/api/sync-orders",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      await triggerSync();
      res.json({ ok: true });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  },
);

// スキャン→出荷確定: 追跡番号で台帳逆引き → fulfillmentCreate
app.post("/api/fulfill", requireAuth, async (req: Request, res: Response) => {
  try {
    const tracking = String(req.body?.tracking ?? "").trim();
    if (!tracking) {
      res.status(400).json({ error: "追跡番号がありません" });
      return;
    }
    const result = await fulfillByTracking(tracking, db);
    res.json({ ok: true, ...result });
  } catch (error: any) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
});

// invoker:"public" でIAMの未認証アクセスを許可（=誰でも到達可能）。
// データ保護は上の requireAuth(トークン検証) が担う。
// secrets: Shopify認証情報を本番関数に注入（CSV生成で使用）。
export const api = onRequest(
  {
    invoker: "public",
    region: "asia-northeast1",
    secrets: [
      SHOPIFY_CLIENT_ID,
      SHOPIFY_CLIENT_SECRET,
      SHOP_DOMAIN,
      JAPANPOST_CLIENT_ID,
      JAPANPOST_CLIENT_SECRET,
    ],
    timeoutSeconds: 300,
  },
  app,
);

// ローカル開発用
if (process.env.RUN_LOCAL_SERVER === "true") {
  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}
