import * as authority from "../../domain/enrichment-authority";
import * as contactEvidence from "../../domain/contact-evidence";
import * as contactSettlementAttestor from "../../domain/contact-settlement-attestor";
import * as operation from "../../domain/enrichment-operation";
import * as persistence from "../../domain/enrichment-repository";
import * as providerPort from "../../domain/contact-provider-port";
import * as issuance from "../../domain/enrichment-grant-issuance";

// A single SSR entry preserves the module-scoped authority brands used by the
// real composition while tests exercise the runtime JavaScript graph.
export { authority, contactEvidence, contactSettlementAttestor, issuance, operation, persistence, providerPort };
