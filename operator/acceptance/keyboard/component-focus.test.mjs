// Real component event handlers with explicit hook/ref doubles, not a browser,
// authentication, archive validation, or durable recovery acceptance test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { sourceLabel, uiText } from "../../src/lib/domain/plain-language.ts";

function mount(file, exportName, mocks, props = {}) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  let tree;
  let focused;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useId() { return `test-id-${cursor++}`; },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || dependencies.some((item, i) => !Object.is(item, previous[i]))) effects.push(effect);
      slots[index] = dependencies;
    },
  };
  const jsx = (type, elementProps) => ({ type, props: elementProps });
  const source = readFileSync(new URL(`../../src/components/${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(`${compiled}\nexports.${exportName} = ${exportName};`, {
    exports,
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name in mocks) return mocks[name];
      throw new Error(`Unexpected component dependency: ${name}`);
    },
  }, { filename: file });
  const all = () => {
    const nodes = [];
    const visit = (node) => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== "object") return;
      nodes.push(node);
      visit(node.props?.children);
    };
    visit(tree);
    return nodes;
  };
  const render = () => {
    cursor = 0;
    effects = [];
    tree = exports[exportName](props);
    for (const node of all()) {
      if (node.props.ref) node.props.ref.current = {
        focus() { focused = node; },
        querySelector(selector) {
          assert.equal(selector, "button");
          const buttons = [];
          const visit = (child) => {
            if (Array.isArray(child)) return child.forEach(visit);
            if (!child || typeof child !== "object") return;
            if (child.type === "button") buttons.push(child);
            visit(child.props?.children);
          };
          visit(node.props.children);
          return buttons[0] ? { focus() { focused = buttons[0]; } } : null;
        },
      };
    }
    effects.forEach((effect) => effect());
  };
  render();
  return { render, all, find: (predicate) => all().find(predicate), focused: () => focused };
}

const button = { Button: "button" };
const shell = { Panel: "section", ErrorNote: "error-note" };
const input = (type) => (node) => node.type === "input" && node.props.type === type;
const text = (node) => JSON.stringify(node?.props.children);

for (const failure of ["rejected password", "unreachable app"]) {
  test(`component double: ${failure} restores password focus and exposes related error`, async () => {
    const app = mount("access-screen.tsx", "AccessScreen", {
      "@/components/ui/button": button,
      "@/lib/auth/client": { authClient: { signIn: { email: async () => {
        if (failure === "unreachable app") throw new Error("fictional offline error");
        return { error: { code: "FICTIONAL" } };
      } } } },
    }, { mode: "login" });
    app.find(input("password")).props.onChange({ target: { value: "fictional-password-only" } });
    app.render();
    await app.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    app.render();
    const password = app.find(input("password"));
    assert.equal(app.focused(), password);
    assert.equal(password.props.value, "");
    assert.equal(password.props["aria-invalid"], true);
    assert.ok(app.find((node) => node.props.id === password.props["aria-describedby"] && node.props.role === "alert"));
  });
}

function archiveApp() {
  const restore = {
    isPending: false, isSuccess: false, error: null,
    reset() { this.isSuccess = false; this.error = null; },
    mutate(_value, callbacks) { this.isSuccess = true; callbacks.onSuccess(); },
  };
  const app = mount("workspace-archive-panel.tsx", "WorkspaceArchivePanel", {
    "@/components/ui/button": button,
    "@/components/shell": shell,
    "@/lib/workspace": {
      useExportArchive: () => ({ isPending: false, error: null }),
      useRestoreArchive: () => restore,
      mutationMessage: (error) => error.message,
    },
  });
  return app;
}

test("component double: successful restore removes action and focuses stable status", async () => {
  const app = archiveApp();
  const target = { value: "fictional.json", files: [{ name: "fictional.json", size: 2, text: async () => "{}" }] };
  await app.find(input("file")).props.onChange({ target });
  assert.equal(target.value, "", "same backup can be selected again");
  app.render();
  app.find(input("checkbox")).props.onChange({ target: { checked: true } });
  app.render();
  const action = app.find((node) => node.type === "button" && text(node).includes("Restore selected backup"));
  assert.equal(action.props.disabled, false);
  action.props.onClick();
  app.render();
  assert.equal(app.find(input("checkbox")), undefined);
  assert.equal(app.focused().props.role, "status");
  assert.equal(app.focused().props.tabIndex, -1);
  assert.match(text(app.focused()), /Restored\. Reload to view your workspace\./);
});

test("component double: oversized backup focuses described feedback without reading file", async () => {
  const app = archiveApp();
  let reads = 0;
  await app.find(input("file")).props.onChange({ target: {
    value: "fictional-large.json",
    files: [{ size: 20 * 1024 * 1024 + 1, text: async () => { reads++; return "{}"; } }],
  } });
  app.render();
  const file = app.find(input("file"));
  assert.equal(reads, 0);
  assert.equal(file.props["aria-invalid"], true);
  assert.equal(app.focused().props.id, file.props["aria-describedby"]);
  assert.match(app.find((node) => node.type === "error-note").props.message, /20 MiB/);
});

test("component double: unreadable file can be selected again and recovered", async () => {
  const app = archiveApp();
  const target = { value: "fictional.json", files: [{ name: "fictional.json", size: 2, text: async () => { throw new Error("fictional read failure"); } }] };
  await app.find(input("file")).props.onChange({ target });
  app.render();
  assert.equal(target.value, "");
  assert.match(app.find((node) => node.type === "error-note").props.message, /could not be read/);
  target.files[0].text = async () => "{}";
  await app.find(input("file")).props.onChange({ target });
  app.render();
  assert.equal(app.find((node) => node.type === "error-note"), undefined);
  assert.ok(app.find(input("checkbox")));
});

for (const dismissal of ["Cancel", "Escape"]) {
  test(`component double: rejection ${dismissal} restores Reject focus without reviewing`, () => {
    let mutations = 0;
    const app = mount("review-view.tsx", "ReviewCard", {
      "@tanstack/react-router": { Link: "a" },
      "@/components/shell": shell,
      "@/components/ui/button": button,
      "@/components/ui/badge": { Badge: "badge" },
      "@/lib/domain/plain-language": { sourceLabel, uiText },
      "@/lib/workspace": {
        useReviewProspect: () => ({ isPending: false, mutate() { mutations++; } }),
        useParkGreenfield: () => ({ isPending: false }),
      },
    }, { item: { id: "fictional", assessment: { dimensions: [] } } });
    const findButton = (label) => app.find((node) => node.type === "button" && node.props.children === label);
    findButton("Reject").props.onClick();
    app.render();
    assert.equal(app.focused(), findButton("Confirm rejection"));
    if (dismissal === "Cancel") findButton("Cancel").props.onClick();
    else {
      let prevented = false;
      app.find((node) => node.props.onKeyDown).props.onKeyDown({ key: "Escape", preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
    }
    app.render();
    assert.equal(findButton("Confirm rejection"), undefined);
    assert.equal(app.focused(), findButton("Reject"));
    assert.equal(mutations, 0);
  });
}
