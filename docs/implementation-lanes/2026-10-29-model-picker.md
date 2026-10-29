# Current provider model picker

Settings → Connections & search settings → AI model now loads a model dropdown
from the saved provider connection when opened. Refresh retrieves a new list;
selection remains explicit and Save connections persists it. Advanced retains
manual entry for custom endpoints and providers without an automatic list.
The existing dark UI is preserved.

The authenticated server function keeps credentials on the server, uses fixed
provider endpoints, refuses redirects, bounds time and pagination, and returns
safe errors without provider response bodies. Unsaved provider/key/workspace
changes disable the list until saved. Anthropic pagination and workspace headers
are supported. Known non-chat/retired models are filtered; catalog availability
does not guarantee a model supports every app feature.

## Verification

- Production build and typecheck passed; lint has no errors and three existing
  warnings. All 343 operator tests passed (279 script + 64 source tests).
- An initial full test run refused the occupied owner-app port. Stopped the
  app through its installed controller, reran successfully, then started it.
- Catalog tests cover headers, fixed destinations, pagination, deduplication,
  filtering, unsupported providers, and safe failure messages.
- React Doctor scanned all five changed source/test files: no issues reported.
- Live Anthropic connection returned 14 models. Verified selection, refresh,
  keyboard focus, and hiding the list for an unsaved provider switch.
- Replaced the owner's mistyped `claude sonnet 5.5` with the returned
  `claude-sonnet-5-5`, saved and verified persistence after page reload.

Only Anthropic was checked against a live provider. Other supported providers
use their standard model-list endpoint; custom and Perplexity retain manual
entry. No generation request or successful first prospect search is claimed.
The local app is running with this build. No hosted deployment or PR merge.
