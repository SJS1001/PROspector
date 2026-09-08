/**
 * The disposable local-demo owner identity.
 *
 * This lives in its own module so a production build can replace it outright
 * (see `build/local-demo-exclusion-vite-plugin.ts`). `resolveRuntimeIdentity`
 * already refuses the demo path unless `import.meta.env.DEV`, but that gate
 * folds without removing the literal, so the address itself would otherwise be
 * emitted into `dist/`. Stubbing the module to `null` makes production return
 * the same `null` the gate already guarantees, one layer earlier and by
 * construction.
 */
export type LocalDemoIdentity = { email: string; displayName: string };

export const LOCAL_DEMO_IDENTITY: LocalDemoIdentity | null = {
  email: "local-owner@prospector.invalid",
  displayName: "Local Demo Owner",
};
