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

Required Supabase project secrets/configuration:

- `OPENAI_API_KEY`: server-side OpenAI API key, shared with `screenshot-vision`.
  Never expose it to the client.
- `COACH_MODEL`: optional OpenAI chat-completions model name. Defaults to
  `gpt-4o-mini`.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY`: used to validate each caller's
  Supabase access token.

The function deploy workflow triggers for changes under `supabase/functions/**`.
Deploy `coach-chat` by pushing its function files to `main`.