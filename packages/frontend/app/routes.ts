import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("about", "routes/about.tsx"),
  route("dashboard", "routes/dashboard.tsx", [
    route("settings", "routes/settings.tsx"),
  ]),
] satisfies RouteConfig;
