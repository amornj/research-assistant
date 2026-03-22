import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  env: {
    NEXT_PUBLIC_SYNC_API_URL: process.env.SYNC_API_URL || '',
    NEXT_PUBLIC_PROJECTS_API_KEY: process.env.PROJECTS_API_KEY || '',
  },
};

export default nextConfig;
