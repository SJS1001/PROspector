/** The single fixed development-only owner identity.
 *
 * It lives in its own module, reached only through a dynamic import inside an
 * `import.meta.env.DEV` branch in app/runtime-identity.ts. That branch folds to
 * `if (false)` in a production build and Rollup drops this chunk, so the demo
 * address cannot appear in `dist/` even as unreachable text -- the rsc
 * environment emits unminified output, so dead statements are otherwise still
 * carried into the artifact.
 *
 * A `_`-prefixed name is never a route: vinext's app-route-graph excludes them.
 * tests/production-bundle-boundary.test.mjs enforces the absence against dist/.
 */
export const LOCAL_DEMO_IDENTITY = {
  email: "local-owner@prospector.invalid",
  displayName: "Local Demo Owner",
} as const;
