// Slack Incoming Webhook にメッセージ（blocks）を送信する。
import { type VarietySummary } from "./peach-survey.js";

export async function postSlackWebhook(
  webhookUrl: string,
  payload: unknown,
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(
      `Slack Webhook送信失敗: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`,
    );
  }
}

// 桃アンケート集計＋レーダーチャート画像の Slack メッセージ(blocks)を組み立てる。
export function buildPeachDigestMessage(
  summaries: VarietySummary[],
  chartUrl: string,
): unknown {
  const total = summaries.reduce((a, s) => a + s.count, 0);
  const lines =
    summaries
      .map(
        (s) =>
          `• *${s.variety}*：${s.count}件 / おすすめ ${s.avg.overall.toFixed(1)}`,
      )
      .join("\n") || "まだ回答がありません";

  return {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🍑 桃アンケート集計", emoji: true },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `回答 ${total}件\n${lines}` },
      },
      {
        type: "image",
        image_url: chartUrl,
        alt_text: "品種別レーダーチャート",
      },
    ],
  };
}
