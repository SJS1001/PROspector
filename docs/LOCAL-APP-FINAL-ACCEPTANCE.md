# Personal local-use acceptance

**2026-10-28 decision:** the owner accepted personal local use by instruction and waived the remaining walkthrough. Use **App launcher → Start PROspector** for daily use. The steps below are optional future live-quality evaluation, not outstanding release requirements. Provider result quality and cost remain unmeasured. See the [launcher guide](../operator/launcher/README.md).

Use the integrated `main` local app; PRs #131 and #142 are merged. The owner subsequently completed the actual Mac reboot walkthrough, confirming the launcher, company/product, saved settings and search history. No restart-test step remains. Read the [current closeout](implementation-lanes/2026-10-29-local-release-closeout.md) for fresh verification and live-search limitations, and the [integration report](implementation-lanes/2026-10-28-local-integration.md) for earlier engineering evidence. Automated keyboard, narrow-screen, error-recovery, restart and archive checks do not need repeating by the owner.

1. **Start your private installation.** From the candidate checkout, with Node 22.13 or newer and `DATABASE_URL` unset:

   ```sh
   cd operator
   npm ci
   npm run build
   npm start
   ```

   No password is required. Open **http://127.0.0.1:8080**; the app creates and reuses your private local owner identity automatically. Use that exact address, without a proxy or tunnel. Stop with Ctrl-C and wait for exit before starting again. See the [runbook](../operator/README.md) for alternate data directories, recovery and optional password protection.

2. **Choose whether to evaluate live quality.** In **Settings → Connections & search settings → AI model**, privately choose the AI **Provider**, **Model id** and **API key**, set **Companies per search** to `4`, then **Save connections**. Do not paste credentials into an acceptance reply. Before starting provider work, explicitly choose your allowed provider/model, maximum discovery and hunt runs, provider-side cost ceiling and time window. Confirming the product starts a market search; confirming search settings starts a prospect search, so include both in those bounds. The app's monthly spend setting is not a guarantee of a provider billing ceiling. This checklist authorizes no agent to spend or send; configuration alone grants no such authority. If you defer bounded live use, mechanics can be accepted separately and real quality remains pending.

3. **Assess two useful daily workflows.** For the first, follow **Today → Company → Target markets → Searches → Prospect review → Contacts → Drafts & sending**. Review the product and search settings before confirming them, qualify companies against your actual needs, and use only **Find published contact details** for the initial contact route. Review the brief before approving it, then review the exact drafted message before acknowledging and approving that message. For the second workflow, reuse the saved company and search settings in a later session and choose one bounded manual run: **Find Prospects**, or **Run morning search** on Today. Avoid starting both merely to check the buttons.

   For each workflow, judge useful matches against a small sample you research yourself. Inspect source links, evidence dates and public contact provenance. Record useful/irrelevant results, unsupported claims, elapsed time and actual provider cost. Decide whether the results save you work. Keep personal records, exports and raw contact data private. **Settings → Prospect export → Download CRM CSV** provides the CRM handoff if useful.

4. **Optionally review an unsent Gmail draft.** Only after reviewing the exact recipient, subject and body, explicitly choose **Open in Gmail**. Inspect the compose window without sending. “Gmail requested · delivery unconfirmed” does not establish delivery. Gmail credentials and sending are unnecessary for this acceptance.

5. **Optionally build confidence with your own data.** Stop/restart and confirm your workspace is present. **Settings → Backup & restore → Download workspace backup** excludes credentials. For a complete backup including owner/vault material, stop the app and copy the entire private data directory to protected storage as described in the runbook. A destructive restore drill is not required from you again.

Reply without passwords, keys or contact records:

```text
Reviewed candidate commit:
Personal local use: accepted / not yet
Workflow 1 date and usefulness:
Workflow 2 date and usefulness:
Provenance/freshness findings:
Time saved and actual provider cost:
Live-use bounds used, or: not run; real quality pending
Remaining limitations / blockers:
```

The owner separately authorized final GitHub integration of PR #131 on 2026-10-28. Local-use acceptance does not approve a merge, deployment, email delivery, ongoing provider spend or hosted-plan completion.
