# Local development

This path is fully local and disposable. It does not use Sites, Cloudflare,
provider credentials, production data, real prospecting, sending, calling, or
paid services.

```sh
npm ci
cp .dev.vars.example .dev.vars # only if .dev.vars is absent
npm run db:local:reset
npm run dev -- --port 8788 --host 127.0.0.1
```

`db:local:reset` recreates the local Miniflare state at
`site/.local/miniflare-state` from migrations 0000–0009 and verifies foreign
keys. The directory is ignored by Git and may be deleted at any time. It never
points at a hosted database.

The browser server uses local Miniflare bindings. The ignored `.dev.vars` file
is the supported local Worker-binding mechanism for the Cloudflare Vite plugin.
For the disposable demo it contains only `LOCAL_DEMO=1`, the fixed
`.invalid` demo owner email, and a local-only pepper. It is never read by a
hosted deployment and must never contain a real owner email, credential, or
hosted secret.

Open `http://localhost:8788/local-demo` (or `http://[::1]:8788/local-demo`
when Vite reports the IPv6 loopback address) and
choose **Initialize local interview**. The browser supplies the HttpOnly
same-origin CSRF cookie itself; the page never reads or forwards it. The demo
identity is admitted only in Vite development on loopback. Cross-origin
mutations and ordinary/hosted paths remain denied.

Run the disposable end-to-end assertion with:

```sh
npm run demo:local:smoke
```

It uses its own ignored `.local/local-demo-smoke-state` database, proves the
loopback page and interview bootstrap, and proves a hostile-origin mutation is
rejected. It starts and stops its own local server and makes no network or
provider request.
