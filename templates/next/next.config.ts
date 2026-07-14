import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WebAssembly build that Next's server bundler cannot instantiate; keep it (and the
  // drizzle adapter that loads it) as runtime Node imports so the route handlers / RSC reads can use it.
  serverExternalPackages: ["@electric-sql/pglite", "rxfy-server-drizzle", "drizzle-orm"],
};

export default nextConfig;
