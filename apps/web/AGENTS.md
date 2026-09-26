# Web app agent instructions

Read the root [AGENTS.md](../../AGENTS.md) first. This file adds rules specific to `apps/web`.

## Stack

Next.js App Router, React, TypeScript, Tailwind CSS 4 (PostCSS), direct viem. The game scene (Phaser) is planned as a client-only module. Architecture lives in the [technical specification](../../docs/technical-spec.md#frontend-architecture); sequencing in the [delivery plan](../../docs/delivery-plan.md); stack rationale in [frontend build research](../../docs/frontend-build-research.md).

## Local rules

- Consume generated ABIs, chain config, and viem operations from `@boss-pool/chain`. Do not hand-write ABIs or addresses in the app.
- Anything that touches `window`, an injected wallet provider, or a game engine is a Client Component (`"use client"`) and runs in effects or event handlers, never at module scope or during server rendering. Load Phaser with `next/dynamic` and `ssr: false`.
- Public round reads must render without a connected wallet.
- Derive damage, stage, HP, claim eligibility, and share from confirmed chain state. Show pending and "charging" feedback, but never apply game state from an unconfirmed transaction.
- Keep fixture data visibly labelled and separate from live data. Never show sample addresses, fake balances, or mock damage when a live read fails; show the not-deployed or error state instead.
- Design tokens live in `src/app/globals.css` under `@theme`. Prefer Tailwind utilities; keep custom CSS for game artwork and keyframes.
- Animate only `transform` and `opacity`. Honor `prefers-reduced-motion` by keeping opacity/color feedback and dropping movement.
- Art masters live in `public/images`. Game-ready exports (sprite sheets, boss forms, arena backgrounds) go in `public/game`.

## Verification

Run `bun run typecheck` and `bun run web:build` from the repo root. For browser checks, cover both the missing/unreachable deployment state and the live local state where a local chain is available. See [testing rules](../../docs/agents/testing.md).

Browser layout verification is desktop-only by default. Run mobile viewport or device-emulation checks only when the user explicitly requests mobile testing; older design-spec checklists do not override this rule.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
