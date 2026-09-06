# Generic company onboarding

The onboarding path is deliberately a guarded local-demo capability. A blank, admitted local-demo owner enters a Company and the first Product; the server writes the workspace, Company link, Product, open Company interview session, authority command, and audit event in one D1 batch. Reads never create or seed data. The legacy Digitalrain/ONE/Mining initializer remains an explicit test/example helper and is not called by runtime reads.

The resumable stages are Company + Product, first Market Play, first Customer Profile, then the owner-confirmed consensus interview. A Customer Profile is not usable merely because its row exists: onboarding is complete only when that exact Profile has a current confirmed `fit` Knowledge Version. Further Products remain siblings under the single Company.

Local onboarding mutations require every existing owner, CSRF, bounded-body, and same-origin check plus all of: `LOCAL_DEMO=1`, the local-demo identity provider, Vite development mode, a loopback request host, and an Origin exactly equal to the request origin. Hosted and production paths remain fail-closed behind the Phase 2 activation gate. Onboarding performs no discovery, prospecting, export, provider, credential, schedule, paid, or outbound effect.
