import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

test("workspace object prefix is opaque and rejects traversal", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const storage = await vite.ssrLoadModule(
      new URL("../domain/ports/object-storage.ts", import.meta.url).pathname,
    );
    const prefix = storage.workspaceObjectPrefix("ws_123-safe");
    assert.match(prefix, /^workspaces\/[a-f0-9]{32,64}\/capability-probes\/$/);
    assert.doesNotMatch(prefix, /ws_123-safe/);
    assert.throws(() => storage.workspaceObjectPrefix("../foreign"));
    assert.throws(() => storage.workspaceObjectPrefix(""));

    const source = await readFile(
      new URL("../domain/ports/object-storage.ts", import.meta.url),
      "utf8",
    );
    assert.match(source, /export interface ObjectStoragePort/);
    assert.doesNotMatch(source, /R2Bucket|cloudflare:workers/);
  } finally {
    await vite.close();
  }
});

test("object proof succeeds only after digest, delete, and absence checks", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const { runObjectStorageProof } = await vite.ssrLoadModule(
      new URL("../domain/capabilities.ts", import.meta.url).pathname,
    );

    const successful = new MemoryObjectStorage();
    const result = await runObjectStorageProof(successful);
    assert.equal(result.status, "proven");
    assert.deepEqual(result.steps, {
      put: true,
      read: true,
      digest: true,
      delete: true,
      absence: true,
    });
    assert.equal(successful.objects.size, 0);
    assert.doesNotMatch(JSON.stringify(result), /payload|Uint8Array|workspace/i);

    for (const port of [
      new MemoryObjectStorage({ corruptRead: true }),
      new MemoryObjectStorage({ failDelete: true }),
      new MemoryObjectStorage({ retainAfterDelete: true }),
    ]) {
      const failed = await runObjectStorageProof(port);
      assert.notEqual(failed.status, "proven");
      assert.equal(port.putProbeIds.every(isOpaqueProbeId), true);
    }
  } finally {
    await vite.close();
  }
});

class MemoryObjectStorage {
  constructor(options = {}) {
    this.options = options;
    this.objects = new Map();
    this.putProbeIds = [];
  }

  async put(probeId, bytes) {
    if (!isOpaqueProbeId(probeId)) throw new Error("unsafe_probe_id");
    this.putProbeIds.push(probeId);
    this.objects.set(probeId, new Uint8Array(bytes));
  }

  async get(probeId) {
    const bytes = this.objects.get(probeId);
    if (!bytes) return null;
    if (!this.options.corruptRead) return new Uint8Array(bytes);
    const corrupt = new Uint8Array(bytes);
    corrupt[0] ^= 0xff;
    return corrupt;
  }

  async delete(probeId) {
    if (this.options.failDelete) throw new Error("delete_failed");
    if (!this.options.retainAfterDelete) this.objects.delete(probeId);
  }

  async exists(probeId) {
    return this.objects.has(probeId);
  }
}

function isOpaqueProbeId(value) {
  return /^[a-f0-9]{32}$/.test(value);
}
