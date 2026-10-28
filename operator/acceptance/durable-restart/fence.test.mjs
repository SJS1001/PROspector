import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
test("test-only runtime fence refuses fetch, TCP, TLS and UDP before connection", () => {
  const dir = mkdtempSync(join(tmpdir(), "prospector-fence-"));
  const log = join(dir, "effects");
  try {
    const r = spawnSync(
      process.execPath,
      [
        "--import",
        fileURLToPath(new URL("./runtime.mjs", import.meta.url)),
        "--input-type=module",
        "-e",
        `
   import assert from 'node:assert/strict';
   import net from 'node:net'; import tls from 'node:tls'; import dgram from 'node:dgram';
   for(const action of [()=>fetch('https://quarry.example'),()=>net.connect(443,'quarry.example'),()=>tls.connect(443,'quarry.example'),()=>dgram.createSocket('udp4')]) assert.throws(action,/denies outbound network/);
  `,
      ],
      {
        env: { PATH: process.env.PATH, DURABLE_EFFECT_LOG: log },
        encoding: "utf8",
        timeout: 15000,
      },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"), Array(4).fill("DENIED_NETWORK"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
