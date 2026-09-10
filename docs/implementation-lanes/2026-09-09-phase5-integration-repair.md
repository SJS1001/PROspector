# Phase 5 merged-integration repair record

**Status:** local repair evidence only; Plans 05-07 and 05-08 remain incomplete

PR #93 merged a stronger synthetic Plan 05-08 integration harness, but that
merge did not satisfy its prerequisite Plan 05-07. The production Contacts
route still constructs no `commandService`, enrichment operation, or contact
provider port. It therefore remains read-only/reject-only for those commands,
and the Plan 05-07 grant/run and identity-decision mutations are not reachable
from HTTP. No `05-07-SUMMARY.md` or `05-08-SUMMARY.md` exists or is warranted.

This repair closes local test and repository-integrity gaps found after that
merge:

- retained suppression lineage is accepted only when its canonical retention,
  decision edge, lineage ID/digest, and actual live identity digests named by
  that decision agree;
- adversarial invalid-lineage and unrelated-contact digests fail closed;
- stale quote/contact, configuration mismatch/currentness/drift,
  disqualification, and suppression denials assert zero additional fake calls
  and zero unauthorized durable or later-phase mutation; and
- static production-source and loaded-module-graph checks prove that the legacy
  Python MCP adapter is not reachable from the JavaScript routes/domain graph.

All fixtures remain fictional and local. This record grants no provider,
credential, hosted, production-data, persistence, export, package, call, send,
or other external-effect authority. Plan 05-08 still depends on genuinely
completed Plan 05-07 and still requires its own full local quality gate before
any completion summary could be created.
