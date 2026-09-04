# PROspector private pilot

This is the private, owner-only pilot interface for PROspector: a human-governed
prospecting system that turns confirmed company, product, market, and customer
knowledge into reviewable prospecting work.

The current slice provides the workbench UI, private-hosting identity probe, D1
schema and migrations, R2 binding proof, and one narrowly scoped Consensus
Interview decision. The interview deliberately separates answer submission
from owner confirmation and stores a versioned policy plus audit history. That
policy is not yet connected to scoring or prospecting. The site does not send
email, call external research services, or treat fixture leads as live data.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Useful checks:

```bash
npm run lint
npm test
npm audit --omit=dev
```

The local site uses simulated D1 and R2 bindings. Hosted capability proof is
available at `/api/capabilities`. A future direct Cloudflare target must set
`TRUSTED_IDENTITY_PROVIDER=cloudflare-access` plus both
`CLOUDFLARE_ACCESS_ISSUER` and `CLOUDFLARE_ACCESS_AUDIENCE`. Missing, unknown,
partial, or conflicting identity configuration denies access; neither Sites
headers nor `LOCAL_DEMO` can act as a fallback. Do not add the Cloudflare
bindings to the disposable localhost `.dev.vars` file.

The hosted interview requires a secret `OWNER_SUBJECT_PEPPER` binding of at
least 32 characters. It is used to derive a non-enumerable owner subject; it
must never be committed. Rotating it requires an explicit identity migration,
because an uncoordinated rotation would orphan the existing workspace.

## Safety boundary

- Do not put API keys, OAuth refresh tokens, raw private imports, or exports in
  this repository.
- The live decision exception is limited to the low-sensitivity historian
  scoring policy. Real leads, contacts, outreach, schedules, and provider
  credentials remain prohibited.
- Gmail sending remains disabled until controlled-account OAuth, exact-message
  approval, suppression re-check, audit logging, and ambiguous-outcome handling
  are proven together.
- The legacy enrichment utilities are blocked by default and are not part of
  this pilot path.

The product direction, accepted decisions, and implementation gates live in
the repository-level `docs/` directory.
