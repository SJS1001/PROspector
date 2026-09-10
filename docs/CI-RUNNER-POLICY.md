# CI runner policy

PROspector CI may execute only in either of these environments:

- a repository-controlled, self-hosted local runner; or
- an explicitly approved cloud execution environment outside GitHub Actions,
  such as a Codex cloud task.

GitHub-hosted Actions runners are prohibited. This includes Ubuntu, Windows,
and macOS GitHub runner labels, `*-latest` labels, and dynamic `runs-on`
expressions that do not statically bind the job to `self-hosted`. Cost, trust,
and execution authority must never silently shift to GitHub-hosted compute.

This policy does not authorize registering a runner, changing repository or
organization settings, adding credentials, provisioning infrastructure, or
enabling a workflow. Those remain separate owner-controlled actions.

## Repository enforcement

The repository intentionally contains no workflow whose enforcement depends on
a GitHub-hosted runner. Before committing any change under
`.github/workflows/`, run:

```bash
npm ci --ignore-scripts
node scripts/verify-ci-runner-policy.mjs
node --test tests/ci-runner-policy.test.mjs
```

The verifier examines every `runs-on` declaration in `.github/workflows/*.yml`
and `.yaml` by parsing the YAML structure. Each job must declare a static
literal label or label list containing the exact `self-hosted` label. Known
GitHub-hosted labels are rejected even when mixed with `self-hosted`.
Expressions, matrices, inputs, format calls, YAML aliases/anchors, escaped
labels, and other dynamic constructs fail closed. Reusable-workflow jobs are
prohibited because their complete runner-selection chain is not locally
provable by this verifier.

Approved non-GitHub cloud CI should invoke the same verifier directly from its
own execution configuration. Do not add a GitHub Actions workflow merely to run
the policy check.
