import {
  isProbeId,
  type ObjectStoragePort,
  workspaceProbeObjectKey,
} from "../../domain/ports/object-storage";

export class R2ObjectStorage implements ObjectStoragePort {
  readonly #bucket: R2Bucket;
  readonly #workspaceId: string;

  constructor(bucket: R2Bucket, workspaceId: string) {
    this.#bucket = bucket;
    this.#workspaceId = workspaceId;
  }

  async put(probeId: string, bytes: Uint8Array): Promise<void> {
    this.assertProbeId(probeId);
    await this.#bucket.put(await this.key(probeId), bytes);
  }

  async get(probeId: string): Promise<Uint8Array | null> {
    this.assertProbeId(probeId);
    const object = await this.#bucket.get(await this.key(probeId));
    return object ? new Uint8Array(await object.arrayBuffer()) : null;
  }

  async delete(probeId: string): Promise<void> {
    this.assertProbeId(probeId);
    await this.#bucket.delete(await this.key(probeId));
  }

  async exists(probeId: string): Promise<boolean> {
    this.assertProbeId(probeId);
    return Boolean(await this.#bucket.head(await this.key(probeId)));
  }

  async key(probeId: string) {
    return workspaceProbeObjectKey(this.#workspaceId, probeId);
  }

  assertProbeId(probeId: string) {
    if (!isProbeId(probeId)) throw new Error("Invalid probe identifier");
  }
}
