# Personal local-use acceptance

Use the unmerged `codex/local-app-integration` candidate. Read the [integration report](implementation-lanes/2026-10-28-local-integration.md) for the exact reviewed source and engineering evidence; pending checks are not passing evidence. This is the owner's practical usefulness decision. The automated keyboard, narrow-screen, error-recovery, restart and archive checks belong to engineering acceptance and do not need repeating by the owner.

1. **Start your private installation.** From the candidate checkout, with Node 22.13 or newer and `DATABASE_URL` unset:

   ```sh
   cd operator
   npm ci
   npm run owner:setup
   npm run build
   npm start
   ```

   Skip `owner:setup` if this data directory is already enrolled. For a new installation, choose a unique 16–128 character password at the hidden terminal prompt; keep it out of arguments, environment variables and chat. Open **http://127.0.0.1:8080** and unlock. Use that exact address, without a proxy or tunnel. Stop with Ctrl-C and wait for exit before starting again. See the [runbook](../operator/README.md) for alternate data directories and recovery.

2. **Choose whether to evaluate live quality.** In **Connections**, privately choose the AI **Provider**, **Model id** and **API key**, set **Accounts per hunt** to `4`, then **Save connections**. Do not paste credentials into an acceptance reply. Before starting provider work, explicitly choose your allowed provider/model, maximum discovery and hunt runs, provider-side cost ceiling and time window. Product activation queues discovery; profile activation queues a hunt, so include both in those bounds. The app's monthly spend setting is not a guarantee of a provider billing ceiling. This checklist authorizes no agent to spend or send; configuration alone grants no such authority. If you defer bounded live use, mechanics can be accepted separately and real quality remains pending.

3. **Assess two useful daily workflows.** For the first, follow **Home → Company interview → Markets → Audience / Likely buyer / Offer → Prospects → Review → People → Outreach**. Review the proposed product/profile before activation, qualify companies against your actual needs, and use only **Run public-source reveal** for the initial contact route. Review the package before approving it, then review the exact drafted message before acknowledging and approving that message. For the second workflow, reuse the saved company/profile in a later session and choose one bounded manual run: **Find Prospects**, or **Run morning prospects** in Morning Brief. Avoid starting both merely to check the buttons.

   For each workflow, judge useful matches against a small sample you research yourself. Inspect source links, evidence dates and public contact provenance. Record useful/irrelevant results, unsupported claims, elapsed time and actual provider cost. Decide whether the results save you work. Keep personal records, exports and raw contact data private. **Connections → Download CRM CSV** provides the CRM handoff if useful.

4. **Optionally review an unsent Gmail draft.** Only after reviewing the exact recipient, subject and body, explicitly choose **Open in Gmail**. Inspect the compose window without sending. “Handed off · delivery unconfirmed” does not establish delivery. Gmail credentials and sending are unnecessary for this acceptance.

5. **Optionally build confidence with your own data.** Stop/restart and confirm your workspace is present. **Connections → Download workspace backup** excludes credentials. For a complete backup including owner/vault material, stop the app and copy the entire private data directory to protected storage as described in the runbook. A destructive restore drill is not required from you again.

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

Merge approval is a separate decision for the exact final candidate and target PR. Local-use acceptance does not approve a merge, deployment, email delivery, ongoing provider spend or hosted-plan completion.
