import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("entry", "routes/entry.tsx"),
] satisfies RouteConfig;
