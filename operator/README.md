# PROspector operator

Local go-to-market operator. One company workspace. Keys stay on this machine.

This is the running operator OS (interview → discovery → hunt → review → people → outreach → CRM). It is not the Cloudflare mining-pilot in `site/`.

## Run

```bash
cd operator
npm install
npm run dev
```

Open the app, sign in, then paste keys in **Connections**:

- xAI — discovery and Find Prospects
- Apollo — paid contact reveal (optional)
- Gmail address + app password — send (optional)
- Monthly spend cap — Apollo grants cannot exceed it

Load the mining sample from Company if you want Digitalrain / ONE / Operating already confirmed.

Desktop wrapper (after Electron is installed):

```bash
npx electron ./desktop/main.mjs
```

## What this does

- 16-question consensus interview
- Product ready → at most three market-play proposals
- Profile ready → Find Prospects
- Qualification in application code from retrieved pages
- Apollo grant with expiry and monthly cap, or public-source reveal
- Package then message then Gmail, with send-time suppression
- Reply / bounce / unsubscribe recorded by the owner
- CRM CSV and workspace JSON export/restore
- Greenfield Draft is nurture only — no morning run, no weekly quota
- Weekdays 06:00 America/Toronto hunt when an xAI key is saved

## What it is not

Cloudflare Access, D1, R2, and the hosted mining-pilot live in `site/`. This folder is the private operator you can run yourself.
