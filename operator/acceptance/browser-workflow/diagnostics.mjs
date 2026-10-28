// Retain code locations, never error messages, selector contents or runtime logs.
export function failureEvidence(error, stage) {
  const stack = typeof error?.stack === "string" ? error.stack : "";
  const locations = [
    ...stack.matchAll(
      /\b(workflow|run|orchestrator|contained-run|native-probe|browser-fence)\.mjs:(\d+):(\d+)\)?$/gm,
    ),
  ].map((match) => `${match[1]}.mjs:${match[2]}:${match[3]}`);
  return {
    stage,
    name: ["Error", "TimeoutError", "AssertionError", "TypeError"].includes(error?.name)
      ? error.name
      : "Error",
    locations: [...new Set(locations)],
    ...(stack.match(/net::ERR_[A-Z_]+/)
      ? { networkError: stack.match(/net::ERR_[A-Z_]+/)[0] }
      : {}),
    category: stack.includes("Executable doesn't exist")
      ? "missing-pinned-executable"
      : error?.name === "TimeoutError"
        ? "browser-timeout"
        : "assertion-or-runtime-failure",
  };
}
