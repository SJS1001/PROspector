# PROspector private pilot

This is the private, owner-only pilot interface for PROspector: a human-governed
prospecting system that turns confirmed company, product, market, and customer
knowledge into reviewable prospecting work.

The current slice provides the workbench UI, private-hosting identity probe, D1
schema and migrations, and R2 binding proof. It intentionally does not send
email, call external research services, or treat fixture data as live customer
data.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run lint
npm test
npm audit --omit=dev
```

The local site uses simulated D1 and R2 bindings. Hosted capability proof is
available at `/api/capabilities`; owner identity is only expected on the private
Sites deployment.

## Safety boundary

- Do not put API keys, OAuth refresh tokens, raw private imports, or exports in
  this repository.
- Gmail sending remains disabled until controlled-account OAuth, exact-message
  approval, suppression re-check, audit logging, and ambiguous-outcome handling
  are proven together.
- The legacy enrichment utilities are blocked by default and are not part of
  this pilot path.

The product direction, accepted decisions, and implementation gates live in
the repository-level `docs/` directory.
