# Boss Pool agent instructions

Keep this file short. Read the applicable guide before starting work:

- Before implementing a feature, choosing a dependency, or creating agent instructions, read [implementation rules](docs/agents/implementation.md).
- Before adding or running tests, read [testing rules](docs/agents/testing.md).
- Before starting or assigning implementation, read [model routing](docs/agents/models.md).

These guides govern implementation and verification. Earlier issue test lists describe risks to cover; they do not require a separate test for every item.

Read [CONTEXT.md](CONTEXT.md) for domain terms. For product behavior, consult [requirements](docs/requirements.md); for supply, locks, and liquidity, read [economy](docs/economy.md). The [technical specification](docs/technical-spec.md) owns monorepo boundaries, interfaces, and accounting. Keep feature details in those documents.

<!-- CODEGRAPH_START -->
## CodeGraph

- When CodeGraph is available and indexed, prefer it for symbol definitions, callers, dependencies, and impact analysis. Use native search for literal text.
- Answer structural questions directly from the index; avoid delegating duplicate exploration. Choose focused context or batch source retrieval according to the question.
- Reuse adequate results. Inspect source when results are missing, inconsistent, or potentially stale after edits.
- If CodeGraph is unavailable or uninitialized, continue with native search and file reads. Ask about initialization only when indexing is needed to complete the task and existing authorization does not cover it.
<!-- CODEGRAPH_END -->

## Design simplification

When evaluating redundant design, remove one element at a time and keep the removal when required behavior and quality are preserved.
