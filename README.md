# FIRE — Financial Intelligence & Recommendation Engine

A multi-agent AI financial advisor for Indian investors. Five specialist agents collaborate every session to analyze your portfolio, spending, taxes, and the market — and synthesize a consolidated, actionable briefing.

## Architecture

```
User → Chat UI → Advisor API → ContextBuilder
                                    ↓ reads from InsightStore + DB
                         ┌──────────┴──────────┐
                   Market    Accountant   Investment   Tax       Finance
                  Researcher              Manager     Analyst    Friend
                         └──────────┬──────────┘
                                Synthesizer
                                    ↓
                            InsightExtractor → InsightReview → InsightStore
```

All LLM calls go through `src/lib/ai-client.ts`, which invokes the **Claude Code CLI** as a subprocess. No API key is required — the app uses your existing authenticated Claude Code session.

## Agents

| Agent | Scope | Confidence |
|---|---|---|
| Market Researcher | Nifty 50, Sensex, S&P 500, RBI/Fed signals | Data-driven |
| Accountant | Bank statements, spending categories, savings rate | Based on your transactions |
| Investment Manager | Portfolio allocation, rebalancing signals | Based on your holdings |
| Tax Analyst | 80C/80D/LTCG/STCG, ITR deadlines, deductions | India-specific |
| Finance Friend | 1-2 speculative, high-risk ideas | Capped at 40 (always speculative) |

## Learning Architecture

Agents improve over time through a safe, reviewable pipeline:
- Candidate insights are extracted after each session
- Insights with confidence ≥ 70 and type `pattern`/`observation` are auto-promoted
- All others wait in a review queue (`GET /api/insights?userId=...&status=pending`)
- User can approve or reject via `POST /api/insights`
- Promoted insights are injected into future agent runs
- Core safety rules and guardrails are NOT modified at runtime

## Agent Skills Files

Each agent's system behavior is defined in markdown under `skills/`:
- `skills/market-researcher.md`
- `skills/accountant.md`
- `skills/investment-manager.md`
- `skills/tax-analyst.md`
- `skills/finance-friend.md`

These are loaded at runtime by `src/lib/advisor/skills/load-skill.ts`, with code-level fallback prompts to keep the app resilient if a file is missing.

## Prerequisites

- **Node.js 18+**
- **Claude Code CLI** installed and authenticated (`npm install -g @anthropic-ai/claude-code` then `claude` to log in)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file (no API keys needed)
cp .env.example .env

# 3. Set up the database
npx prisma migrate dev

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and create your profile to start.

## API Endpoints

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/advisor` | Run the FIRE advisor (main chat) |
| `GET` | `/api/advisor?userId=` | Get sessions or session messages |
| `POST` | `/api/profile` | Create a user profile |
| `PATCH` | `/api/profile?userId=` | Update profile |
| `POST` | `/api/profile?action=add-holding` | Add a holding |
| `POST` | `/api/upload?userId=` | Upload bank statement CSV |
| `GET` | `/api/insights?userId=&status=` | List insights (pending/approved) |
| `POST` | `/api/insights?userId=` | Approve or reject an insight |
| `GET` | `/api/admin/skills` | List editable skill files |
| `GET` | `/api/admin/skills?skillKey=` | Load one skill with revision history |
| `PUT` | `/api/admin/skills` | Save skill content + create a revision |
| `POST` | `/api/pipeline/run` | Single-call ingest + advisor run |

## Skills Admin UI

- Open `/admin/skills` to edit markdown skill files in-app.
- Every save creates a `SkillRevision` row in the database (with timestamp, summary, and editor).
- You can load any prior revision into the editor and re-save to roll back.

## One-Call Automation Endpoint

Use `POST /api/pipeline/run` to automate ingestion + analysis in a single request.

### JSON mode (no file upload)

```json
{
  "userId": "<USER_ID>",
  "message": "Give me a weekly briefing with top actions",
  "agents": ["accountant", "investment_manager"],
  "csvContent": "Date,Narration,Debit,Credit\n01/04/2026,UPI-FOOD,450,\n02/04/2026,SALARY,,150000"
}
```

### Multipart mode (file upload)

```bash
curl -X POST http://localhost:3000/api/pipeline/run \
  -F "userId=<USER_ID>" \
  -F "message=Give me a daily briefing" \
  -F "agents=[\"market_researcher\",\"accountant\",\"tax_analyst\"]" \
  -F "file=@/absolute/path/to/statement.csv"
```

Response includes:
- normal advisor output (`agentOutputs`, `synthesis`, `sessionId`, `messageId`)
- optional `ingestion` summary (`attempted`, `inserted`, `skipped`)

## CSV Upload

Supports most Indian bank CSV formats (HDFC, ICICI, Axis, SBI, Kotak). The parser auto-detects columns for date, narration, debit, credit. Transactions are categorized as `needs / wants / waste / investment / income / transfer` using Claude.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | SQLite file path, e.g. `file:./dev.db` |

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS v4**
- **Prisma v5** (SQLite for development, swappable to Postgres)
- **Claude Code CLI** (all LLM calls — agents, synthesis, categorization, insight extraction)
- **Zod** (strict schema validation for all agent outputs)
- **PapaParse** (CSV parsing)
