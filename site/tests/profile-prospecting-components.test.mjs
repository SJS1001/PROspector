import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DIGEST = "a".repeat(64);

test("stale readiness presents the approved recovery copy and delegates reload", async () => {
  const { vite, readiness } = await modules();
  try {
    let reloads = 0;
    const element = React.createElement(readiness.ProfileReadiness, {
      readiness: staleReadiness(),
      busy: false,
      onCommand() {
        throw new Error("stale readiness must not mutate");
      },
      onReload() {
        reloads += 1;
      },
    });
    const html = renderToStaticMarkup(element);
    assert.match(
      html,
      /The Product, Market Play, or Offer changed\. Load the current authority before continuing\./,
    );
    assert.match(html, /Load current authority/);
    assert.doesNotMatch(html, /Activate Profile configuration/);
    let renderer;
    await act(() => {
      renderer = create(element);
    });
    const reload = button(renderer.root, "Load current authority");
    assert.ok(reload);
    await act(() => reload.props.onClick());
    assert.equal(reloads, 1);
    await act(() => renderer.unmount());
  } finally {
    await vite.close();
  }
});

test("review drafts and rejection confirmation remain card-local with deterministic focus", async () => {
  const { vite, review } = await modules();
  try {
    const focused = [];
    let renderer;
    await act(() => {
      renderer = create(
        React.createElement(review.ReviewQueue, {
          queue: queue(),
          busy: false,
          onCommand() {},
        }),
        {
          createNodeMock(element) {
            const name = React.Children.toArray(element.props.children).join("");
            return { focus: () => focused.push(name) };
          },
        },
      );
    });
    const cards = renderer.root.findAllByType("article");
    assert.equal(cards.length, 2);
    const firstInputs = cards[0].findAllByType("input");
    const secondInputs = cards[1].findAllByType("input");
    await act(() => {
      firstInputs[0].props.onChange({ target: { value: "Reject first only" } });
      secondInputs[0].props.onChange({ target: { value: "Defer second only" } });
      secondInputs[1].props.onChange({ target: { value: "2026-10-15T09:30" } });
    });
    assert.equal(cards[0].findAllByType("input")[0].props.value, "Reject first only");
    assert.equal(cards[0].findAllByType("input")[1].props.value, "");
    assert.equal(cards[1].findAllByType("input")[0].props.value, "Defer second only");
    assert.equal(cards[1].findAllByType("input")[1].props.value, "2026-10-15T09:30");

    await act(() => button(cards[0], "Reject prospect").props.onClick());
    assert.equal(cards[0].findAllByProps({ className: "rejection-confirmation" }).length, 1);
    assert.equal(cards[1].findAllByProps({ className: "rejection-confirmation" }).length, 0);
    assert.equal(focused.at(-1), "Confirm rejection");

    const confirmation = cards[0].findByProps({ className: "rejection-confirmation" });
    await act(() => confirmation.props.onKeyDown({ key: "Escape" }));
    assert.equal(cards[0].findAllByProps({ className: "rejection-confirmation" }).length, 0);
    assert.equal(focused.at(-1), "Reject prospect");
    await act(() => renderer.unmount());
  } finally {
    await vite.close();
  }
});

test("Approve, Reject, and Defer expose action-specific pending state and block competing decisions", async () => {
  const { vite, review } = await modules();
  try {
    for (const scenario of [
      { action: "Approve prospect", pending: "Approval pending", decision: "approve" },
      { action: "Confirm rejection", pending: "Rejection pending", decision: "reject" },
      { action: "Defer prospect", pending: "Deferral pending", decision: "defer" },
    ]) {
      let finish;
      const commands = [];
      const waiting = new Promise((resolve) => {
        finish = resolve;
      });
      let renderer;
      await act(() => {
        renderer = create(
          React.createElement(review.ReviewQueue, {
            queue: queue().slice(0, 1),
            busy: false,
            onCommand(command) {
              commands.push(command);
              return waiting;
            },
          }),
          { createNodeMock: () => ({ focus() {} }) },
        );
      });
      const card = renderer.root.findByType("article");
      const inputs = card.findAllByType("input");
      await act(() => {
        inputs[0].props.onChange({ target: { value: `${scenario.decision} exact prospect` } });
        if (scenario.decision === "defer") {
          inputs[1].props.onChange({ target: { value: "2026-10-15T09:30" } });
        }
      });
      if (scenario.decision === "reject") {
        await act(() => button(card, "Reject prospect").props.onClick());
      }
      act(() => button(card, scenario.action).props.onClick());
      const pendingStatus = renderer.root
        .findAll((node) => node.props.role === "status")
        .find((node) => node.children.join("").includes("pending"));
      assert.equal(pendingStatus?.children.join("").startsWith(scenario.pending), true);
      assert.equal(commands.length, 1);
      assert.equal(commands[0].decision, scenario.decision);
      for (const label of ["Approve prospect", "Reject prospect", "Defer prospect"]) {
        const control = button(card, label, { includeDisabled: true });
        assert.equal(control?.props.disabled, true, `${label} is disabled during ${scenario.decision}`);
      }
      await act(async () => {
        finish();
        await waiting;
      });
      assert.equal(
        renderer.root
          .findAll((node) => node.props.role === "status")
          .some((node) => node.children.join("").startsWith(scenario.pending)),
        false,
      );
      await act(() => renderer.unmount());
    }
  } finally {
    await vite.close();
  }
});

async function modules() {
  const vite = await createServer({
    configFile: false,
    logLevel: "silent",
    plugins: [react()],
    server: { middlewareMode: true },
  });
  const [readiness, review] = await Promise.all([
    vite.ssrLoadModule(
      new URL("../app/prospecting/profile-readiness.tsx", import.meta.url).pathname,
    ),
    vite.ssrLoadModule(
      new URL("../app/prospecting/review-queue.tsx", import.meta.url).pathname,
    ),
  ]);
  return { vite, readiness, review };
}

function staleReadiness() {
  return {
    profile: { id: "profile-1", revision: 4 },
    complete: false,
    missing: ["source_policy"],
    items: [
      { category: "source_policy", status: "stale", versionIds: ["version-old"] },
    ],
    candidate: null,
  };
}

function queue() {
  return [1, 2].map((ordinal) => ({
    id: `prospect-${ordinal}`,
    assessment_id: `assessment-${ordinal}`,
    revision: ordinal,
    offer_id: `offer-${ordinal}`,
    score: 8,
    outcome: "Passed",
    configuration_digest: DIGEST,
    account: { id: `account-${ordinal}`, value: `Account ${ordinal}` },
    target: { id: `target-${ordinal}`, value: `Target ${ordinal}` },
  }));
}

function button(root, label, { includeDisabled = false } = {}) {
  return root
    .findAllByType("button")
    .find(
      (node) =>
        node.children.join("") === label && (includeDisabled || !node.props.disabled),
    );
}
