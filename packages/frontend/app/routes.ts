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
  ]),
] satisfies RouteConfig;
