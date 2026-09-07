import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

async function loadModules(...relativePaths) {
  const server = await createServer({
    configFile: false,
    logLevel: "silent",
    plugins: [react()],
    server: { middlewareMode: true },
  });
  try {
    const modules = await Promise.all(
      relativePaths.map((path) => server.ssrLoadModule(new URL(path, import.meta.url).pathname)),
    );
    return { server, modules };
  } catch (error) {
    await server.close();
    throw error;
  }
}

test("operator scope trail clears every descendant when a parent field changes", async () => {
  const { server, modules: [operatorContext] } = await loadModules("../app/operator-context.ts");
  try {
    const { EMPTY_OPERATOR_SCOPE, withOperatorCompany, withOperatorProduct, withOperatorMarketPlay, withOperatorProfile } = operatorContext;

    const withProfile = withOperatorProfile(
      withOperatorMarketPlay(
        withOperatorProduct(
          withOperatorCompany(EMPTY_OPERATOR_SCOPE, "Digitalrain"),
          "ONE",
        ),
        "ONE for Mining",
      ),
      "Operating sites",
    );
    assert.deepEqual(withProfile, {
      company: "Digitalrain",
      product: "ONE",
      marketPlay: "ONE for Mining",
      profile: "Operating sites",
    });

    // Changing the company clears every narrower field.
    assert.deepEqual(withOperatorCompany(withProfile, "Other Co"), {
      company: "Other Co",
      product: null,
      marketPlay: null,
      profile: null,
    });
    // Changing the product clears market play and profile, but keeps the company.
    assert.deepEqual(withOperatorProduct(withProfile, "TWO"), {
      company: "Digitalrain",
      product: "TWO",
      marketPlay: null,
      profile: null,
    });
    // Changing the market play clears only the profile.
    assert.deepEqual(withOperatorMarketPlay(withProfile, "TWO for Ports"), {
      company: "Digitalrain",
      product: "ONE",
      marketPlay: "TWO for Ports",
      profile: null,
    });
    // Setting the same value is a no-op (referentially stable, nothing cleared).
    assert.equal(withOperatorCompany(withProfile, "Digitalrain"), withProfile);
  } finally {
    await server.close();
  }
});

test("task-state badge only exposes the two honest, plain-language states", async () => {
  const { server, modules: [taskState] } = await loadModules("../app/task-state.ts");
  try {
    assert.deepEqual(taskState.TASK_STATE_LABELS, {
      ready: "Ready",
      action_needed: "Action needed",
    });
    const readyHtml = renderToStaticMarkup(createElement(taskState.TaskStateBadge, { state: "ready" }));
    const actionHtml = renderToStaticMarkup(createElement(taskState.TaskStateBadge, { state: "action_needed" }));
    assert.match(readyHtml, /<span class="task-state ready">Ready<\/span>/);
    assert.match(actionHtml, /<span class="task-state action_needed">Action needed<\/span>/);
  } finally {
    await server.close();
  }
});

test("the operator shell shows only the six real tasks, mounts Contacts, and hides unbuilt placeholders", async () => {
  const { server, modules: [app] } = await loadModules("../app/prospector-app.tsx");
  try {
    const html = renderToStaticMarkup(createElement(app.ProspectorApp, { initialView: "contacts" }));
    assert.match(html, /CONTACTS · OWNER-ONLY/);
    assert.match(html, /Create grant confirmation/);
    // Removed/unbuilt surfaces never render.
    assert.doesNotMatch(html, /Morning Brief|Exports & History/);
    assert.doesNotMatch(html, /Codex runner|Not connected · fixture mode/);
    assert.doesNotMatch(html, /aria-label="Search prospects"/);

    const statusHtml = renderToStaticMarkup(createElement(app.ProspectorApp, { initialView: "status" }));
    // Company setup starts unresolved, so the nav badge reads "action needed" in plain language.
    assert.match(statusHtml, /<span class="task-state action_needed">Action needed<\/span>/);
  } finally {
    await server.close();
  }
});
