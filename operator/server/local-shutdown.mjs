/**
 * Close HTTP before application resources. The initial close promise must still
 * settle after forcing sockets closed; repeated signals share the same cleanup.
 * @param {{ close: (force?: boolean) => Promise<void> }} server
 * @param {() => Promise<void>} closeResources
 * @param {number} timeoutMs
 */
export function createLocalShutdown(server, closeResources, timeoutMs = 5000) {
  /** @type {Promise<void> | undefined} */
  let closing;
  return () => {
    closing ??= (async () => {
      /** @type {Promise<void> | undefined} */
      let forced;
      const timer = setTimeout(() => {
        forced = server.close(true);
        // Observe immediately, then propagate after the initial drain settles.
        void forced.catch(() => undefined);
      }, timeoutMs);
      try {
        await server.close();
        await forced;
      } finally {
        clearTimeout(timer);
      }
      await closeResources();
    })();
    return closing;
  };
}
