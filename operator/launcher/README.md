# App launcher

Open **App launcher** from `~/Applications` or click its switch icon in the macOS menu bar.

- **Start PROspector** starts the app and opens it in your browser.
- **Open PROspector** opens the running app.
- **Stop** closes the app safely. **Restart** closes and reopens it.
- **Details** contains the log, backup folder and this guide.
- **Quit launcher** closes the menu icon; it leaves PROspector running.

The menu icon opens at login. PROspector starts only when requested, serves its
frontend and backend together at `http://127.0.0.1:8080`, and uses passwordless
local access. It is not exposed to other computers. Existing connection settings
and company data stay in the private local data directory.

## Install or update

Requires macOS 14+, Node 22.13+ and the Xcode command line tools. From `operator/`:

```sh
npm ci
npm run build
npm run launcher:install
```

Stop PROspector before rebuilding or reinstalling. The installer compiles and
ad-hoc signs the native app, installs it in `~/Applications/App launcher.app`, and
registers two per-user launch agents. It does not require an administrator.
The installation points to this checkout and the Node executable used to install
it. Reinstall after moving the checkout or replacing that executable. App launcher
is the supported native launcher; the older Electron development shell is separate.

## Recovery

If port 8080 is occupied, stop the other instance (for a Terminal launch, press
Control-C in that Terminal), then click Start. App launcher never kills a process
merely because it uses that port. If startup fails, open the log under Details.
Fix the reported problem and click Start again. No automatic restart loop runs.

For an old database lock, follow the stopped-data backup and lock-recovery steps
in `operator/README.md`. The launcher deliberately never removes a database lock
or force-quits the database. If Stop says the app is still closing, wait and retry.

## Backups and restore

Click Stop and wait for **Ready to start**. Copy the entire directory
`~/Library/Application Support/PROspector/operator` into a dated folder under
`~/Library/Application Support/PROspector/backups`. Keep `database/`, `owner.json`
and `operator.vault` together. A backup includes credentials: keep it private and
out of Git. A backup on this Mac protects against accidental changes, not loss of
the Mac; use your private encrypted backup system for that.

To restore, stop the app, keep a copy of the current directory, then replace the
entire `operator` directory with one complete stopped backup. Keep directory/file
permissions at 700/600. Click Start. Do not merge files from different backups.
Workspace JSON exports in Settings are portable business data, not a full backup.

## Remove the login item

This removes only the menu launch agent; the app and your data stay installed:

```sh
launchctl bootout "gui/$(id -u)/com.sjs.prospector.launcher"
rm "$HOME/Library/LaunchAgents/com.sjs.prospector.launcher.plist"
```

For a complete launcher uninstall, click Stop first, then unload
`com.sjs.prospector.local` in the same way, remove its matching plist, and remove
`~/Applications/App launcher.app`. Never remove the data directory as part of
uninstalling the launcher.
