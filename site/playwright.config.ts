import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PROSPECTOR_BROWSER_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("PROSPECTOR_BROWSER_PORT must be a reserved non-privileged port");
}
const lane = process.env.PROSPECTOR_BROWSER_LANE;
const LANES = ["onboarding", "person-discovery-c4", "operator-journey-e1"] as const;
if (!LANES.includes(lane as (typeof LANES)[number])) throw new Error("PROSPECTOR_BROWSER_LANE must select one isolated lane");

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: `${lane}.spec.ts`,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "line",
  outputDir: process.env.PROSPECTOR_BROWSER_ARTIFACTS,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    acceptDownloads: false,
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "off",
    video: "off",
  },
});
