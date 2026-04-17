# AI Agents Contributing Guide

This file provides guidance to AI Agents when working with code in this repository.

## Project

Atlassian Bridge (`@ai-foundry/atlassian-bridge`) -- a CLI for managing Jira and Confluence from the command line. Hand-rolled command framework with Zod as the only runtime dependency.

## Commands

| Command       | Description                   |
| ------------- | ----------------------------- |
| `pnpm dev`    | Run CLI in dev mode (tsx)     |
| `pnpm build`  | Compile TypeScript to `dist/` |
| `pnpm test`   | Run all tests once            |
| `pnpm lint`   | Lint with ESLint              |
| `pnpm format` | Format with Prettier          |

Run a single test file: `pnpm vitest run tests/path/to/file.test.ts`
Run a single test by name: `pnpm vitest run -t "test name"`

## Architecture

See `docs/cli-architecture.md` for the full CLI framework design.

## Code Style

- **Node:** >=24 (pinned 24.14.0 in `.node-version`), ESM (`"type": "module"`)
- **TypeScript:** Strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`
- **Imports:** Use `import type` for type-only imports (enforced). Use `.js` extensions in relative imports (NodeNext resolution).
- **Prettier:** Single quotes, 140 char width, no trailing commas
- **Unused variables:** Prefix with `_`
- **No barrel files:** Import directly from the source module, not through `index.ts` re-exports

## Testing

- Vitest, tests in `tests/` mirroring `src/` structure
- AAA pattern (Arrange, Act, Assert)
- Structure: top-level `describe` per file, nested `describe` per function, `it` blocks for cases

## Commits

Format: `<type>(<scope?>): <gitmoji> <summary>`

Types and emoji: `feat` ✨ | `refactor` ♻️ | `fix` 🐛 | `docs` 📝 | `test` ✅ | `chore` 🔧

Imperative mood, max 72 chars, no trailing period. See `.github/commit-instructions.md` for full details.
