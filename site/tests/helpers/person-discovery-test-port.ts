import type { PersonDiscoveryPort } from "../../domain/person-discovery-port";

/** Test-owned fake capability. No production or app module imports this file. */
export function bindPersonDiscoveryTestPort(discover: PersonDiscoveryPort["discover"]): PersonDiscoveryPort {
  if (typeof discover !== "function") throw new TypeError("invalid_person_discovery_test_port");
  return Object.freeze({
    kind: "test_injected" as const,
    discover,
    [Symbol.for("prospector.person-discovery.test-port")]: true,
  }) as PersonDiscoveryPort;
}
