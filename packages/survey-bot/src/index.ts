// 桃アンケート定期ダイジェスト:
// スプレッドシート(Slackフォームの回答) → 品種別集計 → レーダーチャート画像 →
// Slack Incoming Webhook に定期投稿する。
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as dotenv from "dotenv";
import {
  fetchPeachSurveyRows,
  parsePeachSurveyRows,
  summarizePeachSurvey,
  buildRadarChartUrl,
  buildPeachDigestMessage,
  postSlackWebhook,
} from "@shopify-data-sync/shared";

dotenv.config({ path: "../../.env" });

// Slack Incoming Webhook URL（機微情報なので Secret Manager で管理）
const PEACH_SURVEY_SLACK_WEBHOOK_URL = defineSecret(
  "PEACH_SURVEY_SLACK_WEBHOOK_URL",
);

// スプシ集計を Slack に送る本体（スケジュール実行と手動実行で共有）
async function runDigest(webhookUrl: string): Promise<number> {
  const rows = await fetchPeachSurveyRows();
  const summaries = summarizePeachSurvey(parsePeachSurveyRows(rows));
  const chartUrl = buildRadarChartUrl(summaries);
  await postSlackWebhook(webhookUrl, buildPeachDigestMessage(summaries, chartUrl));
  return summaries.reduce((a, s) => a + s.count, 0);
}

// 毎週月曜 9:00 (JST) に集計を投稿。頻度は schedule 文字列で調整可能。
export const peachSurveyDigest = onSchedule(
  {
    schedule: "0 9 * * 1",
    timeZone: "Asia/Tokyo",
    secrets: [PEACH_SURVEY_SLACK_WEBHOOK_URL],
    timeoutSeconds: 120,
  },
  async () => {
    const webhookUrl =
      PEACH_SURVEY_SLACK_WEBHOOK_URL.value() ||
      process.env.PEACH_SURVEY_SLACK_WEBHOOK_URL ||
      "";
    if (!webhookUrl) {
      throw new Error("PEACH_SURVEY_SLACK_WEBHOOK_URL が未設定です");
    }
    const total = await runDigest(webhookUrl);
    console.log(`桃アンケート集計を送信しました（回答 ${total}件）`);
  },
);

// ローカル手動実行: RUN_LOCAL_DIGEST=true tsx src/index.ts
if (process.env.RUN_LOCAL_DIGEST === "true") {
  const webhookUrl = process.env.PEACH_SURVEY_SLACK_WEBHOOK_URL || "";
  runDigest(webhookUrl)
    .then((total) => console.log(`送信完了（回答 ${total}件）`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
