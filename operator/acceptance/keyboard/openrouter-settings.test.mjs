import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

import * as llm from "../../src/lib/domain/llm.ts";
import { OPENROUTER_EXCLUSION_COPY } from "../../src/lib/domain/openrouter-policy.ts";

function mountSettings(savedProvider) {
  const slots = [];
  let cursor = 0;
  let tree;
  const saved = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useId() { return `test-id-${cursor++}`; },
    useEffect() {},
  };
  const jsx = (type, props) => ({ type, props });
  const source = readFileSync(new URL("../../src/components/settings-view.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  const workspace = {
    data: {
      connections: {
        llm: true,
        llmProvider: savedProvider,
        llmProviderLabel: llm.llmProvider(savedProvider).label,
        llmModel: llm.llmProvider(savedProvider).defaultModel,
        huntBatch: 8,
        spendUsedCents: 0,
        monthlyBudgetCents: 5000,
        llmWorkspaceId: "",
        jev: true,
        apollo: true,
        apolloLeadLeft: 3,
        apolloLeadLimit: 10,
        zoominfo: true,
        gmail: true,
        gmailUser: "owner@example.invalid",
        inboxScannedAt: null,
      },
      crm: { eligibleCount: 0 },
    },
    isPending: false,
    isError: false,
  };
  vm.runInNewContext(`${compiled}\nexports.SettingsView = SettingsView;`, {
    exports,
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name === "@/lib/domain/llm") return llm;
      if (name === "@/lib/domain/openrouter-policy") return { OPENROUTER_EXCLUSION_COPY };
      if (name === "@/lib/domain/plain-language") return { uiText: (value) => value };
      if (name === "@/lib/workspace") return {
        mutationMessage: (error) => String(error),
        useWorkspace: () => workspace,
        useSaveConnections: () => ({ isPending: false, error: null, isSuccess: false, mutate: (body) => saved.push(body) }),
        useExportCrm: () => ({ isPending: false, error: null, mutate() {} }),
      };
      if (name.startsWith("@/components/") || name.startsWith("@/components/ui/")) return new Proxy({}, { get: () => "stub" });
      throw new Error(`Unexpected component dependency: ${name}`);
    },
  }, { filename: "settings-view.tsx" });
  const texts = [];
  const labels = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (typeof node === "string") texts.push(node);
    if (typeof node.props?.children === "string") texts.push(node.props.children);
    if (typeof node.props?.["aria-label"] === "string") labels.push(node.props["aria-label"]);
    if (node.props?.role === "note") texts.push("note");
    visit(node.props?.children);
  };
  const render = () => {
    cursor = 0;
    texts.length = 0;
    labels.length = 0;
    const treeNow = exports.SettingsView();
    tree = treeNow;
    visit(tree);
    return tree;
  };
  const select = () => {
    render();
    const found = [];
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      if (node.type === "select") found.push(node);
      walk(node.props?.children);
    };
    walk(tree);
    assert.equal(found.length, 1);
    return found[0];
  };
  const button = () => {
    const found = [];
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      const label = node.props?.children;
      if (node.props?.onClick && (label === "Save connections" || (Array.isArray(label) && label.includes("Save connections")))) found.push(node);
      walk(node.props?.children);
    };
    walk(tree);
    return found[0];
  };
  return { render, select, button, saved, texts, labels };
}

test("OpenRouter settings show only its key and model, and switching back restores Apollo", () => {
  const view = mountSettings("xai");
  view.render();
  assert.ok(view.labels.includes("Apollo API key"));
  assert.equal(view.texts.includes(OPENROUTER_EXCLUSION_COPY), false);
  view.select().props.onChange({ target: { value: "openrouter" } });
  view.render();
  assert.equal(view.labels.includes("Apollo API key"), false);
  assert.equal(view.labels.includes("ZoomInfo API key"), false);
  assert.equal(view.labels.includes("TypeSafe / Jev API key"), false);
  assert.equal(view.labels.includes("Gmail app password"), false);
  assert.ok(view.labels.includes("OpenRouter API key"));
  assert.ok(view.labels.includes("OpenRouter model id"));
  assert.ok(view.texts.includes(OPENROUTER_EXCLUSION_COPY));
  view.button().props.onClick();
  assert.equal(view.saved[0].llmProvider, "openrouter");
  assert.equal(view.saved[0].apollo, "");
  assert.equal(view.saved[0].zoominfo, "");
  assert.equal(view.saved[0].gmailPass, "");
  assert.equal(view.saved[0].xai, "");
  view.select().props.onChange({ target: { value: "xai" } });
  view.render();
  assert.ok(view.labels.includes("Apollo API key"));
  assert.equal(view.labels.includes("OpenRouter API key"), false);
  assert.equal(view.texts.includes(OPENROUTER_EXCLUSION_COPY), false);
});
