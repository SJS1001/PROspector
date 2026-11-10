import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

import { countRows, createD1Fixture } from "./helpers/d1.mjs";
import { applyOutreachMigrations, OUTREACH_NOW, OUTREACH_OWNER, seedOutreachAuthority } from "./helpers/outreach-fixture.mjs";

// Lane-local helpers only. tests/helpers/outreach-fixture.mjs is not edited.
const SUPPRESSION = new URL("../domain/suppression.ts", import.meta.url).pathname;
const DOMAIN_SCOPE = new URL("../domain/email-domain-scope.ts", import.meta.url).pathname;
const STOP_RULES = new URL("../domain/outreach-stop-rules.ts", import.meta.url).pathname;
const OUTBOX = new URL("../domain/outbox.ts", import.meta.url).pathname;
const REPOSITORY = new URL("../domain/outreach-repository.ts", import.meta.url).pathname;
const UNSUBSCRIBE_TOKEN = "SyntheticUnsubscribeToken_0123456789abcdefABCDEF";
const LIGHT_WORKSPACE = Object.freeze({ id: "ws-suppression-light", owner: "owner-suppression-light" });
const RESTORE_WORKSPACE = Object.freeze({ id: "ws-suppression-restore", owner: "owner-suppression-restore" });
const FORBIDDEN_STATES = ["dispatching", "sent", "delivery_unknown"];

test("normalization keeps exact email distinct, folds owner-confirmed domains by whole label, and normalizes E.164", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const suppression = await vite.ssrLoadModule(SUPPRESSION);
    assert.equal(suppression.normalizeExactEmail("  Person.Name+Tag@Example.COM "), "person.name+tag@example.com");
    assert.notEqual(suppression.normalizeExactEmail("person.name+tag@example.com"), suppression.normalizeExactEmail("personname@example.com"));
    assert.equal(suppression.normalizeExactEmail("not-an-email"), null);
    assert.equal(suppression.normalizeConfirmedDomain(" ACME.com. "), "acme.com");
    for (const invalid of ["com", "-acme.com", "acme..com", "acme.com/path", "a@acme.com", "", "*.acme.com"]) {
      assert.equal(suppression.normalizeConfirmedDomain(invalid), null, invalid);
    }
    assert.equal(suppression.normalizeE164Phone("+1 (416) 555-0100"), "+14165550100");
    assert.equal(suppression.normalizeE164Phone("416-555-0100"), null, "a phone without a country code is never guessed");
    assert.deepEqual(suppression.emailDomainSuffixes("x@mail.eu.acme.com"), ["mail.eu.acme.com", "eu.acme.com", "acme.com"]);
    assert.equal(suppression.domainBlocksEmail("acme.com", "x@mail.acme.com"), true);
    assert.equal(suppression.domainBlocksEmail("acme.com", "x@acme.com"), true);
    assert.equal(suppression.domainBlocksEmail("acme.com", "x@notacme.com"), false);
    assert.equal(suppression.domainBlocksEmail("acme.com", "x@acme.com.evil.example"), false);
    assert.equal(suppression.domainBlocksEmail("mail.acme.com", "x@acme.com"), false, "a subdomain entry never blocks its parent");
    const exact = await suppression.subjectDigest({ kind: "exact_email", email: "Verified@Example.Invalid" });
    const sameAddress = await suppression.subjectDigest({ kind: "exact_email", email: "verified@example.invalid" });
    const domain = await suppression.subjectDigest({ kind: "confirmed_email_domain", domain: "example.invalid", ownerConfirmed: true });
    assert.equal(exact.digest, sameAddress.digest);
    assert.notEqual(exact.digest, domain.digest, "exact email and domain digests never collide");
    await assert.rejects(suppression.subjectDigest({ kind: "confirmed_email_domain", domain: "example.invalid" }), /owner_confirmation_required/);
    await assert.rejects(suppression.subjectDigest({ kind: "confirmed_email_domain", domain: "example.invalid", ownerConfirmed: "yes" }), /owner_confirmation_required/);
    const token = await suppression.unsubscribeTokenDigest(UNSUBSCRIBE_TOKEN);
    assert.match(token, /^[a-f0-9]{64}$/u);
    assert.notEqual(token, UNSUBSCRIBE_TOKEN);
    await assert.rejects(suppression.unsubscribeTokenDigest("short"), /invalid_unsubscribe_token/);
  } finally {
    await vite.close();
  }
});

test("D-7: the recorded domain scope of a mailbox is every whole-label suffix digest, with the same normalization as the resolver", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const suppression = await vite.ssrLoadModule(SUPPRESSION);
    const domainScope = await vite.ssrLoadModule(DOMAIN_SCOPE);
    // One normalization library: suppression re-exports the leaf helpers.
    assert.equal(suppression.normalizeConfirmedDomain, domainScope.normalizeConfirmedDomain);
    assert.equal(suppression.domainDigest, domainScope.domainDigest);
    const digests = async (...domains) => Promise.all(domains.map((domain) => suppression.domainDigest(domain)));
    for (const [email, domains] of [
      ["x@example.invalid", ["example.invalid"]],
      ["x@mail.example.invalid", ["mail.example.invalid", "example.invalid"]],
      ["X@Mail.Example.Invalid.", ["mail.example.invalid", "example.invalid"]],
      ["x@mail.eu.acme.com", ["mail.eu.acme.com", "eu.acme.com", "acme.com"]],
    ]) {
      assert.deepEqual(await domainScope.emailDomainScopeDigests(email), await digests(...domains), email);
      assert.deepEqual(suppression.emailDomainSuffixes(email), domains, email);
    }
    const scoped = await domainScope.emailDomainScopeDigests("x@example.invalid");
    assert.equal(scoped.includes(await suppression.domainDigest("ample.invalid")), false, "a string suffix is not a whole-label suffix");
    assert.equal(scoped.includes(await suppression.domainDigest("mail.example.invalid")), false, "a child domain never covers its parent");
    // Unresolvable domains record no scope, so the SQL rechecks fail closed.
    for (const email of ["not-an-email", "x@localhost", "x@127.0.0.1", "x@example..invalid", 42]) {
      assert.equal(await domainScope.emailDomainScopeDigests(email), null, String(email));
    }
  } finally {
    await vite.close();
  }
});

test("every suppression scope persists and blocks only its matching channels", async () => {
  const fixture = await createLightFixture("suppression-scopes");
  try {
    const { suppression, stopRules } = await loadLight(fixture, LIGHT_WORKSPACE);
    const resolver = suppression.createSuppressionResolver(fixture.database, lightScope(LIGHT_WORKSPACE));
    const record = (subject, channel, reason, key) => stopRules.recordSuppressionStop({
      subject, channel, reason, sourceEventDigest: digestOf(key), aliasDigests: [], effectiveAt: OUTREACH_NOW, idempotencyKey: key,
    });

    for (const [subject, channel, reason, key] of [
      [{ kind: "exact_email", email: "B.C+Tag@Gmail.Example" }, "email", "owner_request", "scope-exact"],
      [{ kind: "confirmed_email_domain", domain: "acme.com", ownerConfirmed: true }, "email", "owner_request", "scope-domain"],
      [{ kind: "e164_phone", phone: "+1 (416) 555-0100" }, "phone", "do_not_call", "scope-phone"],
      [{ kind: "contact", identityDigest: "1".repeat(64) }, "all", "owner_request", "scope-contact"],
      [{ kind: "organization", identityDigest: "2".repeat(64) }, "email", "owner_request", "scope-organization"],
    ]) {
      const result = await record(subject, channel, reason, key);
      assert.equal(result.kind, "suppressed", key);
      assert.equal(result.providerCalls, 0, key);
      assert.match(result.tombstoneId, /^ost_/u, key);
    }
    assert.equal(await countRows(fixture.database, "outreach_suppression_tombstones"), 5);
    assert.equal(await countRows(fixture.database, "outreach_stop_events"), 5);
    assert.equal(await countRows(fixture.database, "outreach_audit_records"), 5);

    const blocked = (input) => resolver.isBlocked(input).then((result) => result.blocked);
    assert.equal(await blocked({ channel: "email", email: "b.c+tag@gmail.example" }), true);
    assert.equal(await blocked({ channel: "email", email: "bc@gmail.example" }), false, "no dot/plus folklore");
    assert.equal(await blocked({ channel: "email", email: "b.c@gmail.example" }), false, "no plus-tag folklore");
    assert.equal(await blocked({ channel: "email", email: "other@gmail.example" }), false, "exact email never widens to its domain");
    assert.equal(await blocked({ channel: "email", email: "x@acme.com" }), true);
    assert.equal(await blocked({ channel: "email", email: "x@mail.acme.com" }), true, "owner-confirmed domain blocks subdomains");
    assert.equal(await blocked({ channel: "email", email: "x@notacme.com" }), false, "whole-label match only");
    assert.equal(await blocked({ channel: "email", email: "x@acme.com.evil.example" }), false);
    assert.equal(await blocked({ channel: "phone", phone: "+14165550100" }), true);
    assert.equal(await blocked({ channel: "phone", phone: "+14165550101" }), false);
    assert.equal(await blocked({ channel: "email", email: "fresh@example.invalid", phone: "+14165550100" }), false, "a phone suppression does not block email");
    assert.equal(await blocked({ channel: "email", email: "fresh@example.invalid", contact: { identityDigest: "1".repeat(64), aliasDigests: [] } }), true);
    assert.equal(await blocked({ channel: "phone", phone: "+14165550199", contact: { identityDigest: "1".repeat(64), aliasDigests: [] } }), true);
    assert.equal(await blocked({ channel: "email", email: "fresh@example.invalid", organization: { identityDigest: "2".repeat(64), aliasDigests: [] } }), true);
    assert.equal(await blocked({ channel: "phone", phone: "+14165550199", organization: { identityDigest: "2".repeat(64), aliasDigests: [] } }), false);
    assert.equal(await blocked({ channel: "email", email: "unparseable" }), true, "an unresolvable subject fails closed");

    const unconfirmed = await stopRules.recordSuppressionStop({
      subject: { kind: "confirmed_email_domain", domain: "unconfirmed.example" }, channel: "email", reason: "owner_request",
      sourceEventDigest: digestOf("unconfirmed"), aliasDigests: [], effectiveAt: OUTREACH_NOW, idempotencyKey: "scope-unconfirmed",
    });
    assert.deepEqual(unconfirmed, { kind: "refused", reason: "invalid_request", providerCalls: 0 });
    const replay = await record({ kind: "exact_email", email: "b.c+tag@gmail.example" }, "email", "owner_request", "scope-exact");
    assert.equal(replay.kind, "suppressed");
    assert.equal(replay.replayed, true);
    assert.equal(await countRows(fixture.database, "outreach_suppression_tombstones"), 5);

    await insertWorkspace(fixture, RESTORE_WORKSPACE);
    const other = await loadLight(fixture, RESTORE_WORKSPACE);
    const otherResolver = suppression.createSuppressionResolver(fixture.database, lightScope(RESTORE_WORKSPACE));
    assert.equal((await otherResolver.isBlocked({ channel: "email", email: "x@acme.com" })).blocked, false, "suppression is workspace scoped");
    assert.equal((await other.stopRules.recordSuppressionStop({
      subject: { kind: "company", workspaceId: RESTORE_WORKSPACE.id }, channel: "all", reason: "owner_request",
      sourceEventDigest: digestOf("company"), aliasDigests: [], effectiveAt: OUTREACH_NOW, idempotencyKey: "scope-company",
    })).kind, "suppressed");
    assert.equal((await otherResolver.isBlocked({ channel: "email", email: "anyone@anywhere.example" })).blocked, true, "all-Company scope blocks every subject");
    assert.equal((await otherResolver.isBlocked({ channel: "phone", phone: "+14165550123" })).blocked, true);
  } finally {
    await fixture.dispose();
  }
});

test("blockingScopes reports every scope that blocks a subject and always agrees with isBlocked", async () => {
  const fixture = await createLightFixture("suppression-blocking-scopes");
  try {
    const { suppression, stopRules } = await loadLight(fixture, LIGHT_WORKSPACE);
    const resolver = suppression.createSuppressionResolver(fixture.database, lightScope(LIGHT_WORKSPACE));
    const record = (subject, channel, key) => stopRules.recordSuppressionStop({
      subject, channel, reason: channel === "phone" ? "do_not_call" : "owner_request", sourceEventDigest: digestOf(key), aliasDigests: [], effectiveAt: OUTREACH_NOW, idempotencyKey: key,
    });
    for (const [subject, channel, key] of [
      [{ kind: "exact_email", email: "blocked.exact@scope.example" }, "email", "bs-exact"],
      [{ kind: "confirmed_email_domain", domain: "blocked-domain.example", ownerConfirmed: true }, "email", "bs-domain"],
      [{ kind: "e164_phone", phone: "+14165550100" }, "phone", "bs-phone"],
      [{ kind: "contact", identityDigest: "1".repeat(64) }, "all", "bs-contact"],
      [{ kind: "organization", identityDigest: "2".repeat(64) }, "email", "bs-organization"],
    ]) assert.equal((await record(subject, channel, key)).kind, "suppressed", key);

    const contact = { identityDigest: "1".repeat(64), aliasDigests: [] };
    const organization = { identityDigest: "2".repeat(64), aliasDigests: [] };
    const cases = [
      [{ channel: "email", email: "fresh@scope.example" }, []],
      [{ channel: "email", email: "blocked.exact@scope.example" }, ["exact_email"]],
      [{ channel: "email", email: "anyone@blocked-domain.example" }, ["confirmed_email_domain"]],
      [{ channel: "email", email: "anyone@mail.blocked-domain.example" }, ["confirmed_email_domain"]],
      [{ channel: "email", email: "fresh@scope.example", contact }, ["contact"]],
      [{ channel: "email", email: "fresh@scope.example", organization }, ["organization"]],
      [{ channel: "phone", phone: "+14165550199", organization }, []],
      [{ channel: "phone", phone: "+1 416 555 0100" }, ["e164_phone"]],
      [{ channel: "phone", phone: "+14165550100", contact }, ["contact", "e164_phone"]],
      [{ channel: "email", email: "blocked.exact@scope.example", contact, organization }, ["organization", "contact", "exact_email"]],
    ];
    for (const [input, scopes] of cases) {
      const result = await resolver.blockingScopes(input);
      assert.deepEqual(result, { blocked: scopes.length > 0, scopes, complete: true, providerCalls: 0 }, JSON.stringify(input));
      assert.equal(Object.isFrozen(result) && Object.isFrozen(result.scopes), true);
      assert.equal(result.blocked, (await resolver.isBlocked(input)).blocked, `agrees with isBlocked: ${JSON.stringify(input)}`);
    }

    // An unresolvable subject fails closed exactly like isBlocked, with no scope claimed.
    for (const input of [{ channel: "email", email: "unparseable" }, { channel: "fax" }, { channel: "email", extra: 1 }, null]) {
      assert.deepEqual(await resolver.blockingScopes(input), { blocked: true, scopes: [], complete: false, providerCalls: 0 });
      assert.equal((await resolver.isBlocked(input)).blocked, true);
    }

    // A company tombstone is reported alongside every narrower scope, so the narrower labels stay derivable.
    assert.equal((await stopRules.recordSuppressionStop({
      subject: { kind: "company", workspaceId: LIGHT_WORKSPACE.id }, channel: "phone", reason: "do_not_call",
      sourceEventDigest: digestOf("bs-company"), aliasDigests: [], effectiveAt: OUTREACH_NOW, idempotencyKey: "bs-company",
    })).kind, "suppressed");
    assert.deepEqual((await resolver.blockingScopes({ channel: "phone", phone: "+14165550100", contact })).scopes, ["company", "contact", "e164_phone"]);
    assert.deepEqual((await resolver.blockingScopes({ channel: "phone", phone: "+14165550123" })).scopes, ["company"]);
    assert.deepEqual((await resolver.blockingScopes({ channel: "email", email: "fresh@scope.example" })).scopes, [], "a phone-channel company tombstone does not block email");
    assert.equal((await resolver.isBlocked({ channel: "email", email: "fresh@scope.example" })).blocked, false);
  } finally {
    await fixture.dispose();
  }
});

test("blockingScopes fails closed on a lookup failure and keeps the scopes it did resolve", async () => {
  const fixture = await createLightFixture("suppression-blocking-scopes-failure");
  try {
    const { suppression, stopRules } = await loadLight(fixture, LIGHT_WORKSPACE);
    assert.equal((await stopRules.recordSuppressionStop({
      subject: { kind: "contact", identityDigest: "1".repeat(64) }, channel: "all", reason: "owner_request",
      sourceEventDigest: digestOf("bsf-contact"), aliasDigests: [], effectiveAt: OUTREACH_NOW, idempotencyKey: "bsf-contact",
    })).kind, "suppressed");
    const broken = suppression.createSuppressionResolver(failingDatabase(fixture.database, () => true), lightScope(LIGHT_WORKSPACE));
    assert.deepEqual(await broken.blockingScopes({ channel: "email", email: "fresh@scope.example" }), { blocked: true, scopes: [], complete: false, providerCalls: 0 });
    assert.equal((await broken.isBlocked({ channel: "email", email: "fresh@scope.example" })).blocked, true);
    // Only the exact-email lookup fails: the contact scope is still reported, and the result is incomplete.
    let lookups = 0;
    const partial = suppression.createSuppressionResolver(failingDatabase(fixture.database, (sql) => sql.includes("WITH RECURSIVE") && ++lookups === 3), lightScope(LIGHT_WORKSPACE));
    assert.deepEqual(
      await partial.blockingScopes({ channel: "email", email: "fresh@scope.example", contact: { identityDigest: "1".repeat(64), aliasDigests: [] } }),
      { blocked: true, scopes: ["contact"], complete: false, providerCalls: 0 },
    );
  } finally {
    await fixture.dispose();
  }
});

test("a trailing dot on a mailbox or confirmed domain never escapes an exact or domain block", async () => {
  const fixture = await createLightFixture("suppression-trailing-dot");
  try {
    const { suppression, stopRules } = await loadLight(fixture, LIGHT_WORKSPACE);
    assert.equal(suppression.normalizeConfirmedDomain("Example.COM."), "example.com");
    assert.equal(suppression.normalizeConfirmedDomain("example.com.."), null, "only one root dot is accepted");
    assert.deepEqual(suppression.emailDomainSuffixes("x@Mail.Example.com."), ["mail.example.com", "example.com"]);
    assert.equal(suppression.domainBlocksEmail("example.com.", "x@mail.example.com"), true);
    assert.equal(suppression.domainBlocksEmail("example.com", "x@mail.example.com."), true);
    assert.equal(suppression.canonicalMailbox("X@Example.com."), "x@example.com");
    assert.equal(suppression.canonicalMailbox("x@example.com"), "x@example.com");
    assert.equal(suppression.canonicalMailbox("not-an-email"), null);

    const resolver = suppression.createSuppressionResolver(fixture.database, lightScope(LIGHT_WORKSPACE));
    const record = (subject, key) => stopRules.recordSuppressionStop({
      subject, channel: "email", reason: "owner_request", sourceEventDigest: digestOf(key), aliasDigests: [], effectiveAt: OUTREACH_NOW, idempotencyKey: key,
    });
    assert.equal((await record({ kind: "confirmed_email_domain", domain: "dotted-domain.example.", ownerConfirmed: true }, "dot-domain")).kind, "suppressed");
    assert.equal((await record({ kind: "exact_email", email: "plain@exact.example" }, "dot-exact-plain")).kind, "suppressed");
    assert.equal((await record({ kind: "exact_email", email: "dotted@exact.example." }, "dot-exact-dotted")).kind, "suppressed");

    const blocked = async (email) => {
      const scoped = await resolver.blockingScopes({ channel: "email", email });
      assert.equal(scoped.blocked, (await resolver.isBlocked({ channel: "email", email })).blocked, email);
      return scoped;
    };
    for (const email of ["x@dotted-domain.example", "x@dotted-domain.example.", "x@sub.dotted-domain.example.", "X@DOTTED-DOMAIN.EXAMPLE."]) {
      assert.deepEqual((await blocked(email)).scopes, ["confirmed_email_domain"], email);
    }
    for (const email of ["plain@exact.example.", "PLAIN@exact.example.", "dotted@exact.example", "dotted@exact.example."]) {
      assert.deepEqual((await blocked(email)).scopes, ["exact_email"], email);
    }
    assert.equal((await blocked("other@exact.example.")).blocked, false, "a trailing dot never widens an exact block");

    // The D1 SQL rechecks (outbox enqueue/lease, the 0010 and 0015-0017
    // triggers, the eligibility snapshot) never call the resolver: they match
    // one contact-point digest against the tombstone digest or its alias
    // snapshot. Every mailbox spelling must therefore be in the tombstone row.
    const sqlMatches = async (email) => {
      const point = await suppression.emailDigest(email);
      const rows = (await fixture.database.prepare(
        `SELECT id FROM outreach_suppression_tombstones WHERE workspace_id=? AND subject_kind='exact_email' AND (
           subject_digest=? OR EXISTS (SELECT 1 FROM json_each(alias_snapshot_json) alias WHERE alias.value=?))`,
      ).bind(LIGHT_WORKSPACE.id, point, point).all()).results;
      return rows.length;
    };
    for (const email of ["plain@exact.example", "plain@exact.example.", "dotted@exact.example", "dotted@exact.example."]) {
      assert.equal(await sqlMatches(email), 1, `the SQL recheck shape matches ${email}`);
    }
    assert.equal(await sqlMatches("other@exact.example."), 0, "the alias spellings never widen an exact block");
    const callerAlias = digestOf("caller-supplied-alias");
    assert.equal((await stopRules.recordSuppressionStop({
      subject: { kind: "exact_email", email: "aliased@exact.example" }, channel: "email", reason: "owner_request", sourceEventDigest: digestOf("dot-aliased"),
      aliasDigests: [callerAlias], effectiveAt: OUTREACH_NOW, idempotencyKey: "dot-exact-aliased",
    })).kind, "suppressed");
    const aliased = await fixture.database.prepare(
      "SELECT subject_digest,alias_snapshot_json FROM outreach_suppression_tombstones WHERE workspace_id=? AND subject_digest=?",
    ).bind(LIGHT_WORKSPACE.id, await suppression.emailDigest("aliased@exact.example")).first();
    assert.deepEqual(JSON.parse(aliased.alias_snapshot_json), [callerAlias, await suppression.emailDigest("aliased@exact.example.")].sort(), "caller aliases are kept and the root-dot spelling is added");
    assert.equal((await blocked("x@dotted-domain.example..")).blocked, true, "a malformed root fails closed");
    assert.equal((await blocked("x@dotted-domain.example..")).complete, false);
  } finally {
    await fixture.dispose();
  }
});

test("lineage across merge, split, delete, import, export and restore keeps every suppression reach", async () => {
  const fixture = await createLightFixture("suppression-lineage");
  try {
    const { suppression, stopRules } = await loadLight(fixture, LIGHT_WORKSPACE);
    const resolver = suppression.createSuppressionResolver(fixture.database, lightScope(LIGHT_WORKSPACE));
    const contactA = "a".repeat(64);
    const contactB = "b".repeat(64);
    const parent = "c".repeat(64);
    await stopRules.recordSuppressionStop({
      subject: { kind: "contact", identityDigest: contactB }, channel: "all", reason: "owner_request",
      sourceEventDigest: digestOf("lineage-b"), aliasDigests: [], effectiveAt: OUTREACH_NOW, idempotencyKey: "lineage-contact-b",
    });
    await stopRules.recordSuppressionStop({
      subject: { kind: "contact", identityDigest: parent }, channel: "email", reason: "explicit_opt_out",
      sourceEventDigest: digestOf("lineage-parent"), aliasDigests: [], effectiveAt: OUTREACH_NOW, idempotencyKey: "lineage-parent",
    });
    await stopRules.recordSuppressionStop({
      subject: { kind: "exact_email", email: "deleted.person@example.invalid" }, channel: "email", reason: "unsubscribe",
      sourceEventDigest: digestOf("lineage-email"), aliasDigests: [], effectiveAt: OUTREACH_NOW, idempotencyKey: "lineage-email",
    });

    // Merge: B merged into A. A's lineage carries B, so B's suppression reaches A.
    const merged = suppression.mergeLineage([
      { identityDigest: contactA, aliasDigests: [] },
      { identityDigest: contactB, aliasDigests: [] },
    ], contactA);
    assert.deepEqual(merged, { identityDigest: contactA, aliasDigests: [contactB] });
    assert.equal((await resolver.isBlocked({ channel: "email", email: "a@example.invalid", contact: { identityDigest: contactA, aliasDigests: [] } })).blocked, false);
    assert.equal((await resolver.isBlocked({ channel: "email", email: "a@example.invalid", contact: merged })).blocked, true);

    // Split: both children inherit the parent's full lineage.
    const children = suppression.splitLineage({ identityDigest: parent, aliasDigests: [] }, ["d".repeat(64), "e".repeat(64)]);
    assert.equal(children.length, 2);
    for (const child of children) {
      assert.deepEqual(child.aliasDigests, [parent]);
      assert.equal((await resolver.isBlocked({ channel: "email", email: "split@example.invalid", contact: child })).blocked, true);
    }

    // Delete: the tombstone survives and blocks rediscovery under a new Contact.
    await assert.rejects(fixture.database.prepare("DELETE FROM outreach_suppression_tombstones").run(), /immutable outreach suppression/);
    await assert.rejects(fixture.database.prepare("UPDATE outreach_suppression_tombstones SET channel='phone'").run(), /immutable outreach suppression/);
    assert.equal((await resolver.isBlocked({ channel: "email", email: "Deleted.Person@example.invalid", contact: { identityDigest: "f".repeat(64), aliasDigests: [] } })).blocked, true);

    // Import: screening flags suppressed rows and never clears a tombstone.
    const screened = await resolver.screenImport([
      { email: "deleted.person@example.invalid" },
      { email: "new.person@example.invalid" },
      { email: "anyone@example.invalid", contact: merged },
    ]);
    assert.deepEqual(screened.map((row) => row.blocked), [true, false, true]);
    assert.equal(await countRows(fixture.database, "outreach_suppression_tombstones"), 3);

    // Export carries digests only and restores byte-identical tombstones elsewhere.
    const ledger = await resolver.exportLedger();
    assert.equal(ledger.entries.length, 3);
    assert.doesNotMatch(JSON.stringify(ledger), /@|example\.invalid/u, "export holds no raw contact data");
    await insertWorkspace(fixture, RESTORE_WORKSPACE);
    const target = suppression.createSuppressionResolver(fixture.database, lightScope(RESTORE_WORKSPACE));
    assert.equal((await target.isBlocked({ channel: "email", email: "deleted.person@example.invalid" })).blocked, false);
    const restored = await target.restoreLedger(ledger);
    assert.deepEqual({ kind: restored.kind, written: restored.written, alreadyPresent: restored.alreadyPresent }, { kind: "restored", written: 3, alreadyPresent: 0 });
    const replay = await target.restoreLedger(ledger);
    assert.deepEqual({ kind: replay.kind, written: replay.written, alreadyPresent: replay.alreadyPresent }, { kind: "restored", written: 0, alreadyPresent: 3 });
    const targetDigests = (await target.exportLedger()).entries.map((entry) => entry.tombstoneDigest).sort();
    assert.deepEqual(targetDigests, ledger.entries.map((entry) => entry.tombstoneDigest).sort());
    assert.equal((await target.isBlocked({ channel: "email", email: "deleted.person@example.invalid" })).blocked, true);
    assert.equal((await target.isBlocked({ channel: "email", email: "a@example.invalid", contact: merged })).blocked, true);

    // A partial ledger never removes anything; a tampered ledger writes nothing.
    const partial = await target.restoreLedger({ ...ledger, entries: ledger.entries.slice(0, 1), ledgerDigest: undefined });
    assert.equal(partial.kind, "refused");
    const tampered = structuredClone(ledger);
    tampered.entries[0].channel = "phone";
    assert.deepEqual(await target.restoreLedger(tampered), { kind: "refused", reason: "ledger_integrity", providerCalls: 0 });
    assert.equal(await countRowsFor(fixture, "outreach_suppression_tombstones", RESTORE_WORKSPACE.id), 3);
  } finally {
    await fixture.dispose();
  }
});

test("suppression is append-only and has no temporary exception or deletion path", async () => {
  const fixture = await createLightFixture("suppression-append-only");
  try {
    const { suppression, stopRules } = await loadLight(fixture, LIGHT_WORKSPACE);
    const resolver = suppression.createSuppressionResolver(fixture.database, lightScope(LIGHT_WORKSPACE));
    assert.deepEqual(Object.keys(stopRules).sort(), ["applyInboundStop", "applyLifecycleStop", "recordSuppressionStop"]);
    assert.deepEqual(Object.keys(resolver).sort(), ["blockingScopes", "exportLedger", "isBlocked", "restoreLedger", "screenImport"]);
    for (const extra of [{ exceptionUntil: OUTREACH_NOW + 1 }, { temporary: true }, { expiresAt: OUTREACH_NOW + 1 }]) {
      const result = await stopRules.recordSuppressionStop({
        subject: { kind: "exact_email", email: "x@example.invalid" }, channel: "email", reason: "owner_request",
        sourceEventDigest: digestOf("exception"), aliasDigests: [], effectiveAt: OUTREACH_NOW, idempotencyKey: "append-only-exception", ...extra,
      });
      assert.deepEqual(result, { kind: "refused", reason: "invalid_request", providerCalls: 0 });
    }
    for (const reason of ["unsubscribe_reversed", "exception", "temporary"]) {
      const result = await stopRules.recordSuppressionStop({
        subject: { kind: "exact_email", email: "x@example.invalid" }, channel: "email", reason,
        sourceEventDigest: digestOf(reason), aliasDigests: [], effectiveAt: OUTREACH_NOW, idempotencyKey: `append-only-${reason}`,
      });
      assert.equal(result.kind, "refused", reason);
    }
    const foreign = await (await loadLight(fixture, { id: LIGHT_WORKSPACE.id, owner: "not-the-owner" })).stopRules.recordSuppressionStop({
      subject: { kind: "exact_email", email: "x@example.invalid" }, channel: "email", reason: "owner_request",
      sourceEventDigest: digestOf("foreign"), aliasDigests: [], effectiveAt: OUTREACH_NOW, idempotencyKey: "append-only-foreign",
    });
    assert.deepEqual(foreign, { kind: "refused", reason: "current_authority_unavailable", providerCalls: 0 });
    assert.equal(await countRows(fixture.database, "outreach_suppression_tombstones"), 0);
    assert.equal(await countRows(fixture.database, "outreach_commands"), 0);
  } finally {
    await fixture.dispose();
  }
});

test("owner suppression after enqueue writes the tombstone and cancels pending work in one batch", async () => {
  const fixture = await createD1Fixture("suppression-pending-cancel");
  try {
    const context = await prepareQueued(fixture);
    const recorder = recordingDatabase(fixture.database);
    const stopRulesModule = await fixture.vite.ssrLoadModule(STOP_RULES);
    const stopRules = stopRulesModule.createOutreachStopRules(recorder.database, { ...scope(context.seeded), now: () => OUTREACH_NOW + 10 });
    const result = await stopRules.recordSuppressionStop({
      subject: { kind: "exact_email", email: "verified@example.invalid" }, channel: "email", reason: "owner_request",
      sourceEventDigest: digestOf("owner-pending"), aliasDigests: [], effectiveAt: OUTREACH_NOW + 10, idempotencyKey: "pending-owner-suppression",
    });
    assert.equal(result.kind, "suppressed");
    assert.deepEqual(result.cancelledOutboxItemIds, [context.queued.outboxItemId]);
    assert.equal(result.providerCalls, 0);
    assert.equal(recorder.batches.length, 1, "tombstone and cancellation commit in exactly one batch");
    const order = recorder.batches[0];
    const tombstoneAt = order.findIndex((sql) => /INSERT INTO outreach_suppression_tombstones/u.test(sql));
    const cancelAt = order.findIndex((sql) => /INSERT INTO outreach_outbox_events/u.test(sql));
    assert.ok(tombstoneAt >= 0 && cancelAt > tombstoneAt, "tombstone precedes cancellation inside the batch");
    assert.deepEqual(await latestEvent(fixture, context.queued.outboxItemId), { revision: 2, state: "cancelled", reason_code: "suppression_owner_request" });

    const replay = await stopRules.recordSuppressionStop({
      subject: { kind: "exact_email", email: "verified@example.invalid" }, channel: "email", reason: "owner_request",
      sourceEventDigest: digestOf("owner-pending"), aliasDigests: [], effectiveAt: OUTREACH_NOW + 10, idempotencyKey: "pending-owner-suppression",
    });
    assert.equal(replay.kind, "suppressed");
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.cancelledOutboxItemIds, []);
    assert.equal(await countRows(fixture.database, "outreach_suppression_tombstones"), 1);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 2);

    const outbox = (await fixture.vite.ssrLoadModule(OUTBOX)).createD1OutboxRepository(fixture.database, { ...scope(context.seeded), now: () => OUTREACH_NOW + 1_000 });
    assert.equal((await outbox.claimDispatchLease({ outboxItemId: context.queued.outboxItemId, holderId: "synthetic-worker-one" })).kind, "blocked");
    await assertNoForbiddenStates(fixture);
  } finally {
    await fixture.dispose();
  }
});

test("suppression after a lease cancels the leased item before any provider decision point", async () => {
  const fixture = await createD1Fixture("suppression-leased-cancel");
  try {
    const context = await prepareQueued(fixture, { leased: true });
    const stopRules = (await fixture.vite.ssrLoadModule(STOP_RULES)).createOutreachStopRules(fixture.database, { ...scope(context.seeded), now: () => OUTREACH_NOW + 2_000 });
    const result = await stopRules.recordSuppressionStop({
      subject: { kind: "contact", identityDigest: "6".repeat(64) }, channel: "all", reason: "owner_request",
      sourceEventDigest: digestOf("owner-leased"), aliasDigests: [], effectiveAt: OUTREACH_NOW + 2_000, idempotencyKey: "leased-owner-suppression",
    });
    assert.equal(result.kind, "suppressed");
    assert.deepEqual(result.cancelledOutboxItemIds, [context.queued.outboxItemId]);
    const latest = await fixture.database.prepare(
      "SELECT revision,state,lease_generation,lease_holder_id FROM outreach_outbox_events WHERE outbox_item_id=? ORDER BY revision DESC LIMIT 1",
    ).bind(context.queued.outboxItemId).first();
    assert.deepEqual(latest, { revision: 3, state: "cancelled", lease_generation: 1, lease_holder_id: "synthetic-worker-one" });
    const outbox = (await fixture.vite.ssrLoadModule(OUTBOX)).createD1OutboxRepository(fixture.database, { ...scope(context.seeded), now: () => OUTREACH_NOW + 2_001 });
    const receipt = await outbox.recordPreCallRecheckReceipt({ outboxItemId: context.queued.outboxItemId, holderId: "synthetic-worker-one", leaseGeneration: 1 });
    assert.equal(receipt.kind, "blocked");
    assert.equal(receipt.providerCalls, 0);
    await assertNoForbiddenStates(fixture);
  } finally {
    await fixture.dispose();
  }
});

test("an expired lease is reported, not cancelled, and still cannot be reclaimed while suppressed", async () => {
  const fixture = await createD1Fixture("suppression-expired-lease");
  try {
    const context = await prepareQueued(fixture, { leased: true });
    const late = OUTREACH_NOW + 30_000;
    const stopRules = (await fixture.vite.ssrLoadModule(STOP_RULES)).createOutreachStopRules(fixture.database, { ...scope(context.seeded), now: () => late });
    const result = await stopRules.recordSuppressionStop({
      subject: { kind: "exact_email", email: "verified@example.invalid" }, channel: "email", reason: "owner_request",
      sourceEventDigest: digestOf("expired"), aliasDigests: [], effectiveAt: late, idempotencyKey: "expired-lease-suppression",
    });
    assert.equal(result.kind, "suppressed");
    assert.deepEqual(result.cancelledOutboxItemIds, []);
    assert.deepEqual(result.uncancelled, [{ outboxItemId: context.queued.outboxItemId, reason: "lease_expired" }]);
    assert.equal(await countRows(fixture.database, "outreach_suppression_tombstones"), 1, "the tombstone never waits on cancellation");
    const outbox = (await fixture.vite.ssrLoadModule(OUTBOX)).createD1OutboxRepository(fixture.database, { ...scope(context.seeded), now: () => late + 1 });
    assert.equal((await outbox.claimDispatchLease({ outboxItemId: context.queued.outboxItemId, holderId: "synthetic-worker-two" })).kind, "blocked");
    await assertNoForbiddenStates(fixture);
  } finally {
    await fixture.dispose();
  }
});

test("domain suppression cancels exactly the live email items the whole-label D1 rechecks block", async () => {
  // D-7 (owner-delegated 2026-11-10): migration 0024 narrows enqueue, lease and
  // the 0010 and 0015-0017 triggers to whole-label domain matching, so
  // cancellation narrows with them. A non-matching domain neither cancels nor
  // blocks; a matching one cancels, so nothing is stranded pending.
  const fixture = await createD1Fixture("suppression-domain-cancel");
  try {
    const context = await prepareQueued(fixture);
    const stopRulesModule = await fixture.vite.ssrLoadModule(STOP_RULES);
    const domain = (value, key, at) => stopRulesModule.createOutreachStopRules(fixture.database, { ...scope(context.seeded), now: () => at }).recordSuppressionStop({
      subject: { kind: "confirmed_email_domain", domain: value, ownerConfirmed: true }, channel: "email", reason: "owner_request",
      sourceEventDigest: digestOf(key), aliasDigests: [], effectiveAt: at, idempotencyKey: key,
    });
    const partial = await domain("ample.invalid", "domain-partial", OUTREACH_NOW + 10);
    assert.equal(partial.kind, "suppressed");
    assert.deepEqual(partial.cancelledOutboxItemIds, [], "ample.invalid is not a whole-label suffix of example.invalid");
    assert.deepEqual(partial.uncancelled, []);
    assert.equal((await latestEvent(fixture, context.queued.outboxItemId)).state, "pending");
    const outbox = (await fixture.vite.ssrLoadModule(OUTBOX)).createD1OutboxRepository(fixture.database, { ...scope(context.seeded), now: () => OUTREACH_NOW + 1_000 });
    assert.equal((await outbox.claimDispatchLease({ outboxItemId: context.queued.outboxItemId, holderId: "synthetic-worker-one" })).kind, "claimed", "the uncancelled item is not stranded");
    const match = await domain("Example.Invalid", "domain-match", OUTREACH_NOW + 1_100);
    assert.equal(match.kind, "suppressed");
    assert.deepEqual(match.cancelledOutboxItemIds, [context.queued.outboxItemId], "the recipient's own domain cancels the leased item");
    assert.equal((await latestEvent(fixture, context.queued.outboxItemId)).state, "cancelled");
    const later = (await fixture.vite.ssrLoadModule(OUTBOX)).createD1OutboxRepository(fixture.database, { ...scope(context.seeded), now: () => OUTREACH_NOW + 40_000 });
    assert.equal((await later.claimDispatchLease({ outboxItemId: context.queued.outboxItemId, holderId: "synthetic-worker-two" })).kind, "blocked");
  } finally {
    await fixture.dispose();
  }
});

test("public unsubscribe is generic, rate limited, replay-safe and writes the tombstone before success", async () => {
  const fixture = await createD1Fixture("suppression-unsubscribe");
  try {
    const suppression = await fixture.vite.ssrLoadModule(SUPPRESSION);
    const context = await prepareQueued(fixture, { unsubscribeTokenDigest: await suppression.unsubscribeTokenDigest(UNSUBSCRIBE_TOKEN) });
    const stopRulesModule = await fixture.vite.ssrLoadModule(STOP_RULES);
    const consumed = [];
    const limiter = { consume: async (key) => { consumed.push(key); return consumed.length <= 5; } };
    assert.throws(() => stopRulesModule.createPublicUnsubscribe(fixture.database, { now: () => OUTREACH_NOW }), /rate_limiter_required/);

    // Write failure: no success is reported and nothing is durable.
    const failing = recordingDatabase(fixture.database, { failBatch: true });
    const failed = await stopRulesModule.createPublicUnsubscribe(failing.database, { limiter, now: () => OUTREACH_NOW + 10 })
      .unsubscribe({ token: UNSUBSCRIBE_TOKEN, clientKey: "client-a" });
    assert.deepEqual(failed, { kind: "unavailable", providerCalls: 0 });
    assert.equal(await countRows(fixture.database, "outreach_suppression_tombstones"), 0);
    assert.equal((await latestEvent(fixture, context.queued.outboxItemId)).state, "pending");

    const recorder = recordingDatabase(fixture.database);
    const handler = stopRulesModule.createPublicUnsubscribe(recorder.database, { limiter, now: () => OUTREACH_NOW + 10 });
    const generic = { kind: "acknowledged", message: stopRulesModule.UNSUBSCRIBE_ACKNOWLEDGEMENT, providerCalls: 0 };
    const success = await handler.unsubscribe({ token: UNSUBSCRIBE_TOKEN, clientKey: "client-a" });
    assert.deepEqual(success, generic);
    assert.doesNotMatch(JSON.stringify(success), /verified|example|ost_|ooi-/u, "no read disclosure");
    assert.equal(recorder.batches.length, 1);
    const tombstoneAt = recorder.batches[0].findIndex((sql) => /INSERT INTO outreach_suppression_tombstones/u.test(sql));
    const cancelAt = recorder.batches[0].findIndex((sql) => /INSERT INTO outreach_outbox_events/u.test(sql));
    assert.ok(tombstoneAt >= 0 && cancelAt > tombstoneAt);
    const tombstone = await fixture.database.prepare("SELECT subject_kind,subject_digest,channel,reason FROM outreach_suppression_tombstones").first();
    assert.deepEqual(tombstone, { subject_kind: "exact_email", subject_digest: context.seeded.contactPointDigest, channel: "email", reason: "unsubscribe" });
    assert.equal((await latestEvent(fixture, context.queued.outboxItemId)).state, "cancelled");

    const replay = await handler.unsubscribe({ token: UNSUBSCRIBE_TOKEN, clientKey: "client-b" });
    assert.deepEqual(replay, generic);
    assert.equal(await countRows(fixture.database, "outreach_suppression_tombstones"), 1);
    assert.equal(await countRows(fixture.database, "outreach_commands") > 0, true);
    const rowsAfterReplay = await countRows(fixture.database, "outreach_outbox_events");
    assert.deepEqual(await handler.unsubscribe({ token: "UnknownButWellFormedToken_0123456789abcdefXYZ", clientKey: "client-c" }), generic);
    assert.deepEqual(await handler.unsubscribe({ token: "bad token!", clientKey: "client-d" }), generic);
    assert.equal(await countRows(fixture.database, "outreach_suppression_tombstones"), 1);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), rowsAfterReplay);
    assert.ok(consumed.every((key) => /^[a-f0-9]{64}$/u.test(key)), "limiter sees only a digest of the client key");

    const readsBefore = recorder.reads.length;
    assert.deepEqual(await handler.unsubscribe({ token: UNSUBSCRIBE_TOKEN, clientKey: "client-e" }), { kind: "rate_limited", providerCalls: 0 });
    assert.equal(recorder.reads.length, readsBefore, "a limited request performs no token lookup");
    const throwing = stopRulesModule.createPublicUnsubscribe(fixture.database, { limiter: { consume: () => { throw new Error("limiter down"); } }, now: () => OUTREACH_NOW + 10 });
    assert.deepEqual(await throwing.unsubscribe({ token: UNSUBSCRIBE_TOKEN, clientKey: "client-f" }), { kind: "unavailable", providerCalls: 0 });
    await assertNoForbiddenStates(fixture);
  } finally {
    await fixture.dispose();
  }
});

test("inbound reply and bounce stops are restricted to originated items, durable, and cancel follow-ups", async () => {
  const fixture = await createD1Fixture("suppression-inbound-reply");
  try {
    const context = await prepareQueued(fixture);
    const stopRules = (await fixture.vite.ssrLoadModule(STOP_RULES)).createOutreachStopRules(fixture.database, { ...scope(context.seeded), now: () => OUTREACH_NOW + 10 });
    const inbound = (overrides) => stopRules.applyInboundStop({
      originatedOutboxItemId: context.queued.outboxItemId, classification: "reply",
      sourceEventDigest: digestOf("reply-event"), observedAt: OUTREACH_NOW + 5, ...overrides,
    });
    assert.deepEqual(await inbound({ originatedOutboxItemId: "ooi-not-originated-here" }), { kind: "refused", reason: "unknown_origin", providerCalls: 0 });
    assert.deepEqual(await inbound({ body: "full reply body" }), { kind: "refused", reason: "invalid_request", providerCalls: 0 }, "no mailbox content is accepted");
    assert.deepEqual(await inbound({ classification: "out_of_office" }), { kind: "refused", reason: "invalid_request", providerCalls: 0 });
    assert.equal(await countRows(fixture.database, "outreach_stop_events"), 0);

    const reply = await inbound({});
    assert.equal(reply.kind, "stopped");
    assert.equal(reply.classification, "reply");
    assert.deepEqual(reply.cancelledOutboxItemIds, [context.queued.outboxItemId]);
    assert.equal(reply.providerCalls, 0);
    const stop = await fixture.database.prepare("SELECT stop_kind,tombstone_id,subject_kind,subject_digest FROM outreach_stop_events").first();
    assert.deepEqual(stop, { stop_kind: "reply", tombstone_id: null, subject_kind: "exact_email", subject_digest: context.seeded.contactPointDigest });
    assert.equal((await latestEvent(fixture, context.queued.outboxItemId)).reason_code, "reply_received");

    const replay = await inbound({});
    assert.equal(replay.kind, "stopped");
    assert.equal(replay.replayed, true);
    assert.equal(await countRows(fixture.database, "outreach_stop_events"), 1);

    const bounce = await inbound({ classification: "bounce", sourceEventDigest: digestOf("bounce-event") });
    assert.equal(bounce.kind, "stopped");
    assert.deepEqual(bounce.cancelledOutboxItemIds, []);
    assert.equal(await countRows(fixture.database, "outreach_stop_events"), 2);
    assert.equal(await countRows(fixture.database, "outreach_suppression_tombstones"), 0, "reply and bounce are stops, not suppressions");
    await assertNoForbiddenStates(fixture);
  } finally {
    await fixture.dispose();
  }
});

test("an explicit opt-out reply suppresses before success and an ambiguous reply only pauses work", async () => {
  for (const classification of ["opt_out", "ambiguous"]) {
    const fixture = await createD1Fixture(`suppression-inbound-${classification}`);
    try {
      const context = await prepareQueued(fixture);
      const recorder = recordingDatabase(fixture.database);
      const stopRules = (await fixture.vite.ssrLoadModule(STOP_RULES)).createOutreachStopRules(recorder.database, { ...scope(context.seeded), now: () => OUTREACH_NOW + 10 });
      const result = await stopRules.applyInboundStop({
        originatedOutboxItemId: context.queued.outboxItemId, classification,
        sourceEventDigest: digestOf(`${classification}-event`), observedAt: OUTREACH_NOW + 5,
      });
      assert.equal(result.kind, classification === "opt_out" ? "stopped" : "paused_for_review", classification);
      assert.deepEqual(result.cancelledOutboxItemIds, [context.queued.outboxItemId], classification);
      assert.equal(recorder.batches.length, 1, classification);
      if (classification === "opt_out") {
        const tombstone = await fixture.database.prepare("SELECT subject_kind,subject_digest,reason FROM outreach_suppression_tombstones").first();
        assert.deepEqual(tombstone, { subject_kind: "exact_email", subject_digest: context.seeded.contactPointDigest, reason: "explicit_opt_out" });
        const order = recorder.batches[0];
        assert.ok(order.findIndex((sql) => /outreach_suppression_tombstones/u.test(sql)) < order.findIndex((sql) => /INSERT INTO outreach_outbox_events/u.test(sql)));
      } else {
        assert.equal(await countRows(fixture.database, "outreach_suppression_tombstones"), 0, "ambiguous reply writes no permanent suppression");
        assert.equal(await countRows(fixture.database, "outreach_stop_events"), 0, "ambiguous reply writes no permanent stop");
        assert.equal((await latestEvent(fixture, context.queued.outboxItemId)).reason_code, "ambiguous_reply_paused");
      }
      await assertNoForbiddenStates(fixture);
    } finally {
      await fixture.dispose();
    }
  }
});

test("pause, archive and high-risk drift cancel the Profile's pending work without a permanent stop", async () => {
  const fixture = await createD1Fixture("suppression-lifecycle");
  try {
    const context = await prepareQueued(fixture);
    const stopRules = (await fixture.vite.ssrLoadModule(STOP_RULES)).createOutreachStopRules(fixture.database, { ...scope(context.seeded), now: () => OUTREACH_NOW + 10 });
    assert.deepEqual(
      await stopRules.applyLifecycleStop({ kind: "pause", profileId: "missing-profile", sourceEventDigest: digestOf("missing") }),
      { kind: "refused", reason: "unknown_profile", providerCalls: 0 },
    );
    assert.deepEqual(
      await stopRules.applyLifecycleStop({ kind: "resume", profileId: context.seeded.profileId, sourceEventDigest: digestOf("resume") }),
      { kind: "refused", reason: "invalid_request", providerCalls: 0 },
    );
    const paused = await stopRules.applyLifecycleStop({ kind: "pause", profileId: context.seeded.profileId, sourceEventDigest: digestOf("pause") });
    assert.equal(paused.kind, "stopped");
    assert.deepEqual(paused.cancelledOutboxItemIds, [context.queued.outboxItemId]);
    assert.equal((await latestEvent(fixture, context.queued.outboxItemId)).reason_code, "profile_paused");
    for (const kind of ["archive", "high_risk_drift"]) {
      const repeat = await stopRules.applyLifecycleStop({ kind, profileId: context.seeded.profileId, sourceEventDigest: digestOf(kind) });
      assert.equal(repeat.kind, "stopped", kind);
      assert.deepEqual(repeat.cancelledOutboxItemIds, [], kind);
    }
    assert.equal(await countRows(fixture.database, "outreach_stop_events"), 0);
    assert.equal(await countRows(fixture.database, "outreach_suppression_tombstones"), 0);
    await assertNoForbiddenStates(fixture);
  } finally {
    await fixture.dispose();
  }
});

test("the outbox cancel method only plans fenced pending or leased cancellations", async () => {
  const fixture = await createD1Fixture("suppression-outbox-cancel");
  try {
    const context = await prepareQueued(fixture);
    const outboxModule = await fixture.vite.ssrLoadModule(OUTBOX);
    const outbox = outboxModule.createD1OutboxRepository(fixture.database, { ...scope(context.seeded), now: () => OUTREACH_NOW + 10 });
    for (const invalid of [
      null,
      { outboxItemIds: [], reasonCode: "x_stop" },
      { outboxItemIds: [context.queued.outboxItemId, context.queued.outboxItemId], reasonCode: "x_stop" },
      { outboxItemIds: [context.queued.outboxItemId], reasonCode: "Bad Reason" },
      { outboxItemIds: [context.queued.outboxItemId], reasonCode: "x_stop", state: "sent" },
    ]) {
      assert.deepEqual(await outbox.prepareCancellationBeforeDispatch(invalid), { kind: "blocked", reason: "invalid_request", providerInvocationAuthorized: false, providerCalls: 0 });
    }
    const foreign = outboxModule.createD1OutboxRepository(fixture.database, { workspaceId: context.seeded.workspaceId, ownerSubject: "not-the-owner", now: () => OUTREACH_NOW + 10 });
    assert.equal((await foreign.prepareCancellationBeforeDispatch({ outboxItemIds: [context.queued.outboxItemId], reasonCode: "x_stop" })).kind, "blocked");

    const plan = await outbox.prepareCancellationBeforeDispatch({ outboxItemIds: [context.queued.outboxItemId, "ooi-unknown-item"], reasonCode: "x_stop" });
    assert.equal(plan.kind, "planned");
    assert.equal(plan.statements.length, 1);
    assert.deepEqual(plan.skipped, [{ outboxItemId: "ooi-unknown-item", reason: "unknown_item" }]);
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 1, "planning never commits");
    // A concurrent change between plan and commit turns the fenced insert into a no-op.
    const competing = await outbox.prepareCancellationBeforeDispatch({ outboxItemIds: [context.queued.outboxItemId], reasonCode: "y_stop" });
    await fixture.database.batch([...competing.statements]);
    await fixture.database.batch([...plan.statements]);
    assert.deepEqual(await latestEvent(fixture, context.queued.outboxItemId), { revision: 2, state: "cancelled", reason_code: "y_stop" });
    assert.equal(await countRows(fixture.database, "outreach_outbox_events"), 2);
    const terminal = await outbox.prepareCancellationBeforeDispatch({ outboxItemIds: [context.queued.outboxItemId], reasonCode: "x_stop" });
    assert.deepEqual(terminal.skipped, [{ outboxItemId: context.queued.outboxItemId, reason: "not_cancellable" }]);
    assert.equal(terminal.statements.length, 0);
    await assertNoForbiddenStates(fixture);
  } finally {
    await fixture.dispose();
  }
});

// ---- lane-local helpers -------------------------------------------------

async function createLightFixture(name) {
  const fixture = await createD1Fixture(name);
  await applyOutreachMigrations(fixture.database);
  await insertWorkspace(fixture, LIGHT_WORKSPACE);
  return fixture;
}

async function insertWorkspace(fixture, workspace) {
  await fixture.database.prepare(
    "INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES (?,?,?,?,?,1)",
  ).bind(workspace.id, "Synthetic suppression company", workspace.owner, OUTREACH_NOW, OUTREACH_NOW).run();
}

async function loadLight(fixture, workspace) {
  const suppression = await fixture.vite.ssrLoadModule(SUPPRESSION);
  const stopRulesModule = await fixture.vite.ssrLoadModule(STOP_RULES);
  return { suppression, stopRules: stopRulesModule.createOutreachStopRules(fixture.database, lightScope(workspace)) };
}

function lightScope(workspace) {
  return { workspaceId: workspace.id, ownerSubject: workspace.owner, now: () => OUTREACH_NOW };
}

function scope(seeded) {
  return { workspaceId: seeded.workspaceId, ownerSubject: OUTREACH_OWNER.subject, now: () => OUTREACH_NOW };
}

async function countRowsFor(fixture, table, workspaceId) {
  return Number((await fixture.database.prepare(`SELECT count(*) count FROM ${table} WHERE workspace_id=?`).bind(workspaceId).first()).count);
}

async function latestEvent(fixture, outboxItemId) {
  return fixture.database.prepare(
    "SELECT revision,state,reason_code FROM outreach_outbox_events WHERE outbox_item_id=? ORDER BY revision DESC LIMIT 1",
  ).bind(outboxItemId).first();
}

async function assertNoForbiddenStates(fixture) {
  const row = await fixture.database.prepare(
    `SELECT count(*) count FROM outreach_outbox_events WHERE state IN (${FORBIDDEN_STATES.map(() => "?").join(",")})`,
  ).bind(...FORBIDDEN_STATES).first();
  assert.equal(Number(row.count), 0, "dispatching, sent and delivery_unknown stay unreachable");
}

function digestOf(label) {
  let hex = "";
  for (const byte of new TextEncoder().encode(label)) hex += byte.toString(16).padStart(2, "0");
  return hex.padEnd(64, "0").slice(0, 64);
}

/** Throws on `first()` for every statement whose SQL the predicate selects (checked once, at prepare time). */
function failingDatabase(database, shouldFail) {
  const wrap = (statement, fail) => Object.freeze({
    bind: (...values) => wrap(statement.bind(...values), fail),
    first: (...args) => (fail ? Promise.reject(new Error("synthetic lookup failure")) : statement.first(...args)),
    all: (...args) => (fail ? Promise.reject(new Error("synthetic lookup failure")) : statement.all(...args)),
    run: (...args) => statement.run(...args),
    raw: (...args) => statement.raw(...args),
  });
  return Object.freeze({
    prepare: (sql) => wrap(database.prepare(sql), shouldFail(sql)),
    batch: (statements) => database.batch(statements),
    exec: () => { throw new Error("unexpected exec"); },
  });
}

/** Records batch statement order and reads without changing D1 semantics. */
function recordingDatabase(database, { failBatch = false } = {}) {
  const batches = [];
  const reads = [];
  const real = new WeakMap();
  const wrap = (statement, sql) => {
    const wrapped = Object.freeze({
      bind: (...values) => wrap(statement.bind(...values), sql),
      first: (...args) => { reads.push(sql); return statement.first(...args); },
      all: (...args) => { reads.push(sql); return statement.all(...args); },
      run: (...args) => statement.run(...args),
      raw: (...args) => { reads.push(sql); return statement.raw(...args); },
    });
    real.set(wrapped, { statement, sql });
    return wrapped;
  };
  return {
    batches,
    reads,
    database: Object.freeze({
      prepare: (sql) => wrap(database.prepare(sql), sql),
      batch: async (statements) => {
        const entries = statements.map((statement) => real.get(statement));
        if (entries.some((entry) => !entry)) throw new Error("unwrapped statement in recorded batch");
        if (failBatch) throw new Error("synthetic batch failure");
        batches.push(entries.map((entry) => entry.sql));
        return database.batch(entries.map((entry) => entry.statement));
      },
      exec: () => { throw new Error("unexpected exec"); },
    }),
  };
}

async function prepareQueued(fixture, options = {}) {
  const seeded = await seedOutreachAuthority(fixture);
  const repository = (await fixture.vite.ssrLoadModule(REPOSITORY)).createD1OutreachRepository(fixture.database, scope(seeded));
  const packageVersion = await repository.createPackageVersion(packageInput(seeded));
  const packageApproval = await repository.approvePackageVersion({
    packageVersionId: packageVersion.id, expectedVersion: 1, expiresAt: OUTREACH_NOW + 70_000, idempotencyKey: "suppression-package-approval",
  });
  const message = await repository.createMessageVersion(messageInput(packageVersion, seeded, options.unsubscribeTokenDigest ?? "9".repeat(64)));
  const recipientAuthority = await repository.recordRecipientDispatchAuthority({
    messageVersionId: message.id, packageApprovalId: packageApproval.id, emailObservationId: seeded.observationId,
    jurisdictionCode: "CA-ON", claimedBasisCode: "legitimate_interest", basisSourceId: "outreach-source", basisSourceDigest: seeded.sourceDigest,
    advisoryPolicyVersion: "prospector-advisory-v1", advisoryPolicyDigest: "c".repeat(64), unsubscribePathDigest: "d".repeat(64),
    acknowledgedAt: OUTREACH_NOW, validUntil: OUTREACH_NOW + 70_000, idempotencyKey: "suppression-recipient-authority",
  });
  await repository.recordUnsubscribeAuthorityEvent({
    recipientAuthorityId: recipientAuthority.id, expectedRevision: 0, status: "working", checkDigest: "e".repeat(64),
    observedAt: OUTREACH_NOW, validUntil: OUTREACH_NOW + 70_000, idempotencyKey: "suppression-unsubscribe-working",
  });
  const messageApproval = await repository.approveMessageVersion({
    messageVersionId: message.id, packageApprovalId: packageApproval.id, expectedVersion: 1,
    acknowledgementDigest: recipientAuthority.digest, expiresAt: OUTREACH_NOW + 60_000, idempotencyKey: "suppression-message-approval",
  });
  const senderConnectionId = await insertSenderConnection(fixture, seeded, repository);
  const outboxModule = await fixture.vite.ssrLoadModule(OUTBOX);
  const queued = await outboxModule.createD1OutboxRepository(fixture.database, scope(seeded))
    .enqueueApprovedMessage({ messageApprovalId: messageApproval.id, senderConnectionId });
  assert.equal(queued.kind, "queued");
  if (options.leased) {
    const lease = await outboxModule.createD1OutboxRepository(fixture.database, { ...scope(seeded), now: () => OUTREACH_NOW + 1_000 })
      .claimDispatchLease({ outboxItemId: queued.outboxItemId, holderId: "synthetic-worker-one" });
    assert.equal(lease.kind, "claimed");
  }
  return { seeded, queued, messageApproval };
}

async function insertSenderConnection(fixture, seeded, repository) {
  const issuance = await fixture.vite.ssrLoadModule(new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname);
  const senderAddressDigest = await issuance.canonicalDigest({ schema: "outreach-sender-address/v1", address: "owner@example.invalid" });
  const connectionId = "suppression-sender-connection-1";
  await fixture.database.prepare(
    "INSERT INTO outreach_sender_connections (id,workspace_id,provider,connection_subject_digest,sender_address_digest,protected_reference,protected_reference_version,status,verified_at,created_at) VALUES (?,?,'gmail',?,?,?,1,'active',?,?)",
  ).bind(connectionId, seeded.workspaceId, "6".repeat(64), senderAddressDigest, "vault-ref:synthetic-unconfigured-1", OUTREACH_NOW - 1, OUTREACH_NOW).run();
  await repository.recordSenderCapability({
    senderConnectionId: connectionId,
    grantedScopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
    verifiedAddresses: [{ address: "owner@example.invalid", kind: "canonical", verificationDigest: "7".repeat(64) }],
    verifiedAt: OUTREACH_NOW, expiresAt: OUTREACH_NOW + 86_400_000, idempotencyKey: "suppression-sender-capability-1",
  });
  return connectionId;
}

function packageInput(seeded) {
  return {
    packageId: "outreach-package-root", prospectId: seeded.prospectId, contactId: seeded.contactId, profileId: seeded.profileId,
    version: 1, expectedVersion: 0, configurationId: seeded.configurationId, configurationDigest: seeded.configurationDigest,
    configurationRevision: seeded.configurationRevision, prospectRevision: seeded.prospectRevision, contactRevision: seeded.contactRevision,
    contactEligibilitySnapshotId: seeded.eligibilityId,
    snapshot: {
      evidenceDigests: [seeded.evidenceDigest], claimGuardrailDigests: [seeded.guardrailDigest],
      recommendedAngle: "Synthetic governed outreach angle", selectedRole: "champion",
      selectedContactPointDigests: [seeded.contactPointDigest], callScript: "Synthetic offline call script.",
      draftMessageIds: ["outreach-message-root"],
    },
    bindings: [
      { kind: "configuration", id: seeded.configurationId, digest: seeded.configurationDigest },
      { kind: "qualification", id: "outreach-assessment", digest: "2".repeat(64) },
      { kind: "review_decision", id: "outreach-review", digest: "5".repeat(64) },
      { kind: "source", id: "outreach-source", digest: seeded.sourceDigest },
      { kind: "evidence", id: "outreach-evidence", digest: seeded.evidenceDigest },
      { kind: "claim_guardrail", id: "outreach-guardrail", digest: seeded.guardrailDigest },
      { kind: "contact_observation", id: seeded.observationId, digest: seeded.observationDigest },
      { kind: "contact_eligibility", id: seeded.eligibilityId, digest: seeded.eligibilityDigest },
    ],
    idempotencyKey: "suppression-package-version-create",
  };
}

function messageInput(packageVersion, seeded, unsubscribeTokenDigest) {
  return {
    messageId: "outreach-message-root", packageId: "outreach-package-root", packageVersionId: packageVersion.id,
    version: 1, expectedVersion: 0,
    snapshot: {
      senderReference: "sender-synthetic", from: "owner@example.invalid", replyTo: null, to: ["verified@example.invalid"],
      cc: [], bcc: [], subject: "Synthetic governed outreach message", textBody: "Hello from the offline fixture.", htmlBody: null,
      links: ["https://example.invalid/unsubscribe"], attachments: [], threadReference: null, replyToMessageReference: null,
    },
    intendedSendAt: OUTREACH_NOW + 1_000, timezone: "America/Toronto", unsubscribeTokenDigest,
    bindings: [{ kind: "package_version", id: packageVersion.id, digest: packageVersion.digest }],
    idempotencyKey: `suppression-message-version-${seeded.prospectId}`,
  };
}
