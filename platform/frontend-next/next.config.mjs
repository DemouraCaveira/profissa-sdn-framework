/** @type {import('next').NextConfig} */
// API_URL: used server-side for rewrites (read at runtime by Next.js server).
// Falls back to localhost:8000 which is the desktop default.
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.BACKEND_URL ??
  "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: [],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
