# Pinned Chromium acquisition — Linux x64

The package's `cftUrl` selects only `https://cdn.playwright.dev` for this build.
On 2026-10-28 both regular Chromium and headless-shell CLI downloads exhausted
five attempts: HTTP 200, `text/html`, 195 bytes, title `Site Unavailable`.
This is not a ZIP or evidence that the requested version does not exist.

The same exact headless-shell version is available from Google's official
Chrome for Testing public bucket:

`https://storage.googleapis.com/chrome-for-testing-public/153.0.8010.12/linux64/chrome-headless-shell-linux64.zip`

Observed: HTTP 200, `application/zip`, 119809080 bytes; ZIP CRC validation passed;
SHA-256 `a9da028861a0cf789ff25c2fed45f5f1aaf969ed9247835b6a7821a4f7af9d1d`.
The package expects cache directory `chromium_headless_shell-1243`, containing
`chrome-headless-shell-linux64/chrome-headless-shell`. Its `--version` output
is `Google Chrome for Testing 153.0.8010.12`; Playwright reports
`153.0.8010.12`. This is the pinned artifact, not branded stable Chrome or
an equivalence claim for another build.

Reproduce on Linux x64, with no installer concurrently modifying the cache:

```sh
curl --fail --location --output /tmp/prospector-pinned-shell.zip \
  https://storage.googleapis.com/chrome-for-testing-public/153.0.8010.12/linux64/chrome-headless-shell-linux64.zip
printf '%s  %s\n' a9da028861a0cf789ff25c2fed45f5f1aaf969ed9247835b6a7821a4f7af9d1d /tmp/prospector-pinned-shell.zip | sha256sum --check
unzip -t /tmp/prospector-pinned-shell.zip
# Default Linux cache; honor XDG_CACHE_HOME if configured.
cache_root="${XDG_CACHE_HOME:-$HOME/.cache}/ms-playwright/chromium_headless_shell-1243"
mkdir -p "$cache_root"
unzip -q /tmp/prospector-pinned-shell.zip -d "$cache_root"
touch "$cache_root/INSTALLATION_COMPLETE"
"$cache_root/chrome-headless-shell-linux64/chrome-headless-shell" --version
npm test
```

Do not use `PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST` with this bucket unchanged: the
installer appends `builds/cft/...`, while the official bucket uses a different
path layout. Do not edit installed Playwright or use an executable override.
Do not run another install concurrently: its failed-download cleanup can remove
the cache directory. The initial local attempt encountered that cleanup; after
both installers exited, restoring the validated archive allowed launch.

Sources: [Playwright browser/cache documentation](https://playwright.dev/docs/browsers),
[official Chrome for Testing downloads](https://googlechromelabs.github.io/chrome-for-testing/).
