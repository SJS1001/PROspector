import { requireNativeContainment } from "./native-boundary.mjs";

// Refuse direct invocation outside the verified OS policy, even with forged env.
requireNativeContainment({ positive: true });
await import("./orchestrator.mjs");
