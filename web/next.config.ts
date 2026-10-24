import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The API serves photos; the web app only renders them through <img>, so no remote image config is needed.
  async redirects() {
    return [
      { source: "/analyze", destination: "/start", permanent: false },
      { source: "/passport/:id", destination: "/p/:id", permanent: false },
      { source: "/sample", destination: "/p/ap_sample_0001", permanent: false },
    ];
  },
};

export default nextConfig;
