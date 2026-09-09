import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const componentPath = resolve(root, "app/local-demo/_outreach-approval-preview.tsx");

const fictionalProps = {
  packageApproval: {
    label: "Fictional mining package",
    digest: "a".repeat(64),
    state: "approved",
  },
  messageApproval: {
    label: "Fictional first message",
    digest: "b".repeat(64),
    packageDigest: "a".repeat(64),
    state: "approved",
  },
  currentSuppression: {
    subjectLabel: "Fictional reviewed subject",
    state: "clear",
    digest: "c".repeat(64),
    messageDigest: "b".repeat(64),
  },
};

async function withPreview(run) {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const preview = await vite.ssrLoadModule(componentPath);
    await run(preview);
  } finally {
    await vite.close();
  }
}

test("fictional outreach preview presents Package before Message, bound digests, suppression, and zero-effect controls", async () => {
  await withPreview(async (preview) => {
    const html = renderToStaticMarkup(React.createElement(preview.LocalDemoOutreachApprovalPreview, fictionalProps));
    assert.match(html, /<section[^>]+aria-labelledby="local-demo-outreach-preview-title"/);
    assert.match(html, /<h2 id="local-demo-outreach-preview-title">Outreach approval and suppression preview<\/h2>/);
    assert.ok(html.indexOf("1. Package approval") < html.indexOf("2. Message approval"));
    assert.match(html, new RegExp(`Package digest</dt><dd>${"a".repeat(64)}</dd>`));
    assert.match(html, new RegExp(`Message digest</dt><dd>${"b".repeat(64)}</dd>`));
    assert.match(html, new RegExp(`Suppression digest</dt><dd>${"c".repeat(64)}</dd>`));
    assert.match(html, /Current fictional recheck is clear/);
    assert.match(html, /<button[^>]+disabled[^>]+aria-describedby="local-demo-gmail-disabled-copy"[^>]*>Send with Gmail<\/button>/);
    assert.match(html, /<button[^>]+disabled[^>]+aria-describedby="local-demo-call-disabled-copy"[^>]*>Click-to-call<\/button>/);
    assert.match(html, /no Gmail, phone, provider, persistence, or outbound effect is available/);
  });
});

test("a waiting, invalidated, or mismatched Package exposes no downstream Message or suppression detail", async () => {
  await withPreview(async (preview) => {
    for (const packageApproval of [
      { ...fictionalProps.packageApproval, state: "waiting" },
      { ...fictionalProps.packageApproval, state: "invalidated", invalidationReason: "fictional package revision changed" },
      { ...fictionalProps.packageApproval, state: "approved", digest: "d".repeat(64) },
    ]) {
      const html = renderToStaticMarkup(React.createElement(preview.LocalDemoOutreachApprovalPreview, {
        ...fictionalProps,
        packageApproval,
      }));
      assert.match(html, /Package review is blocked until its fictional approval is approved|Message review is blocked until the exact fictional Package and Message approvals are approved/);
      assert.match(html, /data-message-review-blocked="true"/);
      assert.match(html, /data-suppression-review-blocked="true"/);
      for (const detail of [
        "Fictional message",
        "Message digest",
        "Bound Package digest",
        "Fictional subject",
        "Suppression digest",
        "fictional package revision changed",
        fictionalProps.messageApproval.label,
        fictionalProps.messageApproval.digest,
        fictionalProps.messageApproval.packageDigest,
        fictionalProps.currentSuppression.subjectLabel,
        fictionalProps.currentSuppression.digest,
      ]) assert.doesNotMatch(html, new RegExp(detail));
    }
  });
});

test("a waiting, invalidated, or mismatched Message exposes no Message or suppression detail", async () => {
  await withPreview(async (preview) => {
    for (const messageApproval of [
      { ...fictionalProps.messageApproval, state: "waiting" },
      { ...fictionalProps.messageApproval, state: "invalidated", invalidationReason: "fictional message revision changed" },
      { ...fictionalProps.messageApproval, packageDigest: "d".repeat(64) },
    ]) {
      const html = renderToStaticMarkup(React.createElement(preview.LocalDemoOutreachApprovalPreview, {
        ...fictionalProps,
        messageApproval,
      }));
      assert.match(html, /Message review is blocked until the exact fictional Package and Message approvals are approved/);
      assert.match(html, /Suppression recheck is blocked until the exact fictional approved Message is bound/);
      assert.match(html, /data-message-review-blocked="true"/);
      assert.match(html, /data-suppression-review-blocked="true"/);
      for (const detail of [
        "Fictional message",
        "Message digest",
        "Bound Package digest",
        "Fictional subject",
        "Suppression digest",
        "fictional message revision changed",
        messageApproval.label,
        messageApproval.digest,
        fictionalProps.currentSuppression.subjectLabel,
        fictionalProps.currentSuppression.digest,
      ]) assert.doesNotMatch(html, new RegExp(detail));
    }
  });
});

test("suppression detail requires a binding to the exact approved Message digest", async () => {
  await withPreview(async (preview) => {
    const html = renderToStaticMarkup(React.createElement(preview.LocalDemoOutreachApprovalPreview, {
      ...fictionalProps,
      currentSuppression: { ...fictionalProps.currentSuppression, messageDigest: "d".repeat(64), reason: "fictional mismatch" },
    }));
    assert.match(html, /Suppression recheck is blocked until the exact fictional approved Message is bound/);
    assert.match(html, /data-suppression-review-blocked="true"/);
    for (const detail of ["Fictional subject", "Suppression digest", "fictional mismatch", fictionalProps.currentSuppression.subjectLabel, fictionalProps.currentSuppression.digest]) {
      assert.doesNotMatch(html, new RegExp(detail));
    }
  });
});

test("hostile fictional labels are escaped and do not create executable markup", async () => {
  await withPreview(async (preview) => {
    const html = renderToStaticMarkup(React.createElement(preview.LocalDemoOutreachApprovalPreview, {
      ...fictionalProps,
      packageApproval: { ...fictionalProps.packageApproval, label: '<img src=x onerror="steal()">' },
      currentSuppression: { ...fictionalProps.currentSuppression, subjectLabel: "<script>steal()</script>" },
    }));
    assert.match(html, /&lt;img src=x onerror=&quot;steal\(\)&quot;&gt;/);
    assert.match(html, /&lt;script&gt;steal\(\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<img|<script/);
  });
});

test("preview source has no outbound seam and is not imported by a current route or app surface", async () => {
  const source = await readFile(componentPath, "utf8");
  for (const forbidden of [
    /\bfetch\s*\(/,
    /localStorage|sessionStorage|indexedDB|document\.cookie/,
    /navigator\.clipboard|clipboard/,
    /mailto:|tel:/,
    /createObjectURL|window\.open/,
    /onClick\s*=|onSubmit\s*=/,
    /provider.*adapter|adapter.*provider/i,
    /credential|token|secret/i,
    /export\s+(?:default\s+)?(?:async\s+)?function.*(?:csv|file)/i,
  ]) assert.doesNotMatch(source, forbidden, String(forbidden));

  const appFiles = await readdir(resolve(root, "app"), { recursive: true });
  const importers = [];
  for (const entry of appFiles) {
    if (typeof entry !== "string" || !entry.endsWith(".tsx")) continue;
    const path = resolve(root, "app", entry);
    if (path === componentPath) continue;
    if ((await readFile(path, "utf8")).includes("_outreach-approval-preview")) importers.push(entry);
  }
  assert.deepEqual(importers, []);
});
