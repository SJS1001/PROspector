# ONE for Mining — Security & Integration One-Pager

*For the OT/Controls engineer, IT security and CISO. Purpose: clear the security review early so it doesn't stall the deal. Paste into your branded template; have engineering confirm every line is accurate for your actual deployment before sharing.*

---

## How ONE connects

**Read-only by default.** ONE reads from your existing sources; it does not write to, command, or actuate control systems. It surfaces recommendations, alerts and draft tasks for a human to action in your systems of record.

**Over a segmented OT/IT link.** Connectivity runs across a segmented boundary between the OT (process control) network and IT, consistent with a Purdue-model / DMZ approach. No direct exposure of control-layer devices.

**Your data stays yours.** Client data, and the models trained on it, remain client-owned. [State residency/hosting: e.g. deployed in client environment / region-pinned cloud tenant — confirm your actual architecture.]

## What ONE connects to

| Live today | Ingested | Roadmap |
|---|---|---|
| Grafana; XLedger inventory & maintenance | Sensors, lab, tags, OEM, ERP | SCADA, historian, CMMS |

*Roadmap items are never presented as live.*

## Security posture (confirm each against your deployment)

- **Access:** least-privilege, read-only service accounts; [SSO/SAML]; role-based access in ONE.
- **Encryption:** in transit ([TLS 1.2+]) and at rest ([AES-256]).
- **Network:** segmented OT/IT connection; [outbound-only / no inbound to OT]; [IP allow-listing].
- **Data ownership:** client owns source data and trained models; [retention & deletion policy]; export on request.
- **Auditability:** [access logs / audit trail].
- **Compliance / certifications:** [SOC 2 / ISO 27001 status — state real status or "in progress / roadmap"; do not claim certifications you don't hold].
- **Deployment options:** [client-hosted / private cloud tenant / on-prem — list what you actually offer].

## What ONE does NOT do
- Does not write to or control OT/SCADA/PLC systems.
- Does not take autonomous action — recommendations require a human to act. (Agentic workflows are roadmap; the core is hardened before anything acts on its own.)
- Does not move client data outside the agreed environment or train shared/cross-client models on your data.

## The team
Built by engineers with backgrounds in aerospace and maritime reliability systems (condition monitoring, digital twins) — environments with stringent safety and security expectations. *(Team background; not affiliated with or endorsed by any former employer.)*

> Questions for your security team? → [security contact] · hello@digitalrain.ai

---
**Accuracy note (internal, delete before sharing):** every bracketed item is a real control you must confirm with engineering. Do not assert TLS versions, encryption, SSO, SOC 2/ISO, or hosting model unless they are true today. Overstating security is the fastest way to lose a technical buyer's trust — and a compliance risk.
