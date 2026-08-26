# Local development

This path is fully local and disposable. It does not use Sites, Cloudflare,
provider credentials, production data, real prospecting, sending, calling, or
paid services.

```sh
npm ci
npm run db:local:reset
npm run dev
```

`db:local:reset` recreates the local Miniflare state at
`site/.local/miniflare-state` from migrations 0000–0009 and verifies foreign
keys. The directory is ignored by Git and may be deleted at any time. It never
points at a hosted database.

The browser server uses local Miniflare bindings. It intentionally stays
unauthorized without the platform identity boundary; owner-authenticated
workflow smoke coverage remains in the synthetic local test harness. Do not
weaken that production identity boundary merely for local convenience.
