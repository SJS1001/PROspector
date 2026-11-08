# Operator review clarity — 2026-11-08

Base: PR #152 head `53ef14a42c52b2c5fb510738c4aedee24c26f8ab`. This branch is `cursor/operator-review-clarity-de84`. Plan credit stays 26/74. The site canonical count of 1077 passes belongs to product commit `c440ac7` and was not rerun here.

## Lockfile

`npm ci` in `operator/` failed on npm 10.9.9 with `Missing: lru-cache@11.5.3 from lock file`. `nitro`'s nested `unstorage@2.0.0-alpha.7` declares optional peer `lru-cache@^11.2.6`. The lock recorded that peer range and the unrelated `lru-cache@5.1.1` used by Babel, but not a resolved 11.5.3 install.

`npm install --package-lock-only --ignore-scripts` in a clean copy of the manifests added only that optional peer (`node_modules/nitro/node_modules/lru-cache@11.5.3`, integrity `sha512-U4N8FgzmWxc8k1VH8Kr6lQg18U7Fjvby6wXHVRX/ZZ7IwWbRMgrRbP0Wrb5q5NVinryp4SQampHKdvtecItxUg==`), npm's bundled `@tailwindcss/oxide-wasm32-wasi` metadata, and a `devOptional` to `dev` flag on `fast-deep-equal@3.1.3`. `package.json` did not change. No override was added.

Clean isolated `npm ci --ignore-scripts` in `/tmp/operator-ci` exited 0 and installed `lru-cache@11.5.3`. A second `npm ci` in `operator/` also exited 0.

## What the browser showed, and what changed

Fresh local operator at `http://127.0.0.1:8080` with `OPERATOR_DATA_DIR=/tmp/prospector-operator-ui` and passwordless local access. Chrome headless via Playwright's system Chrome. No provider or hosted call.

Before the navigation follow-up, locked steps existed only inside collapsed groups, so Prospecting and Outreach looked the same as ready groups, and the question heading took focus with a ring that read as an empty field.

After: the next group (Your business / Company) is open on Today. Fully locked groups show Later on the summary and in the accessible name. The page you are on is not marked Later. The answer field receives focus. Review actions stay disabled until a trimmed reason is present, and Review later also waits for a date.

Rendered checks after the fixes:

- Skip link is the first tab stop and moves focus to `#operator-task`.
- Desktop and 390px menus show Company, and Prospecting / Outreach read "Later".
- Question 1 was answered and confirmed as "Fictional Copper Works" (1 of 16). Question 2 opened with the answer field focused.
- A fictional qualified prospect was inserted only into that disposable local database. Approve, Review later, and Reject started disabled. After the reason, Approve and Reject enabled and Tab landed on the date field. After `2026-11-20`, Review later enabled and the hint cleared. Approve then left the queue empty. No page errors.

Screenshots: `/opt/cursor/artifacts/operator-ui/08-home-next-group-open.png`, `09-mobile-locked-groups.png`, `10-company-answer-focused.png`, `11-review-reason-required.png`, `13-review-actions-ready.png`, `14-review-approved.png`, `15-review-current-not-later.png`.

## Tests and build

- `review-gates.test.ts` and `acceptance/keyboard/component-focus.test.mjs`: 10/10
- `npx tsc --noEmit`: exit 0
- `npm run build`: exit 0

## Socket note

The earlier serial passes of the enrichment, contacts, and partial-replay tests remain nonreproduction. They were not repeated again.

## Still outside this change

Owner, hosted, and provider acceptance. Research-first on a question still needs `XAI_API_KEY` and was not clicked. Live search was not run.
