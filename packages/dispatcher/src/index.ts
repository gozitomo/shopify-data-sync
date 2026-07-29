import express, { Request, Response } from "express";
import { webhookRouter } from "./webhook.js";
import { taskRouter } from "./task-handler.js";

// Expressサーバー起動
const app = express();
const PORT: number = Number(process.env.PORT) || 8080;
// JSONのパースを有効にする。HMAC検証用にrawBodyを保持
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// ルーター
app.use("/webhooks", webhookRouter);
app.use("/tasks", taskRouter);

// サーバー起動
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(` サーバー起動中: http://localhost:${PORT}`);
  console.log(`=========================================`);
});
