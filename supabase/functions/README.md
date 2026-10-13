# Screenshot Vision Edge Function

`supabase/functions/screenshot-vision` accepts an authenticated `POST` request
with a JSON body containing `image`, a base64-encoded PNG, JPEG, or WebP image.
An optional `mimeType` is used when the value is raw base64 rather than a data
URL. The function validates the Supabase access token before reading the image,
calls the configured OpenAI vision model, validates the canonical extraction
schema, and returns the result as draft data for manual review.

Required Supabase project secrets/configuration:

- `OPENAI_API_KEY`: server-side OpenAI API key. Never expose this to the client.
- `OPENAI_VISION_MODEL`: vision-capable OpenAI model name. If unset, the
  documented fallback is `gpt-4o-mini`.
- `SUPABASE_URL`: Supabase project URL, used to validate the bearer token.
- `SUPABASE_ANON_KEY`: Supabase public anon key, used with the authenticated
  request to validate the bearer token.

The response is intentionally a draft. The frontend must allow the user to
verify and edit every value before saving it through the existing trade flow.

## Coaching Chat Edge Function

`supabase/functions/coach-chat` accepts an authenticated `POST` containing a
user message, at most 20 prior chat messages, and a bounded allowlisted Coaching
context pack. The function validates the caller's JWT with Supabase Auth and
rejects unknown fields or raw trade records. Context excludes trade notes,
screenshots, UUIDs, and account identifiers.

Requests may use `mode: "stream"` for OpenAI-compatible SSE deltas,
`mode: "complete"` for a non-streaming reply, or `mode: "title"` for a
short conversation title. `mode: "analyze_screenshot"` accepts one or two
journal trade UUIDs and streams a visual description tied to the selected
trade's journaled fields. For this mode, the function uses the caller's
bearer-JWT-scoped Supabase client to read `public.trades.screenshot_path` and
download from the private `trade-screenshots` bucket; the existing own-folder
Storage policy enforces ownership. Image bytes and storage paths are not
returned or logged. Images larger than 10 MiB and non-image files are rejected.
The selected image is sent to OpenAI for analysis.

`mode: "draft_trade"` returns allow-list-checked JSON from explicit user text.
It leaves unstated fields empty and never writes a trade; the client opens the
existing manual trade form for review and saving. Streaming failures fall back
to a regular completion, including screenshot analysis with the same selected
trade IDs. All modes count against the existing rate limit.
Each authenticated user is limited to 30 requests per hour by the
`consume_coach_request` RPC. The rate-limit table is not readable or writable by
client roles; only the Edge Function's service-role client can invoke the RPC.
Apply `supabase/migrations/20261008000000_coach_request_rate_limit.sql` before
deploying the updated function.

Required Supabase project secrets/configuration:

- `OPENAI_API_KEY`: server-side OpenAI API key, shared with `screenshot-vision`.
  Never expose it to the client.
- `COACH_MODEL`: optional OpenAI chat-completions model name. Defaults to
  `gpt-4o-mini`.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY`: used to validate each caller's
  Supabase access token.
- `SUPABASE_SERVICE_ROLE_KEY`: used only by the Edge Function to atomically
  consume the per-user hourly request allowance. Never expose this key to the
  client.

The function deploy workflow triggers for changes under `supabase/functions/**`.
Deploy `coach-chat` by pushing its function files to `main`.

## News Edge Functions

`news` returns cached financial news for an authenticated caller and lazily
refreshes stale category data when a refresh lock is available. It accepts
`POST` JSON `{ "category": "all", "tickers": ["SPY"], "limit": 25, "before": null }`.
Request category is `all`, `forex`, `crypto`, `equities`, or `macro` (stored
categories also include `markets` and `other). `all` deliberately omits a
database category filter.
The successful listing shape is
`{ "ok": true, "items": [], "providers": [], "before": null, "refreshedAt": null }`.
The `before` cursor is the oldest returned item's `publishedAt` when another
page exists, otherwise `null`. Cached results remain usable if another request owns the refresh
lock or the provider refresh fails; these success responses keep the same
listing contract, set `stale: true`, and `refreshedAt` remains the last
successful refresh time. A provider failure with cached items also adds a
`warning` with code `NEWS_UNAVAILABLE`; with no cached items the endpoint
returns `{ "ok": false, "code": "NEWS_UNAVAILABLE", "message": "..." }` with
HTTP 503. News requests are limited to 240 per user per hour.

`news-explain` accepts `POST` JSON `{ "newsId": "<news item UUID>" }` and
returns
`{ "ok": true, "explanation": { "whatHappened": "...", "whyItMatters": "...", "affects": [{ "market": "...", "effect": "...", "reasoning": "..." }], "watchNext": [], "caveat": "..." } }`.
Explanations are shared by news item. Only the article headline and provider
summary are sent to OpenAI. Requests are limited to 30 per user per hour, and
generation has a global daily cap configured by `NEWS_EXPLAIN_DAILY_CAP`
(default 500). Both functions use the standard error shape
`{ "ok": false, "code": "...", "message": "..." }` with an HTTP error status.
Neither function logs request bodies, user identifiers, or article content.

Apply `supabase/migrations/20261013000000_news_and_general_rate_limits.sql`
before deploying these functions. It creates the news cache, per-user
explanations, and refresh-lock state, and generalizes the existing hourly
rate-limit RPC while retaining `consume_coach_request(user)` as a compatible
30-per-hour wrapper.

### Massive provider integration

The provider adapter makes a GET request to the documented endpoint
`https://api.massive.com/v2/reference/news`, using `MASSIVE_API_KEY` as the
`apiKey` query parameter. It supplies the supported `ticker`,
`published_utc.gte`, `sort=published_utc`, `order=desc`, and `limit=50`
parameters when applicable. The relevant response contract is:

```json
{
  "results": [
    {
      "id": "provider-article-id",
      "title": "Article title",
      "description": "Article summary",
      "article_url": "https://publisher.example/article",
      "published_utc": "2026-10-13T08:00:00Z",
      "publisher": { "name": "Publisher" },
      "tickers": ["SPY"]
    }
  ]
}
```

The adapter rejects malformed records and non-HTTPS article links, classifies
only categories supported by headline/summary text, and deduplicates provider
IDs and URLs. Unrecognized market types remain `other`; no forex/crypto
classification is inferred from an unrecognized ticker alone. News is not live
market-price data.

Required configuration:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`: validate caller access tokens.
- `SUPABASE_SERVICE_ROLE_KEY`: access protected news tables and atomically
  consume user limits. Never expose this key to clients.
- `MASSIVE_API_KEY`: server-side Massive API key.
- `OPENAI_API_KEY`: server-side key for explanation generation.
- `NEWS_EXPLAIN_MODEL`: optional OpenAI chat-completions model; defaults to
  `gpt-4o-mini`.
- `NEWS_EXPLAIN_DAILY_CAP`: optional global explanation-generation cap per
  UTC day; defaults to `500`.
