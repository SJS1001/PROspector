# PROspector operator

Local go-to-market operator. One company workspace. Keys stay on this machine.

This is the running operator OS (interview → discovery → hunt → review → people → outreach → CRM). It is not the Cloudflare mining-pilot in `site/`.

## Use it on your computer

You need [Node.js 22](https://nodejs.org/) (LTS). Then, in a terminal:

```bash
git clone https://github.com/SJS1001/PROspector.git
cd PROspector
git checkout operator-os
cd operator
npm install
```

**Easiest (browser window):**

```bash
npm run dev
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080), sign in, then paste keys in **Connections**.

**Desktop window (Electron):**

```bash
npx --yes electron ./desktop/main.mjs
```

That starts the same app in a PROspector window. There is not a `.dmg` / `.exe` installer yet — this is a local Node app, not an App Store package.

### Keys to paste in Connections

| Field | What it does |
|---|---|
| AI provider + key | Discovery and Find Prospects (Grok / OpenAI / others) |
| Jev (TypeSafe) | Scores retrieved pages, classifies inbox, blocks invented claims |
| Apollo | Paid people reveal (still needs a per-prospect grant) |
| Gmail + app password | Send and inbox scan |
| Monthly spend cap | Apollo grants cannot exceed it |

Load the mining sample from Company if you want Digitalrain / ONE / Operating already confirmed.

## What this does

- 16-question consensus interview
- Product ready → at most three market-play proposals
- Profile ready → Find Prospects
- Qualification from retrieved pages (keyword rubric + Jev when a key is saved)
- Apollo grant with expiry and monthly cap, or public-source reveal
- Package then message then Gmail, with send-time suppression
- Reply / bounce / unsubscribe from the Gmail inbox
- CRM CSV and workspace JSON export/restore
- Greenfield Draft is nurture only — no morning run, no weekly quota
- Weekdays 06:00 America/Toronto hunt when an AI key is saved and the schedule is on

## What it is not

Cloudflare Access, D1, R2, and the hosted mining-pilot live in `site/`. This folder is the private operator you run yourself. Jev does not search the web or send mail.
