import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { "/api/cron/*": ["./src/app/fonts/Geist-Regular.ttf", "./src/app/fonts/LICENSE.txt", "./src/app/fonts/fonts.conf"] },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "vqdpveyshgvdhbsgskns.supabase.co",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
