# Implementation model routing

Use these exact model and reasoning-effort combinations for implementation:

| Work | Model | Reasoning effort |
| --- | --- | --- |
| Contracts, v4 settlement, custody, shared state, difficult debugging, or changes across multiple layers | `gpt-6-sol` | `high` |
| Bounded UI/game presentation, straightforward viem wiring, scripts, or documentation after interfaces and behavior are clear | `gpt-6-luna` | `xhigh` |

Default to Sol high when the implementation boundary or correctness requirements are unclear. Move a blocked Luna task to Sol high when it needs broader reasoning. This routing does not change the two teammates' ownership of their work.

When assigning an implementation task, set both the model and effort explicitly through the available runtime controls. Give the worker a bounded responsibility, relevant files and interfaces, acceptance criteria, and the applicable testing guide. Workers share the codebase and must preserve others' changes.

Keep the exact requested model IDs and effort levels. If the runtime cannot select a requested combination, report that limitation instead of silently substituting another model. Do not launch agents merely to use both models.

This file sets repository policy for future implementation. It does not itself change the model of a running task or global Codex settings.
