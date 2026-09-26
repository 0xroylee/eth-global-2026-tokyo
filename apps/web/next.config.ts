import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @boss-pool/chain ships TypeScript source, not compiled JS.
  transpilePackages: ["@boss-pool/chain"],
  reactStrictMode: true,
};

export default nextConfig;
