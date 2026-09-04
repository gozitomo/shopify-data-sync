import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("layouts/sidebar.tsx", [
    index("routes/home.tsx"),
    route("scan", "routes/scan.tsx"),
    route("export", "routes/export.tsx"),
    route("export-b2", "routes/export-b2.tsx"),
    route("import-shipments", "routes/import-shipments.tsx"),
    route("shipped", "routes/shipped.tsx"),
    route("peach-survey", "routes/peach-survey.tsx"),
    route("settings", "routes/settings.tsx"),
  ]),
  // 共有ページ: ドメイン外の許可リストの人も閲覧可（サイドバー無し）。
  layout("layouts/peach-share.tsx", [
    route("share/peach", "routes/peach-share.tsx"),
  ]),
] satisfies RouteConfig;
