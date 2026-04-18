# Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.4.0] - 2026-04-18

Full audit pass (Phases 01–07). Addresses every critical, high, and medium
finding from the code review. 85 tests passing (up from 65).

### Fixed (post-merge review)
- Timezone mismatch: tracker persisted events under the user's local date, but aggregate listed directories with UTC dates. On UTC+N timezones, events between midnight-local and midnight-UTC were invisible to the report until the following day. Tracker now uses `new Date().toISOString().slice(0,10)` consistently with aggregate. Affected: `hooks/tracker.js`, `test/unit/tracker.test.js`, `test/unit/status.test.js`, `test/security/security.test.js`, `test/e2e/concurrency.test.js`.
- Report footer copy clarified: `100% local por defecto · capa LLM opt-in` (the previous wording implied unconditional locality, which contradicted the optional `lib/llm-insights.js` HTTPS calls when `api-keys.yaml` is present).
- README synced with v0.4.0 reality: architecture diagram reflects `lib/insights/` split + `lib/utils/` + new modules; tests count updated 65 → 85; roadmap moved forward.

### Security
- Escape all user-controlled fields in insight cards with `esc()` to prevent XSS chained with prompt injection (FINDING-001)
- Add SRI `integrity` hash to Chart.js CDN `<script>` tag to prevent supply-chain tampering (SEC-006)
- Gate all verbose `console.log` output behind `NEXTGENAI_DEBUG=1` flag to prevent path/username leakage in logs (SEC-002)
- Enforce `0700` permissions on data directory and all subdirectories at install time (SEC-003)
- Backup `settings.json` before mutation; abort install on malformed JSON instead of silently overwriting (SEC-004)
- Filter `__proto__`, `constructor`, `prototype` keys in aggregator to prevent prototype pollution (SEC-005)
- Validate `goalsPath` stays within `cwd` before reading to prevent path traversal (SEC-007)

### Performance
- Truncate hash input to 8 KB and bail out early for excluded tools (`TodoWrite`) to cut tracker overhead (FINDING-002)
- Write one JSONL file per session (`events/YYYY-MM-DD/<session_id>.jsonl`) to eliminate concurrent-append race condition (PERF-002)
- Stream JSONL events with `readline` instead of `readFileSync` + `split('\n')` to avoid blocking the event loop on large files (PERF-004)
- Rotate legacy `YYYY-MM-DD.jsonl` files to per-session layout on first use (backwards-compatible)

### Architecture
- Introduce `lib/config.js` as single source of truth for all paths, `VERSION`, and debug flag (ARCH-001)
- Read `VERSION` from `package.json` — no more hardcoded version strings across 7+ files (ARCH-002)
- Split 364-LOC `lib/insights.js` god file into `lib/insights/` submodules: `derived`, `rules`, `history`, `index` (ARCH-004)
- Extract duplicated fs / stdin / YAML helpers into `lib/utils/` (fs-utils, stdin, yaml) (ARCH-006)
- Replace `execFileSync('node', [AGGREGATE_PATH])` subprocess spawns in `render.js` with direct `require()` calls — saves 250–400 ms per report (ARCH-005)
- Integrate LLM insights layer into `render.js` pipeline; renders gracefully with warning card when LLM is unavailable (ARCH-007)

### Added
- `lib/migrate.js` — on-the-fly v0 → v1 event migration applied transparently during aggregation (OPS-007)
- `lib/prune.js` — retention-policy command, prunes `events/YYYY-MM-DD/` directories older than N days (PERF-009)
- `lib/export.js` — portable HTML report export for remote/SSH sessions (DA-003)
- `writeError()` in tracker writes failures to `errors.jsonl`; `status.js` surfaces error count and last message (OPS-004)
- `lib/insights-catalog.json` — `rationale` field on every rule explaining calibration origin of threshold values (ARCH-002)

### Testing
- `test/unit/render-xss.test.js` — regression: insight cards with `<script>` tags must be escaped in rendered HTML
- `test/unit/llm-insights.test.js` — unit coverage for `loadApiConfig`, `buildPromptPayload`, `parseModelResponse`, weekly cache
- `test/unit/status.test.js` — counting, CRLF tolerance, version reporting, last-report path
- `test/unit/config.test.js` — `CLAUDE_USAGE_DATA_DIR` env override, VERSION from package.json
- `test/unit/migrate.test.js` — v0 → v1 migration correctness and idempotency
- `test/e2e/concurrency.test.js` — 3 sessions × 20 events of 5 KB confirm all 60 JSONL lines are preserved

### DevOps
- `.github/workflows/ci.yml` — matrix CI on Node 18/20/22 + Windows; gitleaks secret scanner on every PR (OPS-001, OPS-011)
- `CONTRIBUTING.md` — dev setup, test instructions, commit conventions (OPS-008)
- `docs/SCHEMA.md` — events.jsonl schema reference with field descriptions
- `docs/audits/` — complete 7-phase audit plan for future reference (00-index through 07-code-quality)

## [0.2.0] - 2026-04-15

Initial public release.
- Hook-based tracker recording tool calls, session IDs, and cwd without storing content
- Weekly HTML report with Chart.js charts and deterministic insight cards
- `install.js` / `uninstall.js` for zero-dependency setup
- 65 unit, e2e, and security tests
