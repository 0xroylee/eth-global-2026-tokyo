# Implementation rules

## Find an existing solution first

Before writing a new component, check the repository, installed dependencies, and relevant official examples or maintained packages. Stop searching when a suitable solution covers the requirement.

Prefer, in order:

1. Existing project code or an installed dependency.
2. Native platform or standard-library functionality.
3. A maintained library, official starter, or reference implementation with a small adaptation.
4. Custom code for the remaining product-specific behavior.

Before adopting external code, check compatibility, license, maintenance, and the trust boundary it introduces. In the issue or PR, briefly identify what was reused. For a custom implementation, identify the concrete gap that existing options do not cover. A new research document or approval step is not required.

For Boss Pool, inspect official v4 hook, router, settlement, and deployment examples before writing equivalents. Use established ERC-20/ERC-721 implementations and viem utilities. Keep custom work focused on attack authorization, burn accounting, stage rules, contribution, rewards, and the game UI. Verify what can be reused before assuming the planned dedicated router must be written from scratch.

Implement the current core feature. Add a dependency only when it reduces the work and complexity needed now. Create an abstraction, service, or framework only when the current implementation requires it.

## Split agent instructions by scope

Keep the root `AGENTS.md` as a short entry point with project-wide rules and links that say when to read each guide.

Keep shared process guidance in focused files under `docs/agents/`. When an implemented directory needs its own rules, add an `AGENTS.md` in that directory. Read the applicable directory instructions before editing its files, including when working from the repository root.

Each rule has one authoritative home. Link to it instead of copying it into every agent file. Keep product specifications, architecture, and issue checklists outside agent instructions. Do not create empty module directories or instruction stubs for hypothetical future work.
