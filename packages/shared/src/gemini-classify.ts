const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "gemini-3.6-flash";

export type ClassificationExample = {
  itemNames: string[];
  accountId: string;
  accountName: string;
  subAccountId?: string | null;
  subAccountName?: string | null;
  taxId: string;
  taxName: string;
};

export type ClassificationResult = {
  matched: boolean;
  accountId: string | null;
  accountName: string | null;
  subAccountId: string | null;
  taxId: string | null;
  taxName: string | null;
  reason: string;
};

// Gemini/Vertex AIのresponseSchemaはOpenAPI 3.0のサブセットで、JSON Schemaのunion型
// （type: ["string", "null"]）はサポートされない（実機で確認済み）。null許容は
// nullable: true で表現する。
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    matched: { type: "boolean" },
    accountId: { type: "string", nullable: true },
    accountName: { type: "string", nullable: true },
    subAccountId: { type: "string", nullable: true },
    taxId: { type: "string", nullable: true },
    taxName: { type: "string", nullable: true },
    reason: { type: "string" },
  },
  required: [
    "matched",
    "accountId",
    "accountName",
    "subAccountId",
    "taxId",
    "taxName",
    "reason",
  ],
};

function buildPrompt(newItemNames: string[], examples: ClassificationExample[]): string {
  const exampleLines = examples
    .map((e, i) => {
      const sub = e.subAccountName
        ? `, 補助科目: ${e.subAccountName}(id: ${e.subAccountId})`
        : "";
      return `${i + 1}. 品目: ${e.itemNames.join(" / ")} → 勘定科目: ${e.accountName}(id: ${e.accountId})${sub}, 税区分: ${e.taxName}(id: ${e.taxId})`;
    })
    .join("\n");

  return `あなたは農業法人の経理担当者です。過去の仕訳実例を参考に、新しい購買請求書の品目がどの勘定科目・税区分に分類されるべきかを判定してください。

## 過去の分類実例
${exampleLines}

## 今回判定する品目
${newItemNames.join(" / ")}

過去の実例の中に、今回の品目と同じか非常によく似たものがあれば、その勘定科目・補助科目・税区分をそのまま採用してください。
似た実例が無ければ matched を false とし、accountId 等はすべて null にしてください。無理に一番近そうなものを選ばないでください。`;
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 過去の分類実例(examples)を踏まえて、新しい品目リストの勘定科目・税区分をGeminiに判定させる。
// 似た実例が無い場合は matched: false を返す（reasonに理由が入る）。
// Gemini APIは一時的な503(UNAVAILABLE、高負荷)を返すことがある（実機で確認済み）ため、
// 指数バックオフで数回リトライする。
export async function classifyInvoiceItems(
  apiKey: string,
  newItemNames: string[],
  examples: ClassificationExample[],
): Promise<ClassificationResult> {
  const prompt = buildPrompt(newItemNames, examples);

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }

    const res = await fetch(`${API_BASE}/models/${MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
    const body = await res.json();

    if (!res.ok) {
      const isRetryable = res.status === 503 || res.status === 429;
      lastError = new Error(`Gemini分類に失敗: ${JSON.stringify(body)}`);
      if (isRetryable && attempt < MAX_RETRIES) continue;
      throw lastError;
    }

    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error(`Geminiのレスポンスが空です: ${JSON.stringify(body)}`);
    }
    return JSON.parse(text) as ClassificationResult;
  }
  throw lastError ?? new Error("Gemini分類に失敗: 不明なエラー");
}
