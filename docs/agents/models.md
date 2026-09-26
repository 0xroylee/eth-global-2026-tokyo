# Model routing

For the current contract SDK, quote, and frontend integration work, the user's latest explicit instruction selects `gpt-6-luna` at `xhigh` for implementation and `gpt-6-sol` at `high` for review. This task-specific choice supersedes older routing text in BP01 issue #2 and earlier project guidance. It does not change global settings or automatically apply to later tasks.

When an agent is assigned work, set its exact model and effort through the runtime controls when available. Give it a bounded responsibility, relevant files and interfaces, acceptance criteria, and applicable testing guidance. Agents share the codebase and must preserve others' changes.

Keep requested model IDs and effort levels exact. If the runtime cannot select a requested combination, report that limitation rather than silently substituting another model. Do not launch agents merely to use multiple models. Use delegation only when the user or applicable project instruction calls for it.
