export const CONFIGURATION_DIGEST =
  "sha256:profile-effective-configuration-v1";

export const WEEKLY_EXPORT_TARGET = 7;
export const GRANT_TTL_MS = 15 * 60 * 1000;
export const SEND_LEASE_MS = 60_000;
export const DEFAULT_MONTHLY_BUDGET_CENTS = 50_00;
export const APOLLO_UNIT_CENTS = 100;

export const INTERVIEW = [
  {
    questionId: "company.legal_name",
    scope: "company",
    question: "What is the legal name of the company this private workspace belongs to?",
    evidence:
      "A private PROspector deployment holds exactly one Company Workspace. Company data is never pooled, and the owner is the only admitted operator.",
    inference:
      "The legal name becomes the commercial parent for every product, play, and prospect in this workspace.",
    recommendation: "",
    sortOrder: 1,
  },
  {
    questionId: "product.name",
    scope: "product",
    question: "Which product should this workspace operate first?",
    evidence:
      "Product owns core capability, limitations, delivery, proof, and claim guardrails. Later products are created only when those diverge.",
    inference:
      "The first product is the only one that can become Ready and start market discovery.",
    recommendation: "",
    sortOrder: 2,
  },
  {
    questionId: "product.capability",
    scope: "product",
    question: "What does this product actually do, in one sentence a buyer would recognize?",
    evidence:
      "Capability is confirmed knowledge. Runners may not invent a broader product during discovery or outreach.",
    inference:
      "Every Market Play and package must stay inside this capability.",
    recommendation: "",
    sortOrder: 3,
  },
  {
    questionId: "product.limitations",
    scope: "product",
    question: "What will this product never do?",
    evidence:
      "Limitations travel into claim guardrails. Autonomous control, invented savings, or borrowed proof are out of bounds unless named here.",
    inference:
      "A hard no in the product prevents later packages from over-claiming.",
    recommendation: "",
    sortOrder: 4,
  },
  {
    questionId: "product.delivery",
    scope: "product",
    question: "How is this product delivered, and who implements it?",
    evidence:
      "Delivery and ownership must be explicit before discovery. Placeholder Plays are not allowed.",
    inference:
      "Discovery proposes markets that can actually receive this delivery model.",
    recommendation: "",
    sortOrder: 5,
  },
  {
    questionId: "product.proof",
    scope: "product",
    question: "What proof may be cited, and what proof is still unproven?",
    evidence:
      "Only confirmed proof may enter packages. Unproven results stay labelled unproven.",
    inference:
      "Outreach cannot borrow another site’s numbers as if they were this buyer’s.",
    recommendation: "",
    sortOrder: 6,
  },
  {
    questionId: "product.promise",
    scope: "product",
    question: "What may this product claim, and what must it never claim?",
    evidence:
      "Claim guardrails travel into every outreach artifact.",
    inference:
      "A tight promise keeps discovery, qualification, and packages inside what the company can deliver.",
    recommendation: "",
    sortOrder: 7,
  },
  {
    questionId: "product.ownership",
    scope: "product",
    question: "Who owns commercial truth for this product?",
    evidence:
      "The owner confirms knowledge. No workflow may silently rewrite it.",
    inference:
      "Corrections create a new proposed version; they do not mutate confirmed knowledge in place.",
    recommendation: "",
    sortOrder: 8,
  },
  {
    questionId: "product.runner",
    scope: "product",
    question: "Which runner policy is allowed for discovery and prospecting?",
    evidence:
      "Runners are untrusted. They retrieve public pages. They cannot qualify, approve, spend, or send.",
    inference:
      "xAI search plus HTTPS retrieve is the default. Other providers need an owner-saved key.",
    recommendation: "xAI web search + HTTPS retrieve. No silent failover.",
    sortOrder: 9,
  },
  {
    questionId: "play.market",
    scope: "play",
    question: "Which market play should this product pursue first?",
    evidence:
      "A Market Play owns a distinct audience, language, evidence rules, and offers. Exploring a proposal never starts prospecting by itself.",
    inference:
      "The first play should be the audience that already matches the product’s proven capability.",
    recommendation: "",
    sortOrder: 10,
  },
  {
    questionId: "profile.fit",
    scope: "profile",
    question: "Who is worth pursuing in this play, and what is a hard disqualifier?",
    evidence:
      "Pass rule: five 0–2 dimensions, pass at 7/10 only when pain and timing are both non-zero and no hard disqualifier applies.",
    inference:
      "Hard nos must be explicit. They block qualification even when the rest of the score looks strong.",
    recommendation: "",
    sortOrder: 11,
  },
  {
    questionId: "profile.roles",
    scope: "profile",
    question: "Which roles are in bounds for this profile?",
    evidence:
      "Champion, economic buyer, and validator stay suggestions until a grant or public-source mailbox exists.",
    inference:
      "Role lists do not authorize contact reveal or sending.",
    recommendation: "Plant champion and economic buyer (GM / VP Processing). Validator optional.",
    sortOrder: 12,
  },
  {
    questionId: "profile.signals",
    scope: "profile",
    question: "Which public signals count, and which sources are out of bounds?",
    evidence:
      "Only retrieved HTTPS pages. Tier 3 cannot qualify alone. Evidence older than 30 days is context unless reconfirmed.",
    inference:
      "The runner may suggest URLs; application code scores the retrieved page.",
    recommendation: "Company site, regulator, and named trade press. No scraped directories.",
    sortOrder: 13,
  },
  {
    questionId: "profile.geo",
    scope: "profile",
    question: "Which geographies and languages are in bounds?",
    evidence:
      "Outreach language and evidence geography must be confirmed. Out-of-bound regions are not hunted.",
    inference:
      "A global brand still needs an in-bound site language.",
    recommendation: "English-language operating plants. Other languages need a later play.",
    sortOrder: 14,
  },
  {
    questionId: "profile.schedule",
    scope: "profile",
    question: "When should this profile run, and in which timezone?",
    evidence:
      "The operating target is weekdays 06:00 America/Toronto. Greenfield does not get a morning run.",
    inference:
      "Scheduled hunts only fire when this profile is active and an xAI key is present.",
    recommendation: "Weekdays 06:00 America/Toronto. Manual Find Prospects remains available.",
    sortOrder: 15,
  },
  {
    questionId: "profile.compliance",
    scope: "profile",
    question: "What compliance acknowledgement is required before any send?",
    evidence:
      "Compliance guidance is advisory. The owner acknowledgement is a record, not a legal verdict.",
    inference:
      "No send without the acknowledgement on that exact message.",
    recommendation:
      "I acknowledge guidance is advisory. Suppression, digest, and sender checks still apply at send time.",
    sortOrder: 16,
  },
] as const;

export const PASS_RULE =
  "Pass at 7/10 only when pain and timing are both non-zero and no hard disqualifier applies.";

export function isProductScope(scope: string) {
  return scope === "company" || scope === "product";
}
