import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Skip TypeScript check — SWC type checker crashes on ARM/Termux
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
