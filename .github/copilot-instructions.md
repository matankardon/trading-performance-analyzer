# Trading Performance Analyzer — Product and Architecture Instructions

## 1. Product Vision

This application is evolving from a trading journal into a professional market-analysis and trading-performance platform.

It is not simply:

* a trading journal
* a stock screener
* a profit and loss calculator
* a news app

The long-term goal is to help a user understand:

1. What is happening in the market right now?
2. What are the current trading conditions?
3. What are experts saying?
4. What are investors and sentiment indicators saying?
5. What does all of this mean?
6. Is the current environment favorable for a day trader?
7. Does the current chart or setup match the user's strategy?
8. How did the trader perform historically?
9. For longer-term investing: is the company fundamentally attractive and reasonably valued?

The application should evolve into a market-and-performance command center, not a simple data logger.

---

## 2. Two Primary Modes

The product must have two clearly separated operating modes.

### Mode A: Day Trading

Purpose: understand current intraday market conditions and whether they are suitable for short-term trading.

### Mode B: Investing

Purpose: evaluate long-term company attractiveness, valuation, fundamentals, business quality, and investment risk.

The application must include a prominent mode switch in the sidebar or main navigation. This is not a visual theme toggle. It changes the purpose, information hierarchy, analytics, terminology, and decision logic.

The product architecture should therefore follow:

DAY TRADING ENGINE
+
INVESTING ENGINE
+
SHARED PLATFORM SERVICES

The two modes should share common infrastructure such as authentication, asset profiles, source management, persistent storage, watchlists, and user settings whenever possible.

---

## 3. Shared Platform Principles

Shared functionality must be implemented once and reused where appropriate, including:

* asset search and lookup
* asset profiles
* shared source and provider management
* news and event ingestion layers
* user authentication
* user settings
* watchlists
* journal and trade data storage
* common reporting and analytics wrappers

Do not duplicate the same service into two separate implementations when one shared abstraction will work cleanly.

---

## 4. Current Repository Architecture

The repository is currently a Vite + React application focused on a trading journal and performance workspace.

### Observed current structure

* [src/App.jsx](src/App.jsx) is the main app shell and orchestrator.
* [src/components/Dashboard.jsx](src/components/Dashboard.jsx) contains the high-level performance dashboard.
* [src/components/Analytics.jsx](src/components/Analytics.jsx) contains summary analytics and chart-based analysis.
* [src/components/EconomicCalendar.jsx](src/components/EconomicCalendar.jsx) contains market-event data and event filtering.
* [src/components/MarketSentiment.jsx](src/components/MarketSentiment.jsx) contains expert commentary and sentiment surfaces.
* [src/Auth.jsx](src/Auth.jsx) handles authentication.
* [src/supabaseClient.js](src/supabaseClient.js) provides the Supabase client.

### Current behavior

The app currently contains:

* Dashboard
* Trade Journal
* Analytics
* Economic calendar
* Trade creation, editing, and deletion flows
* Trade quality and rule-break tracking
* Search and filtering over trade history
* Supabase-backed trade persistence

The current root app is still a single-page React architecture with stateful orchestration in [src/App.jsx](src/App.jsx). That is valid for the current stage and should remain the base structure unless a strong architectural reason requires refactoring.

---

## 5. Trade Data Safety

The current trade system remains a primary product pillar.

Important trade storage key:

tradeCatalystTrades

Never:

* rename it
* remove it
* clear it
* reset it
* replace it

without explicit authorization.

When changing trade-related code:

* preserve existing trade records
* preserve backward compatibility with older records
* use safe defaults when new fields are introduced
* handle undefined, null, and missing values gracefully
* do not reset the trade system during UI work

The existing trade journal must remain functional while the product expands into market analysis and investing features.

---

## 6. Day Trading Mode Requirements

Day Trading mode is designed for active traders working with short holding periods.

The core question is:

What is happening in the market right now, and are the current conditions suitable for a trade?

This mode should prioritize information in this order:

1. live or fresh market price data
2. market structure
3. momentum
4. volume and relative volume
5. volatility
6. market context and correlated assets
7. economic and event risk
8. investor sentiment
9. expert commentary
10. strategy compatibility
11. trade, wait, or avoid decision support

### Live market data

The system should show, when available:

* current price
* price change
* percentage change
* open
* day high and low
* previous close
* volume
* relative volume
* VWAP
* ATR
* spread
* bid and ask when available
* last update timestamp
* data freshness and delayed status

Never present delayed data as live data.

### Market structure

The app should eventually analyze short-term structure using concepts such as:

* trend
* higher high and higher low
* lower high and lower low
* break of structure
* market structure shift
* liquidity and liquidity sweeps
* fair value gaps
* displacement
* order blocks
* previous day high and low
* session highs and lows
* Asia, London, and New York session levels

Do not claim a structural condition was detected unless the underlying data or analysis supports it.

### Momentum, volatility, and context

Day Trading mode should evaluate:

* RSI
* stochastic
* MACD when relevant
* acceleration and momentum quality
* ATR and intraday volatility
* major index and futures context
* DXY
* Treasury yields
* VIX
* sector and correlated asset strength

The exact inputs depend on the asset and market being analyzed.

### Economic and event risk

The system must clearly surface important events affecting short-term trading, including:

* CPI
* NFP
* FOMC
* rate decisions
* speeches
* GDP
* employment data
* earnings events
* major macro releases

For every event, show:

* event name
* date and time
* currency or region
* expected impact
* time until event
* source
* why it matters for the asset or market

### Expert / analyst section

The Day Trading mode must include an Expert Opinion section with the heading:

WHAT ARE THE EXPERTS THINKING?

This section must show attributable information from reputable sources when available. Each item should include:

* source or publication name
* analyst or expert name when available
* publication date and time
* asset or market discussed
* directional bias when available
* short rationale
* source link or clearly visible source reference

The product must clearly distinguish:

* FACT
* ANALYST OPINION
* APPLICATION INTERPRETATION

Never invent analysts, quotes, or commentary. If reliable data is not available, the product should show an honest empty state such as: No reliable expert commentary available.

### Investor sentiment

The Day Trading mode should also include a section titled:

WHAT ARE INVESTORS THINKING?

This should reflect measurable sentiment when real data is available, such as:

* retail sentiment
* institutional positioning
* options positioning
* market sentiment indicators
* measurable positioning data

If no reliable sentiment source exists, the UI should clearly state that.

### What does this mean?

The application must synthesize the market data into plain-language interpretation. This section should explain what the combined information means for a short-term trader without pretending it predicts the future.

Examples:

* The market is bullish, but a high-impact event is scheduled in 30 minutes, increasing the chance of abnormal volatility.
* Price structure remains supportive, but volume is weak and confirmation is incomplete.

This interpretation must distinguish between:

* observed data
* external opinion
* system analysis
* uncertainty

---

## 7. Market Trading Score

Day Trading mode should include a Market Trading Score from 0 to 100.

This score represents:

How favorable is the current market environment for short-term trading?

It does not represent:

* price direction
* guaranteed buy or sell
* a future prediction

The score must be explainable and must be built from component scores such as:

* Market Structure
* Momentum
* Volatility
* Market Context
* Event Risk
* Sentiment
* Expert View

Each factor should contribute a visible sub-score and a brief rationale.

Example structure:

Market Trading Score: 82 / 100

* Market Structure: 21 / 25
* Momentum: 16 / 20
* Volatility: 15 / 20
* Market Context: 14 / 15
* Event Risk: 8 / 10
* Sentiment: 5 / 10

The weights should be configurable, documented, and refinable over time.

### Market score versus direction

Market Trading Score and directional bias are separate concepts.

A market can have:

* high score and bullish bias
* high score and bearish bias
* low score and bullish bias

The system must not collapse them into one simplistic signal.

---

## 8. Setup Score and Strategy Evaluation

The app should eventually calculate a second score:

Setup Score

This represents:

How well the current setup matches the user's strategy.

A setup score is separate from the market trading score.

Example:

* Market Trading Score: 82 / 100
* Setup Score: 74 / 100
* Final state: WAIT

This is more useful than a simplistic BUY/SELL output.

The user's strategy engine should eventually evaluate conditions such as:

* liquidity sweep
* MSS
* displacement
* FVG
* stochastic confirmation
* order block
* session context
* entry timing

The logic should evaluate whether a setup is valid, invalid, or requires waiting.

Potential outputs include:

* TRADE
* WAIT
* AVOID
* INVALID SETUP
* VALID SETUP

Do not make a trading decision from a single metric alone.

---

## 9. Automated Chart Analysis

A future key capability is automatic chart analysis.

The intended architecture is:

REAL MARKET DATA
+
CHART DATA
+
USER STRATEGY
+
AI OR VISION ANALYSIS

The app should eventually help identify:

* liquidity pools
* liquidity sweeps
* MSS
* market structure
* FVG
* displacement
* order blocks
* entry zones
* stop and take-profit zones
* potential invalidation
* risk and reward
* strategy compliance

Any AI analysis must clearly distinguish:

* detected
* inferred
* uncertain

The user should be able to review or correct AI interpretations.

---

## 10. Live Data Architecture

Real-time market information is important for this product.

Whenever possible, prefer actual market-data providers over simulation. Every external source should include:

* provider name
* timestamp
* freshness status
* live or delayed status
* fallback behavior

If a data provider is not yet connected, the application should build a clean abstraction and clearly indicate that the provider is pending integration.

Do not fake live data or fabricate API responses.

---

## 11. Investing Mode Requirements

Investing mode is a different product experience. The primary question is:

Is this company attractive as a long-term investment?

This is not short-term trading analysis.

### Fundamentals

Potential metrics include:

* revenue
* revenue growth
* EPS and EPS growth
* gross margin
* operating margin
* free cash flow
* debt and cash position
* ROIC and ROE

### Valuation

Potential metrics include:

* P/E
* forward P/E
* PEG
* P/S
* EV/EBITDA
* free cash flow yield
* historical valuation
* sector comparison

### Business quality and long-term outlook

Potential analysis includes:

* competitive advantage
* management quality
* business model quality
* industry structure
* growth opportunities
* long-term risk profile
* macro sensitivity

### Analyst and institutional view

When reliable data is available, show:

* analyst consensus
* price targets
* upgrades and downgrades
* institutional ownership
* insider activity when reliable

### Investment score

Investing mode may eventually include an Investment Score from 0 to 100.

This score represents:

How attractive is the company as a long-term investment?

This must remain separate from the Market Trading Score.

A company can be a strong long-term investment but poor for short-term trading, and vice versa.

---

## 12. Information Hierarchy and Product Logic

The application must keep the information hierarchy different between the two modes.

### Day Trading information hierarchy

1. price
2. market structure
3. momentum
4. volume
5. volatility
6. market context
7. events
8. investor sentiment
9. expert commentary
10. strategy compatibility
11. trade or wait or avoid state

### Investing information hierarchy

1. fundamentals
2. growth
3. valuation
4. business quality
5. competitive position
6. financial health
7. industry and management
8. risk profile
9. long-term outlook

Do not mix the two information hierarchies.

---

## 13. Product Principle: Data to Decision Support

The product should not simply show more data. It should transform data into:

DATA
↓
CONTEXT
↓
INTERPRETATION
↓
DECISION SUPPORT

The user should not have to manually connect a dozen data streams and decide what they mean.

The system should help explain:

* What is happening?
* Why is it happening?
* What does it mean?
* What should I pay attention to?
* Does it fit my strategy?

Without pretending to know the future.

---

## 14. Existing Trade Journal and Trade Quality Rules

The existing Trade Journal remains a core part of the product and must not be removed or replaced.

It should continue to support:

* create trade
* edit trade
* delete trade
* search
* filters
* strategy tracking
* session analysis
* result analysis
* trade quality analysis
* rule-break tracking
* P&L reporting
* setup criteria logging

A win is not automatically a good trade.
A loss is not automatically a bad trade.

The product must retain the distinction between:

* trade result
* trade quality
* rule adherence
* setup validity

---

## 15. UI and Design Philosophy

The product should feel:

* professional
* mature
* data-focused
* clean
* modern
* trading-terminal inspired

Avoid:

* childish styling
* social-media aesthetics
* clutter
* excessive motion
* decorative noise

In Day Trading mode especially, information must be readable at a glance.

---

## 16. Engineering Rules

Before changing code:

1. inspect the current repository
2. determine whether the work belongs to Day Trading, Investing, or Shared infrastructure
3. find existing implementations before creating new ones
4. identify all affected files
5. understand dependencies and data flow
6. maintain existing functionality
7. preserve data safety
8. implement the smallest complete solution
9. verify imports and build integrity

Do not rewrite unrelated code.
Do not replace the application architecture without a strong reason.
Do not introduce a new dependency unless it is truly necessary.

### Build and verification requirements

Before considering a change complete:

* verify imports and file paths
* verify hooks usage
* ensure there are no syntax errors
* confirm the app still builds
* check that existing functionality still works

### Data and UX safety

If a feature risks losing trade data or harming a working flow, the safer implementation wins.

---

## 17. Feature Classification Rule

Every major feature should be classified as one of the following:

* DAY TRADING
* INVESTING
* SHARED

Examples:

* live intraday price → DAY TRADING
* FVG detection → DAY TRADING
* strategy setup analysis → DAY TRADING
* market trading score → DAY TRADING
* company earnings and valuation → INVESTING
* revenue growth analysis → INVESTING
* asset profile lookup → SHARED
* user settings → SHARED
* source management → SHARED

---

## 18. Implementation Roadmap

The product should evolve incrementally and safely.

### Phase 1: stabilize the current platform

* preserve and extend the existing journal and analytics
* maintain trade data integrity
* keep the app functional and mobile-friendly
* preserve the current dashboard and analytics flows

### Phase 2: add the Day Trading architecture

* introduce a clear Day Trading mode toggle
* separate Day Trading dashboards and views from Investing views
* add market-data architecture and event surfaces
* integrate expert commentary and investor sentiment
* add market trading score and strategy-alignment logic

### Phase 3: add the Investing architecture

* add a dedicated Investing mode
* introduce company fundamentals and valuation views
* add investment scoring and business-quality analysis
* keep the two modes separate but share infrastructure where possible

### Phase 4: add strategy-aware automation

* connect strategy conditions to trade evaluation
* add chart analysis and AI-assisted review carefully and transparently
* add review and correction flows for uncertain detections

### Phase 5: production data integration

* connect live data providers
* connect reputable analyst and sentiment sources
* enforce data freshness and source attribution
* refine scoring logic based on real market behavior

The goal is not to rewrite the app, but to evolve it into a layered market-analysis and trading-performance platform without removing the existing trade workflow.

---

## 19. Final Product Principle

The application should be designed to help the user answer:

* What is happening right now?
* Why is it happening?
* What does it mean?
* What should I pay attention to?
* Does this fit my strategy?
* Do the current conditions justify a trade or not?
* Is this company fundamentally attractive and reasonably valued?

The long-term product goal is not simply to collect data. It is to reduce uncertainty and turn information into useful decision support.

