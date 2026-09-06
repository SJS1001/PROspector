import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PROSPECTOR_BROWSER_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("PROSPECTOR_BROWSER_PORT must be a reserved non-privileged port");
}
const lane = process.env.PROSPECTOR_BROWSER_LANE;
if (lane !== "onboarding" && lane !== "person-discovery-c4") throw new Error("PROSPECTOR_BROWSER_LANE must select one isolated lane");

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: lane === "onboarding" ? "onboarding.spec.ts" : "person-discovery-c4.spec.ts",
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
