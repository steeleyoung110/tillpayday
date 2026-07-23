import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Next doesn't guess from stray parent lockfiles.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
