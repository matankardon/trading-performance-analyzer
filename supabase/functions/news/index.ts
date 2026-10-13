import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { matchesNewsCategory } from "../_shared/news/category.ts";
import { fetchMassiveNews } from "../_shared/news/massiveProvider.ts";
import { validateNewsListingRequest } from "../_shared/news/requestValidation.ts";
import { isNewsCacheStale, refreshWithStaleFallback } from "../_shared/news/refresh.ts";
import type { NewsCategory, NewsItem } from "../_shared/news/types.ts";

const MAX_REQUEST_BYTES = 12 * 1024;
const CACHE_MAX_AGE_MS = 10 * 60 * 1000;

type NewsRow = {
  id: string;
  provider: string;
  title: string;
  summary: string | null;
  url: string;
  publisher: string;
  published_at: string;
  tickers: string[];
  category: NewsCategory;
};

type RefreshState = {
  category_refreshed_at: Record<string, string> | null;
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(code: string, message: string, status: number) {
  return jsonResponse({ ok: false, code, message }, status);
}

async function readLimitedBody(request: Request): Promise<string | null> {
  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function authenticate(request: Request): Promise<string | null> {
  const authorization = request.headers.get("Authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!token || !url || !anonKey) return null;
  try {
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  } catch {
    return null;
  }
}

function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("NEWS_STORAGE_NOT_CONFIGURED");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function consumeRateLimit(userId: string): Promise<boolean> {
  const { data, error } = await createServiceClient().rpc("consume_rate_limit", {
    p_user_id: userId,
    p_bucket: "news-list",
    p_limit: 240,
  });
  if (error) throw new Error("NEWS_RATE_LIMIT_UNAVAILABLE");
  return data === true;
}

function toNewsItem(row: NewsRow): NewsItem {
  return {
    id: row.id,
    provider: row.provider,
    title: row.title,
    summary: row.summary,
    url: row.url,
    publisher: row.publisher,
    publishedAt: row.published_at,
    tickers: Array.isArray(row.tickers) ? row.tickers : [],
    category: row.category,
  };
}

async function readCachedItems(
  client: ReturnType<typeof createServiceClient>,
  category: string,
  tickers: string[],
  limit: number,
  before: string | null,
): Promise<{ items: NewsItem[]; hasMore: boolean }> {
  let query = client.from("news_items")
    .select("id,provider,title,summary,url,publisher,published_at,tickers,category")
    .order("published_at", { ascending: false })
    .limit(limit + 1);
  if (category !== "all") query = query.eq("category", category);
  if (before) query = query.lt("published_at", before);
  if (tickers.length === 1) query = query.contains("tickers", tickers);
  if (tickers.length > 1) query = query.overlaps("tickers", tickers);
  const { data, error } = await query;
  if (error) throw new Error("NEWS_CACHE_UNAVAILABLE");
  const rows = (data ?? []) as NewsRow[];
  return {
    items: rows.slice(0, limit).map(toNewsItem),
    hasMore: rows.length > limit,
  };
}

function refreshKey(category: string, tickers: string[]): string {
  return `${category}:${tickers.length ? [...tickers].sort().join(",") : "*"}`;
}

async function hashUrl(url: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", "Use POST.", 405);

  const userId = await authenticate(request);
  if (!userId) return errorResponse("UNAUTHORIZED", "Authentication is required.", 401);

  let rawBody: string | null;
  try {
    rawBody = await readLimitedBody(request);
  } catch {
    return errorResponse("INVALID_REQUEST", "The request body could not be read.", 400);
  }
  if (rawBody === null) return errorResponse("REQUEST_TOO_LARGE", "The request body is too large.", 413);

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return errorResponse("INVALID_REQUEST", "A valid JSON request body is required.", 400);
  }
  const input = validateNewsListingRequest(body);
  if (!input) return errorResponse("INVALID_REQUEST", "The news filters are invalid.", 400);

  let client: ReturnType<typeof createServiceClient>;
  try {
    client = createServiceClient();
    if (!await consumeRateLimit(userId)) {
      return errorResponse("RATE_LIMITED", "The news request limit has been reached.", 429);
    }
  } catch {
    return errorResponse("SERVICE_UNAVAILABLE", "News is temporarily unavailable.", 503);
  }

  const key = refreshKey(input.category, input.tickers);
  let state: RefreshState | null = null;
  try {
    const { data, error } = await client.from("news_refresh_state")
      .select("category_refreshed_at")
      .eq("id", 1)
      .single();
    if (error) throw error;
    state = data as RefreshState;
  } catch {
    return errorResponse("SERVICE_UNAVAILABLE", "News is temporarily unavailable.", 503);
  }

  let cached: { items: NewsItem[]; hasMore: boolean };
  try {
    cached = await readCachedItems(client, input.category, input.tickers, input.limit, input.before);
  } catch {
    return errorResponse("SERVICE_UNAVAILABLE", "News is temporarily unavailable.", 503);
  }
  const refreshedAt = state?.category_refreshed_at?.[key] ?? null;

  if (!isNewsCacheStale(refreshedAt, Date.now(), CACHE_MAX_AGE_MS)) {
    return jsonResponse({
      ok: true,
      items: cached.items,
      providers: [...new Set(cached.items.map(({ provider }) => provider))],
      before: cached.hasMore ? cached.items[cached.items.length - 1]?.publishedAt ?? null : null,
      refreshedAt,
    }, 200);
  }

  const refreshed = await refreshWithStaleFallback(
    cached.items.length ? cached : null,
    refreshedAt,
    async () => {
      const { data, error } = await client.rpc("try_lock_news_refresh", {
        p_lock_seconds: 90,
      });
      if (error) throw error;
      return data === true;
    },
    async () => {
      try {
        const providerItems = (await fetchMassiveNews(input.tickers, AbortSignal.timeout(12000)))
          .filter((item) => matchesNewsCategory(item.category, input.category));
        if (providerItems.length > 0) {
          const fetchedAt = new Date().toISOString();
          const rows = await Promise.all(providerItems.map(async (item) => ({
            provider: item.provider,
            provider_item_id: item.providerItemId,
            url: item.url,
            url_hash: await hashUrl(item.url),
            title: item.title,
            summary: item.summary,
            publisher: item.publisher,
            published_at: item.publishedAt,
            tickers: item.tickers,
            category: item.category,
            fetched_at: fetchedAt,
          })));
          const { error } = await client.from("news_items")
            .upsert(rows, { onConflict: "url_hash" });
          if (error) throw error;
        }

        const completedAt = new Date().toISOString();
        const categoryRefreshTimes = {
          ...(state?.category_refreshed_at ?? {}),
          [key]: completedAt,
        };
        const { error } = await client.from("news_refresh_state")
          .update({
            refreshed_at: completedAt,
            category_refreshed_at: categoryRefreshTimes,
            lock_until: null,
            last_error: null,
            updated_at: completedAt,
          })
          .eq("id", 1);
        if (error) throw error;
        const refreshedItems = await readCachedItems(
          client,
          input.category,
          input.tickers,
          input.limit,
          input.before,
        );
        return { data: refreshedItems, refreshedAt: completedAt };
      } catch {
        await client.from("news_refresh_state")
          .update({
            lock_until: null,
            last_error: "provider_refresh_failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", 1);
        throw new Error("NEWS_REFRESH_FAILED");
      }
    },
  );

  if (refreshed.status === "unavailable") {
    return errorResponse("NEWS_UNAVAILABLE", "News is temporarily unavailable.", 503);
  }
  const result = refreshed.data;
  const failedRefresh = refreshed.status === "stale" && refreshed.refreshFailed;
  return jsonResponse({
    ok: true,
    items: result.items,
    providers: [...new Set(result.items.map(({ provider }) => provider))],
    before: result.hasMore ? result.items[result.items.length - 1]?.publishedAt ?? null : null,
    refreshedAt: refreshed.refreshedAt,
    ...(refreshed.status === "stale" ? { stale: true } : {}),
    ...(failedRefresh
      ? {
        warning: {
          code: "NEWS_UNAVAILABLE",
          message: "Showing cached headlines because news could not be refreshed.",
        },
      }
      : {}),
  }, 200);
});
