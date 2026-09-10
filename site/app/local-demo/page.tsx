import { notFound } from "next/navigation";

/** Development-only route boundary.
 *
 * The screen lives in the sibling `_screen` module, which vinext never treats
 * as a route (app-route-graph excludes `_`-prefixed names), and is reached only
 * through a dynamic import inside a branch that folds away in a production
 * build. Rollup then drops the chunk entirely, so no LOCAL_DEMO markup reaches
 * `dist/`. In production this route answers exactly like any unknown path.
 *
 * tests/production-bundle-boundary.test.mjs enforces that against the artifact.
 */
export default async function LocalDemo() {
  if (import.meta.env.DEV) {
    const { admitLocalDemoPage } = await import("./_admission");
    if (await admitLocalDemoPage()) {
      const { LocalDemoScreen } = await import("./_screen");
      return <LocalDemoScreen />;
    }
  }
  notFound();
}
