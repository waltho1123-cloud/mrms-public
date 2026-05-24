import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bullmq", "ioredis", "bcryptjs", "@prisma/client"],
  experimental: {
    // Increase body size limit for audio file uploads (200MB)
    serverActions: {
      bodySizeLimit: "200mb",
    },
  },
};

export default nextConfig;
