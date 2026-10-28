import assert from "node:assert/strict";

// These helpers inspect DOM state, but every user action is a real key event.
// No locator click/fill/check/selectOption/focus or DOM-dispatched event is used.
export function createKeyboardJourney(page, evidence = {}) {
  const actions = (evidence.keyboardJourney ??= {
    input: "Tab/Shift+Tab, Enter/Space, native select type-ahead and keyboard typing",
    actions: [],
    negativeProbeTabs: "Separate stale/mutation/replay probes may use pointer activation",
  }).actions;
  const active = (locator) => locator.evaluate((node) => node === document.activeElement);
  const settleLayout = () => page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const focused = async (locator, label) => {
    await settleLayout();
    // Native focus scrolling may finish after the key event and resize paint.
    // Observe it; never scroll or focus the element through the test driver.
    await page.waitForFunction((node) => {
      const r = node.getBoundingClientRect();
      return r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1;
    }, await locator.elementHandle(), { timeout: 1500 }).catch(() => {});
    const state = await locator.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        viewport: { width: innerWidth, height: innerHeight, scrollY,
          visualHeight: visualViewport?.height,
          rootHeight: document.documentElement.scrollHeight,
          clientHeight: document.documentElement.clientHeight,
          bodyHeight: document.body.scrollHeight,
          overflow: getComputedStyle(document.documentElement).overflow },
        ancestors: (() => { const result = []; for (let p = node.parentElement; p && result.length < 12; p=p.parentElement) result.push({tag:p.tagName, height:p.clientHeight, scrollHeight:p.scrollHeight, scrollTop:p.scrollTop, overflow:getComputedStyle(p).overflow}); return result; })(),
        active: node === document.activeElement,
        keyboardVisible: node.matches(":focus-visible"),
        indicator: (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
          style.boxShadow !== "none",
        inViewport: rect.left >= -1 && rect.right <= innerWidth + 1 &&
          rect.top >= -1 && rect.bottom <= innerHeight + 1,
        unobscured: Boolean(hit && (hit === node || node.contains(hit))),
      };
    });
    evidence.lastFocusCheck = { label, ...state };
    assert.equal(state.active, true, `${label}: keyboard focus`);
    assert.equal(state.keyboardVisible, true, `${label}: focus-visible state`);
    assert.equal(state.indicator, true, `${label}: visible focus indicator`);
    assert.equal(state.inViewport, true, `${label}: focused control is on screen`);
    assert.equal(state.unobscured, true, `${label}: focus is not hidden by another element`);
    return state;
  };
  // Role locators targeting collapsed content must opt into includeHidden so
  // attached descendants can be inspected before opening their ancestors.
  const expose = async (locator, label = "control") => {
    await locator.waitFor({ state: "attached" });
    const navigation = await locator.evaluate((node) => Boolean(node.closest('nav[aria-label="Workspace"]')));
    if (navigation) {
      const menu = page.locator('button[aria-controls="workspace-navigation"]');
      if (await menu.isVisible() && await menu.getAttribute("aria-expanded") === "false") {
        await activate(menu, "Open workspace menu");
        assert.equal(await menu.getAttribute("aria-expanded"), "true", "Menu reports expanded state");
      }
    }
    // Open outermost first, using native summary keyboard activation. This also
    // covers nested review/evidence disclosures without injecting DOM state.
    for (;;) {
      const isSummary = await locator.evaluate((node) => node.tagName === 'SUMMARY');
      const closed = locator.locator(isSummary
        ? 'xpath=parent::details/ancestor::details[not(@open)]'
        : 'xpath=ancestor::details[not(@open)]').first();
      if (!(await closed.count())) break;
      const summary = closed.locator(":scope > summary");
      const disclosure = await closed.elementHandle();
      await activate(summary, `Open disclosure for ${label}`);
      assert.equal(await disclosure.evaluate((node) => node.open), true, `${label}: disclosure opened with keyboard`);
      await disclosure.dispose();
    }
  };
  const reach = async (locator, label = "control") => {
    await expose(locator, label);
    await locator.waitFor({ state: "visible" });
    assert.equal(await locator.count(), 1, `${label}: unambiguous accessible target`);
    assert.equal(await locator.isEnabled(), true, `${label}: enabled keyboard target`);
    // Walk backwards to navigation efficiently, forwards within the task.
    // The bound detects focus traps and controls absent from the tab order.
    const navigation = await locator.evaluate((node) => Boolean(node.closest('nav[aria-label="Workspace"]')));
    const key = navigation ? "Shift+Tab" : "Tab";
    let tabs = 0;
    // Revisit an already-focused control with keys after viewport sampling.
    // Resizing can move it off-screen without generating a new focus event.
    if (await active(locator)) await page.keyboard.press("Shift+Tab");
    while (!(await active(locator)) && tabs < 240) {
      await page.keyboard.press(key);
      tabs++;
    }
    await focused(locator, label);
    actions.push({ kind: "reach", label, tabs, direction: key });
  };
  const activate = async (locator, label = "control", key = "Enter") => {
    await reach(locator, label);
    assert.ok(["Enter", "Space"].includes(key));
    await page.keyboard.press(key);
    actions.push({ kind: "activate", label, key });
  };
  const type = async (locator, text, label = "field") => {
    await reach(locator, label);
    // Select text with the platform modifier. macOS Home scrolls the page
    // and can leave a pending native scroll that outlives subsequent Tab keys.
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(text);
    assert.equal(await locator.inputValue(), text, `${label}: keyboard text value`);
    actions.push({ kind: "type", label }); // Never retain passwords or field contents.
  };
  const select = async (locator, value, label = "selection") => {
    await reach(locator, label);
    const options = await locator.locator("option").evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, label: node.label })));
    const option = options.find((item) => item.value === value);
    assert.ok(option, `${label}: option exists`);
    assert.equal(options.filter((item) => item.label === option.label).length, 1, `${label}: unique native type-ahead label`);
    // Native type-ahead works in pinned macOS Chromium; Home/arrows do not
    // commit its closed headless select. No selectOption or DOM event injection.
    await page.keyboard.type(option.label);
    await page.keyboard.press("Tab");
    assert.equal(await locator.inputValue(), value, `${label}: native keyboard selection`);
    actions.push({ kind: "select", label });
  };
  const skip = async () => {
    const before = page.url();
    await activate(page.getByRole("link", { name: "Skip to workspace", exact: true }), "skip link");
    assert.equal(await active(page.locator("#operator-task")), true, "Skip link moves focus into workspace");
    assert.equal(page.url(), before, "Skip focus does not create a persistent route hash");
    actions.push({ kind: "skip", label: "workspace focus" });
  };
  const layout = async (checkpoint) => {
    evidence.layout ??= [];
    for (const width of [320, 360, 768]) {
      await page.setViewportSize({ width, height: 800 });
      await settleLayout();
      const measured = await page.evaluate(() => {
        const task = document.querySelector("#operator-task");
        const root = task ?? document.querySelector("main") ?? document.body;
        const controls = [...root.querySelectorAll('button,input,textarea,select,a[href]')]
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width && rect.height;
          });
        const geometry = (node) => {
          const rect = node.getBoundingClientRect();
          return {
            tag: node.tagName.toLowerCase(),
            type: node.getAttribute("type"),
            id: node.id || null,
            left: Math.round(rect.left * 100) / 100,
            right: Math.round(rect.right * 100) / 100,
            width: Math.round(rect.width * 100) / 100,
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            scrollLeft: node.scrollLeft,
          };
        };
        const offendingControls = controls.flatMap((node, index) => {
          const rect = node.getBoundingClientRect();
          if (rect.left >= -1 && rect.right <= innerWidth + 1) return [];
          const ancestors = [];
          for (let parent = node.parentElement; parent && ancestors.length < 3; parent = parent.parentElement)
            ancestors.push(geometry(parent));
          return [{ index, ...geometry(node), ancestors }];
        }).slice(0, 12);
        return {
          width: innerWidth,
          scrollX,
          rootGeometry: geometry(root),
          offendingControls,
          documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
          taskFits: root.scrollWidth <= root.clientWidth + 1,
          controlsFit: controls.every((node) => {
            const rect = node.getBoundingClientRect();
            return rect.left >= -1 && rect.right <= innerWidth + 1;
          }),
          labelledFields: controls.filter((node) => node.matches('input,textarea,select')).every((node) =>
            Boolean(node.labels?.length || node.getAttribute("aria-label") || node.getAttribute("aria-labelledby"))),
          controls: controls.length,
        };
      });
      evidence.layout.push({ checkpoint, ...measured });
      assert.equal(measured.width, width);
      assert.equal(measured.documentFits, true, `${checkpoint}/${width}: document reflow`);
      assert.equal(measured.taskFits, true, `${checkpoint}/${width}: task reflow`);
      assert.equal(measured.controlsFit, true,
        `${checkpoint}/${width}: controls fit horizontally; geometry=${JSON.stringify({
          scrollX: measured.scrollX,
          root: measured.rootGeometry,
          controls: measured.offendingControls,
        })}`);
      assert.equal(measured.labelledFields, true, `${checkpoint}/${width}: fields have labels`);
      assert.ok(measured.controls > 0, `${checkpoint}/${width}: controls were measured`);
    }
    await page.setViewportSize({ width: 360, height: 800 });
    await settleLayout();
  };
  return { reach, activate, type, select, skip, layout, focused, expose };
}
