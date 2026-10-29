import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The Pi grading harness (Stage 3) runs only in Node route handlers; it
  // pulls Node/WASI internals Turbopack cannot bundle, so it stays external
  // and is required at runtime.
  serverExternalPackages: [
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-agent-core",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-codemode",
    "@earendil-works/pi-mcp",
    "@earendil-works/pi-telemetry",
    "@earendil-works/pi-tui",
  ],
};

export default nextConfig;
