# Trade Catalyst / Trading Performance Analyzer — App Audit

**Audit scope:** read-only repository review at `2a2249e` on `main`; no application, configuration, database, or deployment changes were made. The only created file is this report. Findings describe checked-in code, not the deployed Supabase project or a live browser session. **FACT** means directly supported by repository content or commands; **UNVERIFIED** means runtime, deployed configuration, or external-provider behavior could not be established from this checkout.

## Executive summary

1. Phase 1 — Foundation: **75%**; signed-in trade journal, analytics, and charting exist, but the central app remains large and has sparse page-level tests (`src/App.jsx`, `src/components/Analytics.jsx`; `npm test -- --run`).
2. Phase 2 — Historical pipeline: **85%**; authenticated Massive Edge Function and chart consumers exist; deployed secrets/data availability are **UNVERIFIED** (`supabase/functions/historical-data/index.ts`, `src/services/historicalDataService.js`).
3. Phase 3 — Screenshot vision: **80%**; authenticated extraction and manual review flow exist; real provider execution is **UNVERIFIED** (`supabase/functions/screenshot-vision/index.ts`, `src/components/ScreenshotTradeWorkflow.jsx`).
4. Phase 4 — Canonical models: **65%**; trade/strategy/backtest models and additive migrations exist, but no base `trades` DDL is checked in (`src/models/`, `supabase/migrations/`).
5. Phase 5 — Strategy/backtesting: **75%**; versioned strategies and persisted backtest results exist; the engine's actual entry rule is only SMA crossover (`src/components/StrategyLab.jsx`, `src/services/backtestEngine.js`).
6. Phase 6 — Market intelligence: **15%**; TradingView and historical charts exist, but overview market fields are empty and event/sentiment pages are hardcoded (`src/components/DayTradingDashboard.jsx`, `src/components/EconomicCalendar.jsx`, `src/components/MarketSentiment.jsx`).
7. Phase 7 — Behavioral intelligence: **70%**; journal-based statistics and coaching analysis exist; conclusions depend on recorded sample quality and do not have broad UI test coverage (`src/services/coachingAnalysis.js`, `src/services/coachContext.js`).
8. Phase 8 — AI decision support: **75%**; authenticated OpenAI coach and screenshot analysis paths exist, but keys/deploy state and live outputs are **UNVERIFIED** (`supabase/functions/coach-chat/index.ts`, `supabase/functions/screenshot-vision/index.ts`).
9. **Top 5 strengths:** durable journal flows; additive trade-field migrations; authenticated Massive historical-data proxy; versioned strategy/backtest core; constrained Coach/screenshot workflows (`src/App.jsx`, `supabase/functions/`, `src/services/backtestEngine.js`).
10. **Top 5 risks:** static market feeds presented as current; empty Investing product; unknown deployed `trades` RLS; no visible historical/screenshot endpoint quota; oversized central files and sparse page tests (`src/components/TickerBar.jsx`, `src/components/EconomicCalendar.jsx`, `supabase/migrations/`, `src/App.jsx`).

## Audit commands and repository metrics

| Check | Result | Evidence |
|---|---|---|
| Commit count | **69** commits reachable from `HEAD`; audited revision `2a2249e` | `git rev-list --count HEAD`; `git log -1 --format='%h %s'` |
| Working tree | Clean before report creation | `git status --short` |
| Tests | **47 test files, 290 tests passed**; no skips reported | `npm test -- --run` (run at 08:14 UTC, 2026-10-13) |
| Production build | Passed; Vite transformed 958 modules | `npm run build` |
| Largest emitted JS chunks | `index` 447.59 kB; `CategoricalChart` 270.78 kB; `CoachingChat` 195.34 kB; `backtestResult` 180.06 kB; `DayTradingDashboard` 98.10 kB | `npm run build` output |
| Lint | Passed, no diagnostics | `npm run lint` |
| Source line counts | `src/` top-level files 10,776; `src/components/` 11,040; `src/services/` 6,047; `src/models/` 501; `supabase/functions/` descendants: coach-chat 1,185, screenshot-vision 835, historical-data 223, shared 40; migrations 272 | `find ... -print0 \| xargs -0 wc -l` grouped by containing directory; includes tests/styles where present |
| Large files | `src/App.css` 8,275 lines; `src/App.jsx` 2,092; `src/components/StrategyLab.css` 1,264; `src/components/CoachingChat.css` 1,064; `src/components/CoachingChat.jsx` 878; `src/components/TradingWorkspaces.css` 837; `src/components/StrategyLab.jsx` 823 | `wc -l` |
| Test layout | 47 test files, across Auth, Chart, Coaching, Journal, Strategy Workspace, Trade Chart/Log, TradingView, models, services, and Edge Function helpers | `find . -name '*.test.*'`; `npm test -- --run` |
| GitHub Actions | One workflow, deploys Supabase Edge Functions on matching `main` pushes or manual dispatch; no CI test/build workflow found | `.github/workflows/deploy-functions.yml`, `.github/workflows/` |
| Vercel/CSP config | `vercel.json` absent; `index.html` has no CSP or frame/security headers; HTTP response headers were not queried | `test -e vercel.json`; `index.html` |

### Package scripts and dependency notes

`package.json` scripts: `dev`, `build`, `lint`, `preview`, `test`, `test:watch`. Runtime dependencies are Supabase JS, React/React DOM, Recharts, lightweight-charts, react-markdown, and remark-gfm. Source import search found use of all listed runtime dependencies; **no obvious unused runtime dependency** was found. This was an import search, not a full dependency graph audit (`package.json`, `src/`).

## Navigation and rendered surfaces

The mode selector and menus are in `src/App.jsx`. Day Trading and Investing are separate navigation sets; Analytics is still available under Day Trading, and profile menu items expose Settings and Privacy.

| Mode / page | What is rendered | Data status |
|---|---|---|
| Day Trading — Overview | `DayTradingDashboard` market header, score breakdown, setup readiness, detail toggle, quick links | **Stubbed:** dashboard passes empty `market`, `score`, `conditions`, and `strategy` objects (`src/components/DayTradingDashboard.jsx`). |
| Day Trading — Market | Asset input, market/condition/structure panels, cross-market context empty state | **Stubbed:** same empty props; no connected provider call in this dashboard (`src/components/DayTradingDashboard.jsx`). |
| Day Trading — Chart | Strategy/version selector, TradingView embed, Massive historical “My trades” view, journal-trades dropdown | TradingView loads third-party widget; historical requests use the Edge Function. Live browser behavior is **UNVERIFIED** (`src/components/ChartWorkspace.jsx`, `src/components/TradingViewChart.jsx`). |
| Day Trading — Strategy Lab | Strategy/version editor, compact position-size calculator, historical-data backtests, result history and metrics | Persisted with Supabase when configured; engine currently supplies an SMA crossover rule (`src/components/StrategyLab.jsx`, `src/services/backtestEngine.js`). |
| Day Trading — Events & News | Filterable event timeline, forecast/previous/actual fields, event guidance | Five source-code constants; no event API or ingestion service (`src/components/EconomicCalendar.jsx`). |
| Day Trading — Sentiment | Aggregated directional summary, asset table, expert-view list and filters | Five source-code opinion objects; no sentiment/analyst API (`src/components/MarketSentiment.jsx`). |
| Day Trading — Trades | Trade summary, calendar, create/edit/delete/detail flows, screenshot entry | Supabase-backed trades; private screenshot storage requires migrations and configured Edge Function (`src/App.jsx`, `src/components/JournalCalendar.jsx`). |
| Day Trading — Analytics | Charts and performance summaries over journaled trades | Derived locally from `trades` props; not an external market-data feed (`src/components/Analytics.jsx`). |
| Day Trading — Coaching | Persisted conversations, streaming replies, journal-context reports, screenshot analysis, trade-draft review | OpenAI Edge Function path; requires server secrets and deployed functions (`src/components/CoachingChat.jsx`, `supabase/functions/coach-chat/index.ts`). |
| Investing — Overview | Portfolio/watchlist/research summary cards, empty queue/portfolio panels, interpretation placeholder | Static empty states, no company provider or investment model (`src/components/InvestingWorkspace.jsx`). |
| Investing — Portfolio | Empty long-term holdings table | No portfolio persistence or price feed (`src/components/InvestingWorkspace.jsx`). |
| Investing — Watchlist | Empty companies table | No watchlist model or provider (`src/components/InvestingWorkspace.jsx`). |
| Investing — Stocks to Research | Empty research queue and unconnected score headings | No ranking inputs or score implementation (`src/components/InvestingWorkspace.jsx`). |
| Investing — Opportunities | Generic “Coming later” empty workspace | Stub (`src/components/InvestingWorkspace.jsx`). |
| Investing — Analyst Radar | Empty “No reliable analyst activity” state | No analyst provider (`src/components/InvestingWorkspace.jsx`). |
| Investing — Research | Generic “Coming later” empty workspace | Stub (`src/components/InvestingWorkspace.jsx`). |
| Investing — Fundamentals | Generic “Coming later” empty workspace | No financial statements provider (`src/components/InvestingWorkspace.jsx`). |
| Investing — Valuation | Generic “Coming later” empty workspace | No valuation provider (`src/components/InvestingWorkspace.jsx`). |
| Shared — Settings | Account email and sign-out action | No actual preference form; Settings is a basic account surface (`src/App.jsx`). |
| Shared — Privacy | Draft privacy notice including screenshot/OpenAI and TradingView disclosures | Explicitly not legally reviewed; no settings-level screenshot opt-out (`src/components/PrivacyNotice.jsx`). |

## Component and code inventory

| Area | Components / modules | Responsibility |
|---|---|---|
| App shell/auth | `src/App.jsx`, `src/Auth.jsx`, `src/supabaseClient.js` | App routing by active mode/page, auth/session lifecycle, journal orchestration, shared dialogs, Supabase client. |
| App pages | `src/components/Analytics.jsx`, `Dashboard.jsx`, `DayTradingDashboard.jsx`, `EconomicCalendar.jsx`, `InvestingWorkspace.jsx`, `MarketSentiment.jsx`, `StrategyLab.jsx`, `ChartWorkspace.jsx` | Analytics; dashboard surfaces; market event and sentiment pages; Investing placeholders; strategy/backtest; chart and setup workspace. |
| Journal/trade UI | `src/components/JournalCalendar.jsx`, `TradeLog.jsx`, `TradeChart.jsx`, `ScreenshotTradeWorkflow.jsx`, `TradeEntryChoiceModal.jsx`, `StrategyPositionSize.jsx` | Trade calendar/list, trade chart, screenshot extraction/review, entry-method selection, strategy sizing. Add/edit form and detail modal are rendered in `App.jsx`. |
| Coach/chart/shared UI | `src/components/CoachingChat.jsx`, `TradingViewChart.jsx`, `TickerBar.jsx`, `PrivacyNotice.jsx` | Coach chat, third-party widget, explicitly demo ticker strip, privacy text. |
| Empty files | `src/components/AddTradeModal.jsx`, `TradeJournal.jsx`, `Sidebar.jsx` | Zero-byte files, no imports found in `src/`; appear to be dead placeholders (`find ... -size 0`, import search). |
| Models | `src/models/trade.js`, `strategy.js`, `backtestResult.js` | DB/domain mappings and normalization for trade, strategy/version, backtest results. |
| Constants | `src/constants/strategyOptions.js` | Setup-condition and indicator option definitions shared by chart, screenshot, strategy, and Coach flows. |
| Service modules | `src/services/` | Historical request, bars/indicators, strategy persistence/config, symbol maps, trade plans/charts, journal calendar, backtesting/forward statistics, Coach context/chat/history/analysis, screenshot metadata, setup export/checklist. Full checked-in module inventory: `backtestConfig.js`, `backtestEngine.js`, `backtestParameters.js`, `barValidation.js`, `chartOverlay.js`, `coachChat.js`, `coachChatIntents.js`, `coachChatPresentation.js`, `coachChatRequestPayloads.js`, `coachChatStream.js`, `coachContext.js`, `coachHistory.js`, `coachReplyFallback.js`, `coachingAnalysis.js`, `forwardTestStats.js`, `historicalDataService.js`, `ictEntryRule.js`, `indicators.js`, `journalCalendar.js`, `patternDetection.js`, `sessionWindows.js`, `setupChecklist.js`, `setupSnapshot.js`, `stochastic.js`, `strategyLibrary.js`, `strategyModels.js`, `structureDetection.js`, `symbolMap.js`, `tradeChartData.js`, `tradeDraftForm.js`, `tradePlan.js`, `tradeScreenshots.js`, `tradingViewStudies.js`, `tradingViewWidgetConfig.js` (`src/services/`). |

## Architecture and data flow

```text
React App (App.jsx; useState + props; Supabase Auth)
  ├─ trades read/write ────────────────> Supabase public.trades
  ├─ strategies/versions CRUD ─────────> Supabase strategies, strategy_versions
  ├─ backtest UI ─> historicalDataService ─> authenticated historical-data Edge Function
  │                                         └─ Massive aggregates API (MASSIVE_API_KEY)
  │                     └─ backtestEngine (browser computation) ─> backtest_results
  ├─ screenshot upload ────────────────> private trade-screenshots Storage bucket
  ├─ screenshot vision request ────────> authenticated screenshot-vision Edge Function
  │                                         └─ OpenAI chat completions vision
  ├─ Coach chat/context ───────────────> authenticated coach-chat Edge Function
  │                                         ├─ OpenAI chat completions
  │                                         ├─ coach_messages / coach_conversations
  │                                         └─ consume_coach_request RPC (30/hour/user)
  ├─ Chart tab ─> TradingView embed script + iframe (symbol/studies config)
  └─ Events, sentiment, demo ticker ───> in-file constants (no data service)
```

**FACT:** React state is local `useState` plus props passed from `App.jsx`; there is no central state library. Auth state is initialized with `supabase.auth.getSession()` and updated with `onAuthStateChange`; cleanup unsubscribes the listener (`src/App.jsx`). Trade reads filter by `user_id`; the central `saveTrade` function handles insert/update and post-insert screenshot metadata, while `deleteTrade` deletes directly (`src/App.jsx`). Strategy Lab writes strategies, versions, and backtest results directly through Supabase; this is not consolidated into a shared write service (`src/components/StrategyLab.jsx`). Preferences such as chart view, checklist selections, symbol mappings, and recent backtest assets are stored locally (`src/components/ChartWorkspace.jsx`, `src/services/setupChecklist.js`, `src/services/symbolMap.js`, `src/components/StrategyLab.jsx`).

**Trade storage note:** Current app code reads/writes Supabase `trades`; search found no application use of the `tradeCatalystTrades` key. The key appears in `.github/copilot-instructions.md` only. No code path here clears or replaces that key.

## Plan phase status

| Phase | Status | Evidence and remaining gap |
|---|---|---|
| 1. Stabilize foundation | **Partial (75%)** | Auth, persisted journal CRUD, calendar, analytics, and tests exist (`src/App.jsx`, `src/components/JournalCalendar.jsx`, `src/components/Analytics.jsx`). App shell is 2,092 lines; many major page components have no direct UI test (`src/App.jsx`, test inventory). |
| 2. Historical data pipeline | **Partial (85%)** | Authenticated historical-data function validates timeframe/date, retrieves Massive aggregate pages, bounds pages and validates bars (`supabase/functions/historical-data/index.ts`, `supabase/functions/_shared/timeframe.ts`). Real key, network, quotas, deployment, and provider availability are **UNVERIFIED**. |
| 3. Screenshot vision | **Partial (80%)** | Authenticated OpenAI vision extraction, output post-processing, user review/edit, and normal trade-save path exist (`supabase/functions/screenshot-vision/index.ts`, `postProcessing.ts`, `src/components/ScreenshotTradeWorkflow.jsx`, `src/App.jsx`). Live accuracy/configuration **UNVERIFIED**. |
| 4. Canonical data models | **Partial (65%)** | Trade, strategy/version, backtest domain mappings and additive trade migrations exist (`src/models/`, `supabase/migrations/20260922000000_trade_canonical_fields.sql`). Base `public.trades` table definition and base policies are absent from checked-in migrations. |
| 5. Strategy versioning + backtesting | **Partial (75%)** | Strategies/versions persist with RLS; backtest results persist; Strategy Lab builds an ICT rule from the selected version and runs it through the generic backtest engine (`src/components/StrategyLab.jsx:246-255`, `src/services/backtestConfig.js:67-77`, `src/services/ictEntryRule.js:44-82`, `src/services/backtestEngine.js:208-237`). Enabled FVG, liquidity sweep, MSS, order block and stochastic conditions are evaluated; session membership is always checked (with “All sessions” allowing any session); displacement is explicitly rejected as unimplemented (`src/services/ictEntryRule.js:48-50,67-80,122-137`). The separate `smaCrossover` helper is not called by Strategy Lab; it is only directly exercised by its unit test (`src/services/backtestEngine.js:186`, `src/services/backtestEngine.test.js:269-270`). |
| 6. Market intelligence | **Stubbed (15%)** | TradingView embed and historical charts exist (`src/components/TradingViewChart.jsx`, `ChartWorkspace.jsx`). Dashboard market props are `{}`; event and sentiment sources are constants, not integrations (`DayTradingDashboard.jsx`, `EconomicCalendar.jsx`, `MarketSentiment.jsx`). |
| 7. Behavioral intelligence | **Partial (70%)** | Journal-derived performance/rule-break/combo analyses feed Strategy and Coach context (`src/services/coachingAnalysis.js`, `forwardTestStats.js`, `coachContext.js`). Results depend on data quality/sample size; broad user-facing validation and direct UI tests are limited. |
| 8. AI decision support | **Partial (75%)** | Coach supports completion/stream/title/draft/screenshot modes, constrained context, OpenAI calls, and per-user rate limiting; screenshot vision is separate (`supabase/functions/coach-chat/index.ts`, `requestValidation.ts`, `screenshot-vision/index.ts`). Live keys, deployment, output quality, and policy compliance are **UNVERIFIED**; market decision inputs remain disconnected. |

## Pillar matrix

| Pillar | Works with persisted/real data | Static, placeholder, or not connected | External configuration |
|---|---|---|---|
| Journal | Supabase CRUD; search/filter/calendar; result, quality, adherence fields; screenshot metadata/storage (`src/App.jsx`, `JournalCalendar.jsx`, `src/models/trade.js`) | Trade schema baseline/RLS not included in repository migrations; deployed table contract **UNKNOWN** | Supabase URL/anon key in client; Supabase Auth/DB/Storage configured externally (`src/supabaseClient.js`). |
| Strategy Lab | Strategy/version persistence; Massive historical bars; selected-version conditions map into an ICT entry rule and feed the backtest engine; result persistence (`src/components/StrategyLab.jsx:246-255`, `src/services/backtestConfig.js:67-77`, `src/services/ictEntryRule.js:44-82`, `src/services/backtestEngine.js:208-237`) | Enabled FVG, liquidity sweep, MSS, order block, and stochastic confirmations are executed as entry gates; session membership is checked for every candidate (default “All sessions” is unrestricted). Displacement is not executable and causes an explicit error when enabled (`src/services/ictEntryRule.js:48-50,122-137`). The standalone SMA crossover helper is not Strategy Lab’s entry rule (`src/services/backtestEngine.js:186`; its direct caller is the unit test at `src/services/backtestEngine.test.js:269-270`). | Supabase schema/migrations and `MASSIVE_API_KEY` server secret. |
| Backtesting | Historical-data path, costs/slippage/risk parameters, metrics, saved results; run path uses ICT condition gates described above (`src/components/StrategyLab.jsx:246-277`, `src/services/backtestConfig.js:67-77`, `src/services/ictEntryRule.js:44-137`, `src/services/backtestEngine.js:208-237`) | Displacement detection is explicitly unsupported; production provider runs remain **UNVERIFIED**. ICT entry conditions are evaluated only when enabled in the strategy version/config (and session membership is always checked) (`src/services/ictEntryRule.js:48-50,122-137`). | Massive Edge Function key and deployed migrations. |
| Market / Market Structure | Historical price context appears in My trades if provider responds (`ChartWorkspace.jsx`) | Day Trading market data and score are historical; cross-market values unavailable (`DayTradingDashboard.jsx`) | Massive key for historical; no live quote/provider configuration found. |
| Events & News | Filters and display components work | Five fixed calendar events dated 2026-08-14/15; page labels event feed as connected without an API (`EconomicCalendar.jsx`) | No external key/integration found. |
| Sentiment / expert view | Filtering and charts render | Five static opinion records plus derived static rows; no measurable investor positioning or ingestion (`MarketSentiment.jsx`) | No external key/integration found; source links are broad publication domains, not item citations (`MarketSentiment.jsx`). |
| Performance Analytics | Analytics computations use actual journal trades and render charts (`src/components/Analytics.jsx`, `src/services/coachingAnalysis.js`) | No direct `Analytics.test.jsx`; computed outputs are only as reliable as trade input data (test inventory). | No external market-data key. |
| AI Coach | Authenticated request, streaming, conversations, bounded context, trade drafting, screenshot analysis (`CoachingChat.jsx`, `coachChat.js`, `coachContext.js`, Edge Functions) | Real completions **UNVERIFIED**; fallback/empty states exist but cannot prove external answer correctness (`coachReplyFallback.js`) | `OPENAI_API_KEY`, optional `COACH_MODEL`, optional `OPENAI_VISION_MODEL`, Supabase Edge configuration. |
| Investing mode | Mode switch and nine navigation surfaces render | All portfolio/watchlist/fundamental/valuation/analyst/research/opportunity views are empty or “Coming later”; no Investing persistence/model/provider found (`InvestingWorkspace.jsx`, `src/models/`) | No company fundamentals/valuation provider keys found. |

## Static, demo, and hardcoded content inventory

| Surface | Fixed content and evidence |
|---|---|
| Global ticker strip | Eight hardcoded prices/changes; explicitly labeled `DEMO DATA` (`src/components/TickerBar.jsx`). |
| Economic calendar | Five fixed events and forecasts/previous values dated 2026-08-14/15; page status says “EVENT DATA · CONNECTED” (`src/components/EconomicCalendar.jsx`). |
| Market sentiment | Five attributed opinion objects with fixed dates, biases, explanations and generic source URLs; derived sentiment rows/counts are also constants (`src/components/MarketSentiment.jsx`). |
| Day Trading dashboard | `market`, `score`, `conditions`, and `strategy` are set to empty objects before rendering; visible score/recommendation/structure panels therefore show unavailable defaults (`src/components/DayTradingDashboard.jsx`). |
| Investing pages | Fixed blank summaries, “No holdings,” “No reliable analyst activity,” “Coming later,” and generic future-data descriptions (`src/components/InvestingWorkspace.jsx`). |
| Asset suggestions | Common tickers are static suggestions, not current asset discovery (`src/services/historicalDataService.js`). |
| TradingView studies | Study ids/verified flags are static mapping metadata; chart itself is a third-party embed and rendering correctness in this audit is **UNVERIFIED** (`src/services/tradingViewStudies.js`, `src/components/TradingViewChart.jsx`). |

## Persistence, migrations, and policies

| Object | Checked-in changes / policy evidence |
|---|---|
| `public.trades` | No `CREATE TABLE` migration exists. Additive columns: `screenshot_path text`, `ai_extraction jsonb`, `position_size numeric`, `risk_reward numeric`, `trade_time text`, `timeframe text`, `strategy_version_id uuid` FK, `indicators jsonb NOT NULL DEFAULT []`, `metrics jsonb NOT NULL DEFAULT {}` (`supabase/migrations/20260915000000_trade_screenshot_metadata.sql`, `20260922000000_trade_canonical_fields.sql`, `20260922010000_strategy_persistence.sql`, `20261005000000_trade_indicators_metrics.sql`). No table RLS enablement or `trades` policy is present in these migrations. Deployed/base policies are **UNKNOWN**. |
| `public.strategies` | `id`, `user_id`, `name`, description/assets/timeframe/session/direction/status/notes, `created_at`; RLS enabled; all-operation policy restricts `auth.uid() = user_id` (`20260922010000_strategy_persistence.sql`). |
| `public.strategy_versions` | `strategy_id` FK, `version_number`, entry/exit/stop/take-profit rules, risk_reward, conditions JSON, `created_at`; RLS enabled; policy scopes access through owning strategy (`20260922010000_strategy_persistence.sql`). |
| `public.backtest_results` | User/version ids, asset/timeframe/session/date bounds, config/metrics/trades JSON, `created_at`; RLS policy ties version to an owned strategy and checks `user_id` (`20261004000000_backtest_results.sql`). |
| `public.coach_messages` | `id`, `user_id`, `conversation_id`, role, content, created_at; RLS select/insert/delete own-user policies; conversation FK added later (`20261007000000_coach_messages.sql`, `20261007010000_coach_conversations.sql`). |
| `public.coach_conversations` | `id`, `user_id`, title, created_at, updated_at; RLS select/insert/update/delete own-user policies; migration backfills from messages (`20261007010000_coach_conversations.sql`). |
| `public.coach_request_limits` | `(user_id, window_start)` primary key, request_count constrained to 1..30; RLS enabled, client-role access revoked, service-role RPC access; `consume_coach_request(uuid)` limits each hourly bucket to 30 (`20261008000000_coach_request_rate_limit.sql`). |
| Storage bucket | `trade-screenshots` is private; authenticated insert/select/update/delete policies require first object path segment to equal `auth.uid()` (`20260915000000_trade_screenshot_metadata.sql`). |
| Schema gaps | No baseline migration for trades, users/preferences, watchlists, portfolios, market snapshots, event/news, or fundamental data. The live schema/migration history was not queried; deployment state is **UNKNOWN** (`supabase/migrations/`). |

## Security, privacy, and external data flows

| Area | Evidence-based finding |
|---|---|
| Client secret scan | Name-only scan of `src/` and generated `dist/` found `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` references; no server-key variable names surfaced in those client trees. These are Supabase client configuration names, not evidence that deployment values are configured. Secret values were not printed. (`src/supabaseClient.js`, `src/services/coachChat.js`; name-only scan command.) |
| Server secret names | Edge code references `MASSIVE_API_KEY`; `OPENAI_API_KEY`; optional `OPENAI_VISION_MODEL`, `COACH_MODEL`; `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Values/configuration are not present in this audit and are **UNVERIFIED** (`supabase/functions/README.md`, three function handlers). |
| Historical data auth | `historical-data` requires POST and a bearer token validated with `supabase.auth.getUser`; Massive key remains server-side; request includes asset, timeframe and date bounds (`supabase/functions/historical-data/index.ts`, `src/services/historicalDataService.js`). |
| Screenshot vision auth | `screenshot-vision` validates caller JWT, then sends the uploaded base64 image to OpenAI for extraction; results return as editable draft, not saved by the function (`supabase/functions/screenshot-vision/index.ts`, `src/components/ScreenshotTradeWorkflow.jsx`). |
| Coach data sent to OpenAI | Coach Edge receives message/history/context; `coachContext.js` constructs bounded summaries and redacts/limits identifying free-text content. Screenshot-analysis mode additionally loads selected owned trade screenshot and selected trade fields, then sends image/context to OpenAI (`src/services/coachContext.js`, `supabase/functions/coach-chat/index.ts`, `supabase/functions/README.md`). |
| TradingView flow | The widget receives the selected chart symbol, interval, theme/studies configuration. Privacy notice says journal data is not sent. Third-party script/frame is loaded from TradingView; browser request metadata is inherent to that external request (`src/components/TradingViewChart.jsx`, `src/services/tradingViewWidgetConfig.js`, `src/components/PrivacyNotice.jsx`). |
| Massive flow | User asset/timeframe/date range is sent to authenticated Supabase Edge Function; Edge Function calls `api.massive.com` using server key (`historicalDataService.js`, `supabase/functions/historical-data/index.ts`). |
| CORS and rate limits | Shared CORS allows `*` and POST/OPTIONS; no origin allowlist found (`supabase/functions/_shared/cors.ts`). Coach has 30 requests/user/hour (`coach-chat/index.ts`, migration); no comparable explicit quota found for historical-data or screenshot-vision. |
| Screenshot consent | Consent UI explains private storage/OpenAI use; acknowledgement may be stored in user metadata. Privacy notice says no Settings opt-out exists. Whether user consent is collected for every subsequent upload is **UNVERIFIED**; current code bypasses repeat consent once acknowledgement is present (`src/App.jsx`, `ScreenshotTradeWorkflow.jsx`, `PrivacyNotice.jsx`). |
| HTTP security headers | No `vercel.json`, CSP, frame policy, or security headers in `index.html`; production hosting headers are **UNVERIFIED** (`index.html`, absent `vercel.json`). |
| Secret values | No secret values were intentionally printed or included in this report. |

## Quality, test coverage, and error states

**Tested areas:** Auth; ChartWorkspace; CoachingChat; JournalCalendar; TradeChart/TradeLog; TradingView widget/config; trade/strategy/backtest models; backtest parameters/engine; bars/timeframes; indicators/pattern/structure/session; symbol mapping; screenshot/draft/request validation; Coach context/history/stream/presentation; journal/setup/trade-plan helpers (`npm test -- --run`, `src/**/*.test.*`, `supabase/functions/**/*.test.ts`).

**No direct page-level tests found:** `App.jsx` save/auth/mode integration; `DayTradingDashboard.jsx`; `InvestingWorkspace.jsx`; `EconomicCalendar.jsx`; `MarketSentiment.jsx`; `Analytics.jsx`; `StrategyLab.jsx`; `ScreenshotTradeWorkflow.jsx`; `TickerBar.jsx`; `PrivacyNotice.jsx`. Some service/Edge helpers used by these paths do have unit tests. Test count is not coverage percentage; coverage mode was not run.

| Quality item | Evidence / status |
|---|---|
| Empty/dead source files | Three zero-byte files: `src/components/AddTradeModal.jsx`, `TradeJournal.jsx`, `Sidebar.jsx`; import search found no consumers. |
| Files >800 lines | `App.jsx` 2,092; `App.css` 8,275; `StrategyLab.css` 1,264; `CoachingChat.css` 1,064; `CoachingChat.jsx` 878; `TradingWorkspaces.css` 837; `StrategyLab.jsx` 823 (`wc -l`). |
| TODO/FIXME markers | Search found no `TODO`, `FIXME`, `XXX`, or `TEMPORARY` markers in `src`, `supabase/functions`, or README. This does not mean no planned work; many explicit “future/unavailable” UI strings remain. |
| Other placeholder evidence | Privacy copy explicitly says draft/unreviewed; default Investing pages and InterpretationPanel await providers; Chart/market structure says analysis pending (`PrivacyNotice.jsx`, `InvestingWorkspace.jsx`, `DayTradingDashboard.jsx`). |
| Loading/error/empty states | Auth/loading and trade errors in App; historical loading/error/empty states in Chart; Coach persistence/request errors; Investing empty states. Market/conditions pages show unavailable data rather than a network loading path because no provider is connected (`App.jsx`, `ChartWorkspace.jsx`, `CoachingChat.jsx`, `InvestingWorkspace.jsx`, `DayTradingDashboard.jsx`). |
| Runtime test gaps | Browser TradingView widget rendering, live provider response, deployed Edge auth/secrets, real screenshot extraction, and production RLS all **UNVERIFIED**; unit tests cannot establish these. |
| Trade-safety persistence | App uses Supabase trades and no app reference to `tradeCatalystTrades` was found; verify legacy/local records only if that key is still used in a deployed version (`src/App.jsx`; repository search). |

## UX and design conformance

| Rule / page | Conformance or deviation |
|---|---|
| Brand tokens | CSS variables define `#0D0D0D`, gold `#D4AF37`, trading blue `#4A90D9`, investing green `#2ECC71`, and IBM Plex Mono (`src/index.css`). |
| Hexagon texture | Hexagonal/repeating-conic decoration exists in `src/App.css`; it is a visual effect, not evidence that every screen uses it. |
| Beginner-first / current-data clarity | Chart distinguishes historical data, TradingView source, and unavailable states; however static ticker/events/sentiment can resemble current data (ticker is marked demo but calendar says connected) (`ChartWorkspace.jsx`, `TickerBar.jsx`, `EconomicCalendar.jsx`, `MarketSentiment.jsx`). |
| One-screen / uncluttered | Long Strategy Lab, Coaching and journal surfaces have scrolling/panels; App and stylesheet sizes also indicate dense accumulated UI (`StrategyLab.jsx`, `CoachingChat.jsx`, `JournalCalendar.jsx`, `src/App.css`). A viewport-by-viewport usability check was not run. |
| No hide/show toggles | Violations include global navigation/profile dropdowns, Overview detail and score-detail toggles, Chart trade dropdown, Strategy Lab `<details>`, and Coach/TradeLog collapsible controls (`App.jsx`, `DayTradingDashboard.jsx`, `ChartWorkspace.jsx`, `StrategyLab.jsx`, `CoachingChat.jsx`, `TradeLog.jsx`). |
| Locale | Most calendar/chart formats force `en-US`, but Strategy Lab and Coach history call locale-dependent `toLocaleDateString()` without a locale, which can vary with browser language (`StrategyLab.jsx`, `src/services/coachHistory.js`). |
| Investing-mode separation | Separate mode and page hierarchy exist, but Investing content is currently a shell of empty states, not a functional investing engine (`App.jsx`, `InvestingWorkspace.jsx`). |
| Missing header evidence | `index.html` loads Google Fonts and has no CSP; no Vercel header config exists in repository. Browser CSP/frame behavior cannot be verified (`index.html`). |

## Plan deviations

### Planned but missing or mostly missing

- Live market prices, freshness/delay labels, VWAP/ATR/relative volume, correlated context and integrated score inputs — dashboard currently receives empty values (`DayTradingDashboard.jsx`).
- Real economic calendar/news and measurable investor positioning/analyst sentiment — current pages use constants (`EconomicCalendar.jsx`, `MarketSentiment.jsx`).
- Automated structure/FVG/MSS/liquidity/OB detection wired into backtesting — engine documents SMA-only entry rule (`src/services/backtestEngine.js`).
- Investing portfolio/watchlist persistence, fundamentals, valuation, company quality and investment score — currently empty views (`InvestingWorkspace.jsx`).
- Canonical bootstrap migration for base trades schema/RLS — missing from `supabase/migrations/`.
- Production/legal privacy policy, user data export/retention, and screenshot opt-out — privacy notice is an unreviewed draft (`PrivacyNotice.jsx`).

### Built beyond or not explicit in the plan

- OpenAI Coaching chat, persisted conversations, screenshot analysis, and text-to-trade draft flow (`CoachingChat.jsx`, `coach-chat/index.ts`).
- Screenshot Trade Workflow with private object storage and manual extraction review (`ScreenshotTradeWorkflow.jsx`, `20260915000000_trade_screenshot_metadata.sql`).
- TradingView embed / chart drawing and studies integration (`TradingViewChart.jsx`, `tradingViewStudies.js`).
- Journal calendar, position sizing, compact trade snapshot export and trade-quality/rule-break tools (`JournalCalendar.jsx`, `StrategyPositionSize.jsx`, `setupSnapshot.js`, `App.jsx`).

### Built differently

- Market Intelligence has polished shells and static examples rather than live event/sentiment ingestion (`EconomicCalendar.jsx`, `MarketSentiment.jsx`).
- The Market Trading Score and decision panel are UI scaffolds rather than computed outputs, as the dashboard initializes their inputs to `{}` (`DayTradingDashboard.jsx`).
- Backtests consume Massive historical data and persist results, but execute the simple SMA crossover core, not full strategy condition logic (`StrategyLab.jsx`, `backtestEngine.js`).
- TradingView is an external embed; the app does not observe price/timeframe changes or persist chart drawings (`TradingViewChart.jsx`, `ChartWorkspace.jsx`).

## Ranked risks and recommended next steps

### Risks

| Rank | Severity | Risk | One-line remediation |
|---:|---|---|---|
| 1 | **High** | Events and sentiment contain hardcoded opinions/forecasts while calendar status claims “connected”; stale values can mislead (`EconomicCalendar.jsx`, `MarketSentiment.jsx`). | Remove live-sounding labels or gate pages behind a verified, timestamped provider integration with source-level citations. |
| 2 | **High** | Market score/conditions are empty objects; key Market page does not represent actual conditions (`DayTradingDashboard.jsx`). | Connect one provider through a normalized, freshness-aware market service and make score unavailable until inputs exist. |
| 3 | **High** | No checked-in base trades DDL/RLS policy; ownership guarantee cannot be audited from this repository (`supabase/migrations/`). | Verify deployed policy now and add a reviewed baseline/schema policy migration to repository history. |
| 4 | **High** | Investing navigation is present but Portfolio, Watchlist, Fundamentals, Valuation, Research and Opportunities are empty (`InvestingWorkspace.jsx`). | Treat Investing as an explicit roadmap shell until data models/provider/UX are implemented; avoid implying operational capability. |
| 5 | **Medium** | Historical-data and screenshot-vision endpoints show no explicit per-user rate quota; broad CORS origin is `*` (`historical-data/index.ts`, `screenshot-vision/index.ts`, `_shared/cors.ts`). | Add quotas/body-size controls appropriate to endpoint cost and restrict CORS to known app origins where feasible. |
| 6 | **Medium** | Schema changes are additive but no baseline migration or checked-in deployed migration status; strategy/backtest inserts depend on external schema state (`supabase/migrations/`, `StrategyLab.jsx`). | Reconcile remote migration history with source and document/deploy a complete reproducible schema path. |
| 7 | **Medium** | Giant App and CSS files raise change/regression risk; page-level UI tests are absent for multiple major surfaces (`App.jsx`, `App.css`, test inventory). | Prioritize small, behavior-preserving extraction with focused tests when next modifying those surfaces. |
| 8 | **Medium** | Static TickerBar/market content could be mistaken for live data; generic source links do not substantiate specific commentary (`TickerBar.jsx`, `MarketSentiment.jsx`). | Keep demo label prominent and make source timestamp/attribution mandatory before showing non-demo items. |
| 9 | **Medium** | Screenshot/Coach data is sent to OpenAI; notice is explicitly draft and lacks Settings opt-out (`PrivacyNotice.jsx`, `ScreenshotTradeWorkflow.jsx`). | Complete privacy/legal review, retention disclosure, and user controls before production rollout. |
| 10 | **Low** | Locale-dependent dates can leak browser locale into otherwise English UI (`StrategyLab.jsx`, `coachHistory.js`). | Use explicit app locale in all displayed date formatting. |
| 11 | **Low** | Three empty component files and two root-level image fixtures are tracked (`AddTradeModal.jsx`, `TradeJournal.jsx`, `Sidebar.jsx`, `trade_1_test.jfif`, `trade_test_2.jpeg`). | Confirm fixture provenance and remove/relocate obsolete files only with maintainer approval. |

### Roadmap (priority order)

1. **Verify production safety first:** inspect deployed `trades` RLS, storage policies, migrations, Edge Function versions and secret names (never values); repository alone cannot prove these.
2. **Stop static current-market claims:** prominently label/remove demo sentiment/event content and fix the calendar's connected status until data is actually wired.
3. **Build one shared market-data contract:** provider/source, timestamp, live/delayed/freshness, errors and validated asset mapping; use it in Market, Chart context and score.
4. **Implement explainable score from real inputs:** visible component values/rationales and explicit unavailable state; do not score empty fields.
5. **Complete historical pipeline operations:** confirm Massive production plan/symbol coverage, add endpoint quotas, and measure end-to-end latency/error handling.
6. **Harden schema reproducibility:** commit/reconcile base trade schema and RLS migration, then verify every migration on a clean Supabase instance.
7. **Constrain backtesting claims:** expose the SMA-only rule plainly or incrementally implement/test strategy-version condition execution without implying unsupported detection.
8. **Choose and scope Investing MVP:** start with one financial provider and a minimal fundamentals/valuation model; keep empty surfaces labeled as non-operational until it works.
9. **Improve verification:** add focused tests for App save/auth/page routing, Market/Events/Sentiment/Investing screens, StrategyLab persistence/error paths, and browser checks for provider/embed behavior.
10. **Production readiness:** review privacy/legal copy, screenshot consent/retention, CORS/headers, deployment workflow checks, and remove confirmed dead files/fixtures.

## Unknowns and live verification checklist

- Supabase project schema, deployed RLS, applied migration set, bucket contents/policies, Edge Function deployment state, and server secret configuration were not queried.
- No live Massive/OpenAI/TradingView request or authenticated browser session was available; provider keys, quotas, account entitlements, returned data, external chart theme/studies, and model behavior are **UNVERIFIED**.
- `npm run build` confirms a local production bundle only; it does not verify Vercel deployment or runtime environment variables.
- The root screenshot fixture filenames are visible in Git; their contents/provenance were not inspected.
