# FIRE Agent Rules

This repository is a personal finance intelligence app for Indian investors.
When modifying code, optimize for financial correctness, data safety, and actionable user output.

## Product Intent

- Keep FIRE focused on practical recommendations: spending insights, portfolio allocation, tax-aware nudges, and explicit next actions.
- Preserve the multi-agent architecture and skill-driven prompting model under `skills/` and `src/lib/advisor/`.
- Favor clear user-facing language over verbose implementation details in assistant outputs.

## Core Data and Safety Rules

- Never fabricate holdings, transactions, prices, or tax details. If data is missing, call it out explicitly.
- Treat user uploads and memory as source-of-truth inputs; avoid destructive behavior that discards prior user memory unless explicitly requested.
- Maintain idempotent ingestion behavior (duplicate detection and safe inserts) for transaction/document upload flows.
- Keep financial values in INR formatting (`₹`) in user-facing text where relevant.
- For tax advice, include a CA/qualified professional caveat for final decisions.
- For speculative ideas, lead with a risk disclaimer.

## Recommendation Quality Rules

- Prefer allocation and risk management guidance over stock-picking when concentration risk is high.
- Distinguish between:
  - direct holdings data (DB-backed),
  - inferred estimates (clearly labeled),
  - missing inputs (ask concise follow-ups only when needed).
- Recommend incremental, implementable actions (what to buy/sell/rebalance next) rather than generic education.
- Avoid repeating stale advice when fresh uploaded docs or memory indicate updated context.

## API and Persistence Conventions

- Keep route handlers in `src/app/api/**/route.ts` thin and deterministic; move parsing/logic to `src/lib/**` when complexity grows.
- Validate all external/LLM-shaped data through existing schema layers and typed structures.
- Preserve Prisma model semantics in `prisma/schema.prisma`; prefer additive migrations over destructive changes.
- Do not silently change storage keys in `UserMemory` (e.g., `uploaded_files`, `docs_portfolio`) without coordinated code updates.

## Testing and Verification

- After meaningful code changes, run targeted tests first (`npm run test:run` or focused test file) before broader checks.
- Run linting for touched areas and resolve newly introduced issues.
- For ingestion/recommendation changes, sanity-check with realistic user scenarios:
  - empty holdings,
  - duplicate uploads,
  - mixed assets (equity/index/commodity/debt),
  - moderate vs aggressive risk profiles.

## Next.js Version Guardrail

- This project uses Next.js 16+ and React 19. Before changing framework-sensitive behavior, consult the relevant docs under `node_modules/next/dist/docs/` for the exact feature area being touched.
