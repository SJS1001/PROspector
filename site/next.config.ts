import type { NextConfig } from "next";

const standardPageExtensions = ["tsx", "ts", "jsx", "js"];

/** The composition endpoint is discoverable only by the development server. */
export default function nextConfig(phase: string): NextConfig {
  return {
    pageExtensions: phase === "phase-development-server"
      ? [...standardPageExtensions, "localdemo"]
      : standardPageExtensions,
  };
}
