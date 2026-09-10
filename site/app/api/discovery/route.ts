import { env } from "cloudflare:workers";
import { isLocalDemoRequest, runtimeIdentity } from "../../runtime-identity";
import { LOCAL_SYNTHETIC_RELEASE_EVIDENCE, parseReleaseEvidenceConfig } from "../../../domain/release-evidence";
import {
  handleDiscoveryGet,
  handleDiscoveryPost,
  type DiscoveryHandlerDependencies,
} from "../../../domain/discovery-handler";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleDiscoveryGet(request, dependencies(request));
}

export async function POST(request: Request) {
  return handleDiscoveryPost(request, dependencies(request));
}

function dependencies(request: Request): DiscoveryHandlerDependencies {
  const bindings = env as unknown as {
    DB?: D1Database;
    OWNER_SUBJECT_PEPPER?: string;
    PILOT_OWNER_EMAIL?: string;
    TRUSTED_IDENTITY_PROVIDER?: string;
    LOCAL_DEMO?: string;
    CLOUDFLARE_ACCESS_ISSUER?: string;
    CLOUDFLARE_ACCESS_AUDIENCE?: string;
    PROSPECTOR_RELEASE_SOURCE_SHA?: string;
    PROSPECTOR_RELEASE_MIGRATION_IDENTITY?: string;
    PROSPECTOR_RELEASE_MIGRATION_DIGEST?: string;
    PROSPECTOR_RELEASE_FIXTURE_DIGEST?: string;
    PROSPECTOR_RELEASE_FIXTURE_PROVENANCE?: string;
  };
  if (!bindings.DB || !bindings.OWNER_SUBJECT_PEPPER || !bindings.PILOT_OWNER_EMAIL)
    throw new Error("Secure discovery bindings are unavailable");
  const localDemo = isLocalDemoRequest(request, bindings);
  return {
    database: bindings.DB,
    subjectPepper: bindings.OWNER_SUBJECT_PEPPER,
    pilotOwnerEmail: bindings.PILOT_OWNER_EMAIL,
    // The synthetic release tuple is available only behind the complete local
    // demo fence.  Every other request still parses (and therefore requires)
    // the hosted release bindings before it can reach the domain.
    releaseEvidence: localDemo
      ? LOCAL_SYNTHETIC_RELEASE_EVIDENCE
      : parseReleaseEvidenceConfig({
          sourceRevision: bindings.PROSPECTOR_RELEASE_SOURCE_SHA,
          migrationIdentity: bindings.PROSPECTOR_RELEASE_MIGRATION_IDENTITY,
          migrationDigest: bindings.PROSPECTOR_RELEASE_MIGRATION_DIGEST,
          fixtureDigest: bindings.PROSPECTOR_RELEASE_FIXTURE_DIGEST,
          fixtureProvenance: bindings.PROSPECTOR_RELEASE_FIXTURE_PROVENANCE,
        }),
    csrfCookieMode: localDemo ? "local-demo" : "secure",
    getIdentity: async () => {
      return runtimeIdentity(request, bindings);
    },
  };
}
