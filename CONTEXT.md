# PROspector Platform

The canonical language for the reusable, human-governed PROspector go-to-market operating system. Product- and market-specific language belongs to its Market Play context rather than this platform glossary.

## Language

### Commercial Structure

**Company**:
The organization using PROspector to develop customers for its Products.
_Avoid_: account, prospect, user

**Company Workspace**:
The isolated PROspector environment containing one Company's users, knowledge, Products, Market Plays, Prospects, contacts, and outreach. It never contains another Company's data.
_Avoid_: multi-company workspace, shared prospect database

**AI Runner**:
An authorized Codex, Claude, OpenAI API, Anthropic API, or future execution provider that performs Consensus Interview research, Market Discovery Runs, or Prospecting Runs for a Company Workspace. It does not own confirmed knowledge or operational records.
_Avoid_: system of record, stored subscription credential, product

**Runner Connection**:
A scoped, revocable authorization allowing one AI Runner to read only the confirmed context required for assigned work, submit sourced results, and report status.
_Avoid_: user login, subscription credential, workspace-wide access

**Company Workspace Export**:
A complete, restorable representation of a Company Workspace, including confirmed knowledge, documents, decisions, discovery history, Prospects, contacts, outreach, and Suppression records.
_Avoid_: CRM handoff, summary report, partial backup

**Reusable Knowledge Package**:
A deliberately selected set of Confirmed Knowledge that a source Company has authorized for reuse outside its Company Workspace. It excludes contacts, Prospects, outreach, Suppression records, and unapproved private source material.
_Avoid_: company workspace export, automatic cross-company access

**Organization**:
An external legal or commercial entity with one canonical identity across a Company's Products and Market Plays.
_Avoid_: company, account, target

**Product**:
A product or service offered by a Company with a coherently managed core capability, delivery model, roadmap, and commercial identity. One Product may support multiple Market Plays when those fundamentals remain substantially shared.
_Avoid_: market, campaign, customer profile

**Draft Product**:
A Product with unresolved required knowledge about its capabilities, limitations, delivery, proof, ownership, or Claim Guardrails. It cannot drive Market Discovery or support a Ready Customer Profile.
_Avoid_: ready product, market play

**Ready Product**:
A Product whose required core knowledge has been explicitly confirmed by the GTM Operator. It may drive Market Discovery and support Ready Customer Profiles without requiring every future market to be known.
_Avoid_: draft product, validated product-market fit

**Market Play**:
A bounded go-to-market context pairing one Product with a distinct market, problem set, and customer audience while the Product's core remains substantially shared. Each Market Play owns its Customer Profiles, language, evidence rules, discovery, qualification, and outreach.
_Avoid_: product, campaign, industry tag

**Market Play Proposal**:
An evidence-backed hypothesis that a Product may fit a market or customer audience the Company has not yet configured. It may start a Consensus Interview but cannot drive Prospecting Runs or outreach.
_Avoid_: ready market play, speculative industry tag

**Proposal Decision**:
The GTM Operator's recorded choice to Explore, Defer, or Dismiss a Market Play Proposal. Deferral and dismissal retain a reason to prevent repetitive suggestions.
_Avoid_: prospect review decision, automatic activation

**Consensus Interview**:
A one-question-at-a-time dialogue that researches available facts, distinguishes evidence from inference, and resolves Company, Product, Market Play, and Customer Profile decisions through explicit operator confirmation.
_Avoid_: signup form, free-form prompt, automatic inference

**Ready Market Play**:
A derived condition: a Market Play is Ready when it is not paused/archived and contains at least one Ready Customer Profile. Only its Ready Customer Profiles may drive Prospecting Runs and downstream workflows.
_Avoid_: market play with only draft customer profiles, partially configured campaign

**Ready Customer Profile**:
A Customer Profile whose required knowledge has been explicitly confirmed by the GTM Operator and may independently drive discovery, qualification, and outreach within its Market Play.
_Avoid_: draft customer profile, inferred audience

**Profile Version**:
An immutable snapshot of a Ready Customer Profile used by a Prospecting Run or Qualification decision. Historical Prospects retain the Profile Version that governed them even after the profile changes.
_Avoid_: live mutable profile, overwritten scoring context

**Product Discovery Configuration**:
The immutable bundle of exact Company, Product, source policy, market-discovery policy, compliance posture, and runner-instruction versions governing a Product-level Market Discovery Run. It does not require a Market Play, Customer Profile, or Offer.
_Avoid_: profile configuration, placeholder customer profile, current settings

**Profile Effective Configuration**:
The immutable bundle of exact Company, Product, Market Play, Customer Profile, Offer, rubric, source policy, Claim Guardrail, Contact Strategy, Outreach Strategy, compliance posture, and runner-instruction versions governing a Prospecting Run or outbound artifact.
_Avoid_: current settings, profile version alone, product discovery configuration, mutable inherited configuration

**Knowledge Scope**:
The Company, Product, Market Play, or Customer Profile boundary within which a confirmed fact, rule, proof point, or constraint is valid. New knowledge defaults to the narrowest currently active scope; profile-specific rubrics and strategies default to that Customer Profile.
_Avoid_: global note, unscoped context

**Promotion**:
The GTM Operator's explicit decision that confirmed knowledge is valid at a broader Knowledge Scope and may be inherited by additional Products or Market Plays.
_Avoid_: copy, automatic sharing, inference

**Reuse Suggestion**:
A proposed application of existing same-Company knowledge or an authorized Reusable Knowledge Package to a new Product, Market Play, or Customer Profile. It remains Proposed Knowledge until confirmed in the destination scope.
_Avoid_: inherited truth, automatic copy

**Proposed Knowledge**:
A sourced fact, rule, proof point, or constraint extracted or entered for operator review but not yet accepted within a Knowledge Scope. Proposed Knowledge cannot alter active workflows.
_Avoid_: confirmed fact, active configuration

**Research Finding**:
A sourced fact or clearly labelled inference gathered by PROspector for consideration during a Consensus Interview. It remains Proposed Knowledge until confirmed.
_Avoid_: confirmed knowledge, unsourced assertion

**Confirmed Knowledge**:
Knowledge the GTM Operator has accepted as valid within a stated Knowledge Scope and that may therefore govern Ready Market Plays.
_Avoid_: proposed knowledge, unsourced assumption

**Knowledge Conflict**:
An incompatibility between Proposed Knowledge and existing Confirmed Knowledge, or between two confirmed scopes. A conflict remains visible until resolved through a Consensus Interview.
_Avoid_: overwrite, merge assumption

**Knowledge Drift**:
A detected difference between Confirmed Knowledge and a newly added or edited source. Drift remains Proposed Knowledge until the GTM Operator explicitly accepts, rejects, corrects, or rescopes it.
_Avoid_: automatic update, silent overwrite

**High-risk Drift**:
Knowledge Drift that challenges a Product capability, proof point, Claim Guardrail, Offer term, or Suppression. It pauses affected outbound messages until resolved without stopping unrelated discovery or Market Plays.
_Avoid_: routine update, global system pause

**Knowledge Document**:
A versioned, human-readable representation of Confirmed Knowledge for a Company, Product, Market Play, or Customer Profile.
_Avoid_: unstructured source dump, active configuration

**Decision Record**:
A concise record of a consequential, hard-to-reverse choice and why it was made. Routine interview answers do not become Decision Records.
_Avoid_: meeting note, answer log, changelog entry

**Customer Profile**:
The agreed description of a type of customer a Market Play should pursue, including fit, buying context, relevant pains, signals, roles, and disqualifiers.
_Avoid_: lead list, persona, market play

**Draft Customer Profile**:
A Customer Profile with unresolved required knowledge. It may be refined through a Consensus Interview but cannot drive discovery, qualification, or outreach.
_Avoid_: ready customer profile, active audience

**Offer**:
A concrete commercial entry point within a Market Play, with an agreed scope, outcome, and intended Customer Profile. Prospecting seeks evidence that an Account may plausibly need and buy the Offer.
_Avoid_: product, feature, generic value proposition

**Contact Strategy**:
The Customer Profile-specific definition of relevant buyer, champion, and validator roles, their priority, verification requirements, and default Enrichment Budget.
_Avoid_: generic title list, contact database

**Outreach Strategy**:
The Customer Profile-specific definition of channels, message patterns, touch sequence, timing, stop conditions, and call approach for its Offer and buyer roles.
_Avoid_: company-wide sequence, generic campaign

**Account**:
The Market Play-specific view of an Organization being evaluated or developed as a potential customer or commercial relationship.
_Avoid_: company, organization identity, contact, target

**Contact**:
An external person associated with an Organization whose canonical identity and contact points may be reused across Market Plays. Relevance, role, and outreach remain play-specific.
_Avoid_: enriched contact, prospect, account

**Target**:
The distinct commercial or operational unit within an Account to which a Market Play's value proposition applies. A Market Play defines whether its Targets are sites, projects, fleets, business units, or the Account itself.
_Avoid_: account, contact

**Motion**:
A legacy planning label for a commercial path. A path with its own customer definition, qualification, cadence, and queue migrates to a Customer Profile; a partner or portfolio path without prospect qualification remains strategy until separately modelled.
_Avoid_: runtime entity, market play, segment, track

**PROspector**:
A reusable, human-governed go-to-market operating system that turns agreed Company, Product, Market Play, and Customer Profile knowledge into discovery, qualification, enrichment, and outreach workflows.
_Avoid_: fixed-product prospecting script, generic contact scraper, CRM

### Governance

**GTM Operator**:
The person accountable for reviewing PROspector's recommendations and advancing Prospects through the workflow on behalf of a Company.
_Avoid_: user, administrator

**Approval Gate**:
An explicit, scoped, expiring authorization from the GTM Operator required before PROspector incurs a paid enrichment cost or sends an external communication. Paid grants bind provider, Prospect set, units/cost, and nonce; message grants bind an immutable send-artifact digest.
_Avoid_: certification gate, automatic spend, automatic send

**Enrichment Budget**:
The maximum paid contact-discovery cost authorized for an Approved Prospect. Exceeding it requires a new Approval Gate.
_Avoid_: monthly platform allowance, unlimited enrichment

**Review Decision**:
The GTM Operator's recorded choice to Approve, Reject, or Defer a Qualified Prospect. Rejection and deferral retain a reason so the decision can inform later Qualification.
_Avoid_: dismissal, certification

**Outreach Advisory**:
Non-blocking guidance about jurisdiction, consent, lawful basis, or calling restrictions that the GTM Operator considers before contact. An advisory informs the decision but neither authorizes nor prevents outreach.
_Avoid_: legal approval, send authorization

**Suppression**:
A mandatory prohibition on contacting a person or address that has explicitly opted out or requested no calls. Suppression overrides message approval and applies across all outreach managed by PROspector.
_Avoid_: advisory, rejection, temporary deferment

### Prospect Lifecycle

**Signal**:
Recent or currently reconfirmed, sourced evidence that an Account or Target may have a pain, buying trigger, or strategic condition relevant to one Market Play.
_Avoid_: lead, unsourced hunch, cross-play evidence

**Material Signal**:
A new Signal that could change a Prospect's Qualification, priority, timing, or recommended outreach. Republication or repetition of known information is not material.
_Avoid_: duplicate mention, refreshed article

**Account Context**:
Sourced background information that helps interpret an Account or Target but is not current enough to qualify as a Signal. Account Context may support a decision but cannot qualify a Prospect by itself.
_Avoid_: signal, buying trigger

**Source Tier**:
The evidence-quality class assigned to a source according to its authority and independence. Lower-tier material may prompt discovery, but cannot qualify a Prospect without the confirmation required by its Market Play.
_Avoid_: qualification score, popularity rank

**Candidate Account**:
A discovered Account associated with at least one Signal that has not yet been tested fully against a Customer Profile and its disqualifiers. Relevant Targets remain separately identifiable.
_Avoid_: lead, prospect

**Not-qualified Prospect**:
A Candidate Account/Target that completed Qualification under a Profile Effective Configuration but did not pass its score or required-evidence rule and did not hit a hard disqualifier. It may be reconsidered only after a Material Signal or the Profile's review interval.
_Avoid_: candidate awaiting evaluation, rejected prospect, hard-disqualified account

**Qualification**:
An automatic, explainable assessment of whether a Candidate Account and relevant Target represent a sufficiently evidenced commercial opportunity under one Ready Customer Profile and Profile Version.
_Avoid_: certification, approval, black-box score

**Qualified Prospect**:
A specific commercial opportunity combining a Candidate Account with its relevant Target when the governing Customer Profile requires one. Qualification does not authorize spending or contact.
_Avoid_: certified lead, approved prospect

**Approved Prospect**:
A Qualified Prospect the GTM Operator has chosen to advance into contact enrichment and outreach preparation. Sending an external communication still requires its own Approval Gate.
_Avoid_: qualified prospect, contacted lead

**Rejected Prospect**:
A Qualified Prospect the GTM Operator has declined, with the reason retained to prevent unproductive rediscovery and improve future Qualification.

**Deferred Prospect**:
A Qualified Prospect the GTM Operator has postponed until a specified review date, with its evidence and reason retained.

**Enriched Contact**:
A relevant person at an Approved Prospect whose role and contact details retain their source and have been verified to the required standard for CRM Handoff.
_Avoid_: enriched prospect, scraped contact

**Contact Suggestion**:
A possible person or contact detail that has not met the verification standard for CRM Handoff. It may guide further research but must not be represented or exported as an Enriched Contact.
_Avoid_: verified contact, enriched contact

**Outreach Package**:
The Market Play evidence, recommended angle, selected Enriched Contact, and draft communication prepared for operator review and CRM Handoff.
_Avoid_: sent message, campaign

**Approved Outreach Package**:
An immutable Outreach Package version the GTM Operator has reviewed for evidence, angle, selected contact, Claim Guardrails, call script, and draft set. Any package-field or dependency change invalidates approval; message sends still require separate exact-message approval.
_Avoid_: approved message, reusable sequence approval, mutable package

**Export-ready Prospect**:
An Approved Prospect with the required Target, passing Qualification evidence, at least one Enriched Contact, an approved Outreach Package, and a complete CRM Handoff record.
_Avoid_: candidate account, qualified prospect, sent message

**Claim Guardrail**:
A canonical constraint on what PROspector may assert about a Product or Market Play. Generated outreach may adapt wording but may not exceed its Claim Guardrails or cited evidence.
_Avoid_: copy suggestion, optional style guidance

**Approved Message**:
A specific immutable email artifact the GTM Operator has reviewed and authorized for sending. Sender, recipient fields, subject, bodies, links, attachments, thread, or scheduled-time changes create a new digest and require a new Approval Gate.
_Avoid_: approved sequence, draft, reusable approval

**Outreach Activity**:
The limited record of PROspector-managed email delivery, replies, phone attempts, call outcomes, follow-up dates, and operator notes. It does not represent deal stage, forecast, proposal, contract, revenue, or customer status.
_Avoid_: opportunity, sales pipeline, CRM activity history

**CRM Handoff**:
The production of a transfer-ready record containing an Export-ready Prospect and its Outreach Package for import into a CRM. A live CRM connection is not required.
_Avoid_: treating PROspector as the CRM, requiring a live CRM integration

### Discovery

**Prospecting Run**:
A recurring search for one Ready Customer Profile that produces deduplicated Candidate Accounts and identifies which of them are Qualified Prospects for operator review.
_Avoid_: lead scrape, cross-play search, scheduled task

**Market Discovery Run**:
A Product-level search for evidence that the Product may fit markets, problems, or customer audiences not represented by existing Ready Market Plays. It produces Market Play Proposals rather than Prospects.
_Avoid_: prospecting run, automatic market activation

**Morning Brief**:
The Company's consolidated view of Prospecting Run results, grouped by Product, Market Play, and Ready Customer Profile without combining their evidence or scores.
_Avoid_: blended lead list, cross-profile ranking

**Cross-play Suggestion**:
A notice that an Organization discovered in one Market Play may also fit another Ready Customer Profile. The other profile must gather its own Signals and complete its own Qualification and Review Decision.
_Avoid_: copied prospect, shared qualification

**Open Discovery**:
The lane within a Prospecting Run that searches broadly for previously unknown Accounts, Targets, and Signals.
_Avoid_: watchlist monitoring

**Watchlist Monitoring**:
The lane within a Prospecting Run that deliberately rechecks known high-fit, deferred, or strategically important Accounts and Targets for Material Signals.
_Avoid_: open discovery, duplicate rediscovery
