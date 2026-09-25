import { useEffect, useMemo, useState } from "react";
import { getIdToken } from "~/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  mergeSeriesForChart,
  toDayIndexSeries,
  yearColor,
  type HarvestSummary,
} from "~/lib/harvest";

const API_BASE = import.meta.env.PROD ? "" : "http://localhost:8080";
const SUMMARY_URL = `${API_BASE}/api/harvest-summary`;

const ALL = ""; // セレクトの「すべて」を表す値

function fmtKg(kg: number): string {
  return `${kg.toLocaleString("ja-JP", { maximumFractionDigits: 1 })} kg`;
}

// グラフのツールチップ。経過日数だけだと分かりにくいので年ごとの実日付も出す。
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{label}日目</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmtKg(p.value)}
          <span className="ml-2 text-muted-foreground">
            {p.payload[`${p.dataKey}__date`]}
          </span>
        </p>
      ))}
    </div>
  );
}

export default function Harvest() {
  const [summary, setSummary] = useState<HarvestSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fieldId, setFieldId] = useState(ALL);
  const [crop, setCrop] = useState(ALL);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [cumulative, setCumulative] = useState(false);

  // データは初回1回だけ取得し、絞り込みはすべてクライアント側で行う。
  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch(SUMMARY_URL, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setSummary(data);
        // 既定は直近3年
        setSelectedYears((data.years as number[]).slice(-3));
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    })();
  }, []);

  // 圃場グループごとに optgroup でまとめる。
  // 圃場名は「下島：だて白桃」のようにグループ名が頭に付くことが多く、
  // optgroup と二重になるのでその場合だけ接頭辞を落とす（「寺裏：栗」等はそのまま）。
  const fieldGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string }[]>();
    for (const f of summary?.fields ?? []) {
      const key = f.group || "その他";
      const label = f.name?.startsWith(`${f.group}：`)
        ? f.name.slice(f.group.length + 1)
        : f.name || f.id;
      const list = groups.get(key) ?? [];
      list.push({ id: f.id, name: label });
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [summary]);

  // 選択中の圃場に実際にある作物だけを候補にする
  const crops = useMemo(() => {
    if (!summary) return [];
    if (!fieldId) return summary.crops;
    const set = new Set(
      summary.days.filter((d) => d.fieldId === fieldId).map((d) => d.crop),
    );
    return summary.crops.filter((c) => set.has(c));
  }, [summary, fieldId]);

  // 圃場を切り替えて選択中の作物が無くなったら「すべて」に戻す
  useEffect(() => {
    if (crop && !crops.includes(crop)) setCrop(ALL);
  }, [crops, crop]);

  const series = useMemo(
    () =>
      summary
        ? toDayIndexSeries(summary.days, {
            fieldId: fieldId || undefined,
            crop: crop || undefined,
            years: selectedYears,
          })
        : [],
    [summary, fieldId, crop, selectedYears],
  );

  const chartData = useMemo(
    () => mergeSeriesForChart(series, cumulative),
    [series, cumulative],
  );

  const baseYear = summary?.years[0] ?? 0;

  function toggleYear(year: number) {
    setSelectedYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year],
    );
  }

  return (
    <div className="container mx-auto max-w-5xl py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">収穫記録</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          アグリノートの収穫記録を、各年の収穫開始日を0日目として重ねて比較します。
        </p>
      </header>

      {error && <p className="text-sm text-destructive">エラー: {error}</p>}
      {summary === null && !error && (
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      )}

      {summary && (
        <>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">圃場</span>
                  <select
                    value={fieldId}
                    onChange={(e) => setFieldId(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value={ALL}>すべての圃場</option>
                    {fieldGroups.map(([group, fields]) => (
                      <optgroup key={group} label={group}>
                        {fields.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-sm font-medium">作物</span>
                  <select
                    value={crop}
                    onChange={(e) => setCrop(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value={ALL}>すべての作物</option>
                    {crops.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="space-y-1">
                <span className="text-sm font-medium">年度</span>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {[...summary.years].reverse().map((y) => (
                    <label
                      key={y}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedYears.includes(y)}
                        onChange={() => toggleYear(y)}
                        className="h-4 w-4"
                      />
                      <span
                        className="font-medium"
                        style={{
                          color: selectedYears.includes(y)
                            ? yearColor(y, baseYear)
                            : undefined,
                        }}
                      >
                        {y}年
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                {[
                  { label: "日次", value: false },
                  { label: "累積", value: true },
                ].map((m) => (
                  <button
                    key={m.label}
                    onClick={() => setCumulative(m.value)}
                    className={
                      cumulative === m.value
                        ? "rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
                        : "rounded-md border px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted"
                    }
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">
                {cumulative ? "累積収穫量" : "日ごとの収穫量"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  該当する収穫記録がありません。
                </p>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 8, bottom: 24, left: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="day"
                        type="number"
                        allowDecimals={false}
                        domain={["dataMin", "dataMax"]}
                        tick={{ fontSize: 12 }}
                        label={{
                          value: "収穫開始日からの日数",
                          position: "insideBottom",
                          offset: -16,
                          fontSize: 12,
                        }}
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        width={64}
                        tickFormatter={(v: number) => v.toLocaleString("ja-JP")}
                        label={{
                          value: "kg",
                          angle: -90,
                          position: "insideLeft",
                          fontSize: 12,
                        }}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend verticalAlign="top" height={28} />
                      {series.map((s) => (
                        <Line
                          key={s.year}
                          type="monotone"
                          dataKey={String(s.year)}
                          name={`${s.year}年`}
                          stroke={yearColor(s.year, baseYear)}
                          strokeWidth={2}
                          dot={{ r: 2 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {series.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader className="bg-muted/50">
                <CardTitle className="text-xl">年度別サマリ</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>年度</TableHead>
                        <TableHead>収穫開始日</TableHead>
                        <TableHead>最終収穫日</TableHead>
                        <TableHead className="text-right">収穫日数</TableHead>
                        <TableHead className="text-right">合計</TableHead>
                        <TableHead className="text-right">ピーク</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...series].reverse().map((s) => (
                        <TableRow key={s.year}>
                          <TableCell
                            className="font-medium"
                            style={{ color: yearColor(s.year, baseYear) }}
                          >
                            {s.year}年
                          </TableCell>
                          <TableCell>{s.start}</TableCell>
                          <TableCell>{s.end}</TableCell>
                          <TableCell className="text-right">
                            {s.dayCount}日
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {fmtKg(s.totalKg)}
                          </TableCell>
                          <TableCell className="text-right">
                            {s.peak
                              ? `${s.peak.day}日目 / ${fmtKg(s.peak.kg)}`
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
