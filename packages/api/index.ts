import express, { type Request, type Response } from "express";
import { Firestore } from "@google-cloud/firestore";
import cors from "cors";

const app = express();
const db = new Firestore();

app.use(cors());
app.use(express.json());

// 型定義
interface StatsResponse {
  message: string;
  previousYear?: number;
}

app.get("api/stats", async (req: Request, res: Response) => {
  try {
    const result: StatsResponse = {
      message: "Firestore migration in progress",
    };
    res.json(result);
  } catch (error: any) {
    res.status(500).send(error.message);
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
