# Three UI/UX revisions — 2026-10-29

Implemented in the installed local operator checkout, from main at
`1aa74bdbf019cd6630b2cfa67ddfa2e4eb991b11`.

## 1. Flow and content

- Today gives the next action visual priority; recent work starts collapsed.
- Search settings contain the long target-market description. Completed search
  stages and counts collapse; results, JEV contribution and failures remain visible.
- Prospect cards show shorter problem summaries. Opening a record shows the problem,
  possible product fit and next question first. Company background and decision/data
  details are expandable; source links stay in Sources.
- An empty filter offers a reset. A genuinely empty workspace explains where to start.

## 2. Visual hierarchy

- Preserved the dark grayscale palette, with brighter secondary text for contrast.
- Added a stronger active navigation marker, consistent action links, quieter card
  links and filter buttons, refined headings, spacing and subtle surface depth.
- Desktop navigation stays available while scrolling. Content width is bounded on
  wide screens; the main action stacks cleanly on small screens.

## 3. Usability and verification

- Removed nested buttons inside navigation links across Company, Markets, Searches,
  Contacts and Outreach. Links now have one keyboard stop and a visible focus ring.
- Improved focus scrolling around the sticky header; selected filters expose their
  pressed state. Today’s accessible action name includes its visible Continue label.
- Repaired two stale keyboard-test assumptions: restore wording and a missing
  plain-language module mock. All seven component-focus checks pass.

Verification on Node 24.16.0:

- `npm test`: 295 script tests + 67 source tests passed, zero failures/skips.
- `npm run typecheck` and `npm run build`: passed.
- `npm run lint`: zero errors; three existing unused-variable warnings in qualify.ts
  and fns.ts.
- Contained browser workflow: PASS; 46 harness units, two fictional workflows,
  554 keyboard actions, 306 layout checks, ten cancellation cases, four recovery
  scenarios and managed restart. Zero unexpected requests or forbidden provider
  attempts; both compose requests aborted. See the updated acceptance evidence.
- Final production rebuild and owner-data visual review covered Today, Company,
  Searches, prospect detail and Settings. Today and prospect detail were also
  inspected at 360px; prospect detail had no horizontal overflow. Temporary viewport
  overrides were reset. App launcher reports Running on this Mac.

The final empty-workspace wording/conditional reset and Today accessible-name change
were made after the contained browser run, then included in the passing production
rebuild. Today was visually inspected afterward. The full workflow was not repeated
for these two presentation-only changes.

The first regression attempt overlapped a production build and failed when build
output disappeared. The complete test command was rerun serially and passed.

These revisions do not change saved answers, provider configuration, scoring or
approval behavior. No live provider search, outreach or intentional owner-data edit
was performed. Fictional workflow tests do not establish real-provider result quality,
email delivery, assistive-technology coverage or owner design acceptance.
