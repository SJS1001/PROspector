import { requireNativeContainment } from "./native-boundary.mjs";

// Refuse before importing either instrumentation or application code.
requireNativeContainment();
await import("./instrumentation.mjs");
