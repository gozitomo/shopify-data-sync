import { useEffect, useState } from "react";
import { getIdToken } from "~/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";

const API_BASE = import.meta.env.PROD ? "" : "http://localhost:8080";
const SUMMARY_URL = `${API_BASE}/api/peach-survey-summary`;

type VarietySummary = {
  variety: string;
  count: number;
  avg: {
    sweetness: number;
    acidity: number;
    aroma: number;
    texture: number;
    juiciness: number;
    skin_color: number;
    overall: number;
  };
  categories: { label: string; dist: Record<string, number> }[];
  comments: string[];
};

const RADAR_AXES: { key: keyof VarietySummary["avg"]; label: string }[] = [
  { key: "sweetness", label: "甘さ" },
  { key: "acidity", label: "酸味" },
  { key: "aroma", label: "香り" },
  { key: "texture", label: "硬さ" },
  { key: "juiciness", label: "果汁感" },
  { key: "skin_color", label: "着色度" },
  { key: "overall", label: "おすすめ" },
];

export default function PeachSurvey() {
  const [varieties, setVarieties] = useState<VarietySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch(SUMMARY_URL, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setVarieties(data.varieties);
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    })();
  }, []);

  return (
    <div className="container mx-auto max-w-5xl py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">桃アンケート</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Slackで集めた試食アンケートを品種ごとに集計しています。
        </p>
      </header>

      {error && <p className="text-sm text-destructive">エラー: {error}</p>}
      {varieties === null && !error && (
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      )}
      {varieties && varieties.length === 0 && (
        <p className="text-sm text-muted-foreground">まだ回答がありません。</p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {varieties?.map((v) => {
          const chartData = RADAR_AXES.map(({ key, label }) => ({
            axis: label,
            value: v.avg[key],
          }));
          return (
            <Card key={v.variety}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-xl">{v.variety}</CardTitle>
                <span className="text-sm text-muted-foreground">
                  {v.count}件 / 総合評価 {v.avg.overall.toFixed(1)}
                </span>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={chartData} outerRadius="75%">
                      <PolarGrid />
                      <PolarAngleAxis dataKey="axis" />
                      <PolarRadiusAxis domain={[0, 5]} tickCount={6} />
                      <Radar
                        dataKey="value"
                        stroke="var(--primary)"
                        fill="var(--primary)"
                        fillOpacity={0.4}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                {v.categories.some(
                  (c) => Object.keys(c.dist).length > 0,
                ) && (
                  <div className="mt-4 space-y-2 border-t pt-4 text-sm">
                    {v.categories
                      .filter((c) => Object.keys(c.dist).length > 0)
                      .map((c) => (
                        <div key={c.label}>
                          <p className="mb-1 font-medium">{c.label}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                            {Object.entries(c.dist)
                              .sort((a, b) =>
                                a[0].localeCompare(b[0], "ja", {
                                  numeric: true,
                                }),
                              )
                              .map(([val, cnt]) => (
                                <span key={val}>
                                  {val}: {cnt}件
                                </span>
                              ))}
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {v.comments.length > 0 && (
                  <div className="mt-4 border-t pt-4">
                    <p className="mb-2 text-sm font-medium">
                      推しポイント（{v.comments.length}件）
                    </p>
                    <ul className="space-y-2">
                      {v.comments.map((c, i) => (
                        <li key={i} className="text-sm text-foreground">
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
