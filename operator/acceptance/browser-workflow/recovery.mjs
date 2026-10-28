import assert from 'node:assert/strict';
import { createKeyboardJourney } from './usability.mjs';

// Page-level fault injection is local-only; all other requests still pass the
// context fence. No production provider or external endpoint is substituted.
export async function runRecovery({ page, origin, snapshot, evidence }) {
  const keyboard = createKeyboardJourney(page, evidence);
  const button = (name) => page.getByRole('button', { includeHidden: true, name, exact: true });
  const navigate = async (path) => {
    await keyboard.activate(page.locator(`nav[aria-label="Workspace"] a[href="${path}"]`), `recovery navigation ${path}`);
    await page.waitForURL(origin + path);
    const heading = path === '/settings' ? 'Settings' : 'Outreach';
    await page.locator('#operator-task').getByRole('heading', { includeHidden: true, name: heading, exact: true }).waitFor();
    await keyboard.expose(button(path === '/settings' ? 'Download workspace backup' : 'Add suppression'), 'recovery controls');
  };
  const fn = (request, method) => request.method() === method &&
    new URL(request.url()).origin === origin && new URL(request.url()).pathname.startsWith('/_serverFn/');
  evidence.recovery = [];
  await navigate('/settings');
  const before = await snapshot('recovery-before-failed-download');
  let aborted = 0;
  let releaseFailure;
  const failureGate = new Promise((resolve) => { releaseFailure = resolve; });
  const predispatch = async (route) => {
    if (!fn(route.request(), 'POST') || aborted) return route.fallback();
    aborted++;
    await failureGate;
    await route.abort('connectionreset');
  };
  await page.route('**/*', predispatch);
  const failingRequest = page.waitForRequest((request) => fn(request, 'POST'));
  await keyboard.activate(button('Download workspace backup'), 'failed backup download');
  await failingRequest;
  const backupDisclosure = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Backup & restore$/ }) });
  await keyboard.activate(backupDisclosure.locator(':scope > summary'), 'Collapse backup during pending download');
  assert.equal(await backupDisclosure.evaluate((node) => node.open), false);
  releaseFailure();
  await page.getByRole('alert').filter({ hasText: 'connection was interrupted' }).waitFor();
  assert.equal(aborted, 1);
  assert.equal(await backupDisclosure.evaluate((node) => node.open), true, 'Failed action reopens its collapsed disclosure before focusing feedback');
  assert.equal(await page.locator('[role="alert"]').evaluate((node) => node === document.activeElement || node.parentElement === document.activeElement), true);
  await page.unroute('**/*', predispatch);
  assert.deepEqual(await snapshot('recovery-after-failed-download'), before);
  evidence.recovery.push('Pre-dispatch download failure: pending disclosure collapsed then reopened for focused uncertainty message, no data delta, no automatic retry');
  const downloadPending = page.waitForEvent('download');
  await keyboard.activate(button('Download workspace backup'), 'explicit backup download retry');
  const download = await downloadPending;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  let archiveBytes = Buffer.concat(chunks);
  assert.ok(JSON.parse(archiveBytes.toString()).version === 1);

  await navigate('/outreach');
  const form = page.locator('form').filter({ has: button('Add suppression') });
  await keyboard.select(form.getByRole('combobox', { includeHidden: true, name: /^Kind/ }), 'email', 'recovery suppression kind');
  const value = 'recovery@fictionalquarry.example';
  await keyboard.type(form.getByLabel('Email', { exact: true }), value, 'recovery suppression email');
  await keyboard.type(form.getByRole('textbox', { includeHidden: true, name: 'Reason', exact: true }), 'Fictional response-loss recovery check.', 'recovery suppression reason');
  const beforeLoss = await snapshot('recovery-before-lost-response');
  let committed = 0;
  const loseResponse = async (route) => {
    const request = route.request();
    if (!fn(request, 'POST') || !request.postData()?.includes(value) || committed) return route.fallback();
    committed++;
    const response = await route.fetch({ maxRedirects: 0 });
    assert.equal(response.status(), 200, 'Mutation reached real server before its response was lost');
    await route.abort('connectionreset');
  };
  await page.route('**/*', loseResponse);
  await keyboard.activate(button('Add suppression'), 'suppression with lost response');
  await page.getByRole('alert').filter({ hasText: 'may have completed' }).waitFor();
  await page.locator('#operator-task').getByText('Fictional response-loss recovery check.', { exact: true }).waitFor();
  await page.unroute('**/*', loseResponse);
  const afterLoss = await snapshot('recovery-after-lost-response');
  assert.equal(committed, 1, 'No automatic mutation replay');
  assert.equal(afterLoss.counts.suppressions, beforeLoss.counts.suppressions + 1);
  assert.equal(afterLoss.tables.suppressions.filter((row) => row.value === value).length, 1);
  for (const table of Object.keys(beforeLoss.tables).filter((table) => table !== 'suppressions'))
    assert.deepEqual(afterLoss.tables[table], beforeLoss.tables[table], `Lost response changed only suppression: ${table}`);
  evidence.recovery.push('Lost post-commit mutation response: one request, persisted exactly once, authoritative UI refresh, uncertainty message');

  await navigate('/settings');
  let failedLoads = 0;
  const failedLoad = async (route) => {
    if (!fn(route.request(), 'GET')) return route.fallback();
    failedLoads++;
    await route.abort('connectionreset');
  };
  await page.route('**/*', failedLoad);
  await page.reload();
  await page.getByRole('alert').filter({ hasText: 'Connections could not be loaded.' }).waitFor();
  assert.equal(failedLoads, 2, 'One bounded query retry');
  await page.unroute('**/*', failedLoad);
  await keyboard.activate(button('Retry loading workspace'), 'failed workspace load retry');
  await keyboard.expose(button('Download workspace backup'), 'backup after reload');
  await button('Download workspace backup').waitFor();
  assert.deepEqual(await snapshot('recovery-after-load-retry'), afterLoss);
  await keyboard.layout('recovered workspace load');
  evidence.recovery.push('Workspace query failure: bounded read retry, focused error, keyboard retry succeeds without data delta');

  // File bytes are injected through Playwright's file chooser API; subsequent
  // confirmation/cancel/restore actions use keys. Native OS chooser UX excluded.
  const file = page.locator('input[type="file"]');
  await file.setInputFiles({ name: 'fictional-recovery.json', mimeType: 'application/json', buffer: Buffer.alloc(20 * 1024 * 1024 + 1, 32) });
  await page.getByRole('alert').filter({ hasText: 'no larger than 20 MiB' }).waitFor();
  assert.equal(await file.getAttribute('aria-invalid'), 'true');
  const restore = button('Restore selected backup');
  await file.setInputFiles({ name: 'fictional-recovery.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,') });
  await restore.waitFor();
  assert.equal(await restore.isDisabled(), true);
  const ack = page.getByRole('checkbox', { includeHidden: true, name: 'I understand that this replaces my workspace records.' });
  await keyboard.activate(ack, 'invalid backup confirmation', 'Space');
  await keyboard.activate(restore, 'reject truncated backup');
  await page.getByRole('alert').waitFor();
  assert.deepEqual(await snapshot('recovery-after-invalid-archive'), afterLoss);
  assert.equal(await page.getByRole('alert').evaluate((node) => node === document.activeElement || node.parentElement === document.activeElement), true);
  await keyboard.layout('invalid archive feedback');

  // Export current authority, including the newly committed suppression, before
  // restoring. Imported approvals safely reset; terminal handoffs must survive.
  const currentDownload = page.waitForEvent('download');
  await keyboard.activate(button('Download workspace backup'), 'current recovery backup');
  const currentStream = await (await currentDownload).createReadStream();
  const currentChunks = [];
  for await (const chunk of currentStream) currentChunks.push(chunk);
  archiveBytes = Buffer.concat(currentChunks);
  await file.setInputFiles({ name: 'fictional-recovery.json', mimeType: 'application/json', buffer: archiveBytes });
  assert.equal(await ack.isChecked(), false, 'Reselecting same filename clears consent');
  assert.equal(await restore.isDisabled(), true);
  assert.equal(await page.getByRole('alert').count(), 0, 'Reselect clears prior error');
  await keyboard.activate(ack, 'valid backup confirmation', 'Space');
  await keyboard.activate(restore, 'valid backup recovery');
  const success = page.getByRole('status').filter({ hasText: 'Restored. Reload to view your workspace.' });
  await success.waitFor();
  assert.equal(await success.evaluate((node) => node === document.activeElement), true);
  const restored = await snapshot('recovery-after-valid-restore');
  for (const table of ['knowledge_items', 'prospects', 'contacts', 'suppressions'])
    assert.equal(restored.counts[table], afterLoss.counts[table], `Restore inventory: ${table}`);
  const terminal = (rows) => rows.filter((row) => ['handed_off', 'handed_to_gmail', 'sent'].includes(row.status) || row.dispatched_at != null);
  assert.ok(terminal(afterLoss.tables.outreach_messages).length > 0, 'Terminal history assertion is non-vacuous');
  assert.deepEqual(terminal(restored.tables.outreach_messages), terminal(afterLoss.tables.outreach_messages).map((row) => ({ ...row, acknowledged: false })));
  assert.deepEqual(restored.tables.outreach_messages, afterLoss.tables.outreach_messages.map((row) => ({
    ...row, status: ['approved', 'sending'].includes(row.status) ? 'blocked' : row.status, acknowledged: false,
  })));
  assert.deepEqual(restored.tables.outreach_packages, afterLoss.tables.outreach_packages.map((row) => ({
    ...row, status: row.status === 'approved' ? 'draft' : row.status,
  })));
  // Restore preserves every prior delivery event and appends exact prior-authority
  // audit records when it resets package approval or message acknowledgement.
  const oldEvents = afterLoss.tables.delivery_events;
  const oldIds = new Set(oldEvents.map((row) => row.id));
  assert.deepEqual(restored.tables.delivery_events.filter((row) => oldIds.has(row.id)), oldEvents);
  const expectedAudit = [
    ...afterLoss.tables.outreach_packages.filter((row) => row.status === 'approved').map((row) => ({
      kind: 'archive_restore_package', message_id: row.id, history: { status: row.status },
    })),
    ...afterLoss.tables.outreach_messages.filter((row) => ['approved', 'sending'].includes(row.status) || row.acknowledged).map((row) => ({
      kind: 'archive_restore_message', message_id: row.id, history: { status: row.status, acknowledged: row.acknowledged },
    })),
  ];
  const audit = restored.tables.delivery_events.filter((row) => !oldIds.has(row.id));
  const canonicalAudit = (rows) => rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  assert.equal(new Set(audit.map((row) => row.id)).size, expectedAudit.length);
  assert.deepEqual(canonicalAudit(audit.map((row) => ({ kind: row.kind, message_id: row.message_id, history: JSON.parse(row.note) }))), canonicalAudit(expectedAudit));
  assert.equal(restored.counts.delivery_events, oldEvents.length + expectedAudit.length);
  const handoffs = (rows) => rows.filter((row) => row.kind === 'manual_handoff');
  assert.ok(handoffs(afterLoss.tables.delivery_events).length > 0);
  assert.deepEqual(handoffs(restored.tables.delivery_events), handoffs(afterLoss.tables.delivery_events));
  await page.reload();
  await keyboard.expose(button('Download workspace backup'), 'backup after reload');
  await button('Download workspace backup').waitFor();
  assert.deepEqual(await snapshot('recovery-after-restore-reload'), restored);
  evidence.recovery.push('Oversized/truncated archive rejection: unchanged authority; same-file reselection resets consent/error; valid restore focuses success and survives restart/reload');
  evidence.recoveryFileChooser = 'Fictional bytes attached with file-input API; native OS chooser excluded; confirmation/restoration activated by keyboard';
}
