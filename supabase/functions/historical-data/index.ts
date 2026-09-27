import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  buildMassiveAggregateUrl,
  parseTimeframe,
  supportedHistoricalTimeframes,
} from "../_shared/timeframe.ts";

const MASSIVE_BASE_URL = "https://api.massive.com";
const MAX_RESULT_PAGES = 10;
const PAGE_REQUEST_DELAY_MS = 1000;

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function authenticate(request: Request): Promise<boolean> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const token = authorization.slice("Bearer ".length).trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!token || !supabaseUrl || !supabaseAnonKey) {
    return false;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  return !error && Boolean(data.user);
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

async function readUpstreamError(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (isRecord(payload)) {
      const message = payload.error || payload.message || payload.status;
      if (typeof message === "string") return message;
    }
  } catch {
    // Use the HTTP status when Massive does not return JSON.
  }
  return `Massive returned HTTP ${response.status}.`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "METHOD_NOT_ALLOWED", detail: "Only POST is supported." }, 405);
  }

  if (!(await authenticate(request))) {
    return jsonResponse({ error: "AUTH_REQUIRED", detail: "A valid Supabase access token is required." }, 401);
  }

  const apiKey = Deno.env.get("MASSIVE_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "MASSIVE_NOT_CONFIGURED", detail: "MASSIVE_API_KEY is not configured on the Edge Function." }, 500);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "INVALID_REQUEST", detail: "Request body must be valid JSON." }, 400);
  }

  if (!isRecord(body)) {
    return jsonResponse({ error: "INVALID_REQUEST", detail: "Request body must be an object." }, 400);
  }

  const asset = typeof body.asset === "string" ? body.asset.trim().toUpperCase() : "";
  const timeframe = typeof body.timeframe === "string" ? body.timeframe : "";
  const startDate = typeof body.startDate === "string" ? body.startDate : "";
  const endDate = typeof body.endDate === "string" ? body.endDate : "";
  let aggregation: { multiplier: number; timespan: string };
  try {
    aggregation = parseTimeframe(timeframe);
  } catch (error) {
    return jsonResponse({
      error: "INVALID_TIMEFRAME",
      detail: error instanceof Error ? error.message : "The requested timeframe is not supported.",
    }, 400);
  }

  if (!asset || !isDate(startDate) || !isDate(endDate)) {
    return jsonResponse({
      error: "INVALID_REQUEST",
      detail: `asset, timeframe, startDate, and endDate are required. timeframe must be one of ${supportedHistoricalTimeframes.map(({ value }) => value).join(", ")}; dates must be YYYY-MM-DD.`,
    }, 400);
  }

  if (Date.parse(`${startDate}T00:00:00Z`) > Date.parse(`${endDate}T00:00:00Z`)) {
    return jsonResponse({ error: "INVALID_REQUEST", detail: "startDate must not be after endDate." }, 400);
  }

  const initialUrl = buildMassiveAggregateUrl(asset, timeframe, startDate, endDate);
  let pageUrl: URL | null = initialUrl;
  let pageCount = 0;
  const rawResults: unknown[] = [];

  while (pageUrl && pageCount < MAX_RESULT_PAGES) {
    if (pageUrl.origin !== MASSIVE_BASE_URL) {
      return jsonResponse({ error: "MASSIVE_INVALID_PAGINATION", detail: "Massive returned a pagination URL outside api.massive.com." }, 502);
    }

    pageCount += 1;
    const requestUrl = pageUrl.toString();
    console.info("[historical-data] Massive request", {
      page: pageCount,
      timeframe,
      multiplier: aggregation.multiplier,
      timespan: aggregation.timespan,
      url: requestUrl,
    });

    let response: Response;
    try {
      response = await fetch(requestUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch (error) {
      return jsonResponse({ error: "MASSIVE_UNREACHABLE", detail: error instanceof Error ? error.message : "Could not reach Massive." }, 502);
    }

    if (!response.ok) {
      const detail = await readUpstreamError(response);
      const code = response.status === 401 || response.status === 403
        ? "MASSIVE_AUTH_FAILED"
        : response.status === 429
          ? "MASSIVE_RATE_LIMITED"
          : response.status === 404
            ? "MASSIVE_SYMBOL_NOT_FOUND"
            : "MASSIVE_REQUEST_FAILED";
      return jsonResponse({ error: code, detail, upstreamStatus: response.status }, response.status === 429 ? 429 : 502);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return jsonResponse({ error: "MASSIVE_INVALID_RESPONSE", detail: "Massive returned a non-JSON response." }, 502);
    }

    if (!isRecord(payload) || payload.status === "ERROR") {
      const detail = isRecord(payload) && typeof payload.error === "string" ? payload.error : "Massive returned an error response.";
      return jsonResponse({ error: "MASSIVE_REQUEST_FAILED", detail }, 502);
    }

    const pageResults = Array.isArray(payload.results) ? payload.results : [];
    rawResults.push(...pageResults);
    console.info("[historical-data] Massive response", {
      page: pageCount,
      queryCount: payload.queryCount ?? null,
      resultsCount: payload.resultsCount ?? pageResults.length,
      returnedResults: pageResults.length,
      firstTimestamp: isRecord(pageResults[0]) ? pageResults[0].t ?? null : null,
      lastTimestamp: isRecord(pageResults[pageResults.length - 1])
        ? pageResults[pageResults.length - 1].t ?? null
        : null,
      hasNextPage: typeof payload.next_url === "string",
    });

    const nextUrl = typeof payload.next_url === "string" ? payload.next_url : "";
    if (!nextUrl) {
      pageUrl = null;
      continue;
    }

    try {
      pageUrl = new URL(nextUrl);
    } catch {
      return jsonResponse({ error: "MASSIVE_INVALID_PAGINATION", detail: "Massive returned an invalid pagination URL." }, 502);
    }

    if (pageCount < MAX_RESULT_PAGES) {
      await new Promise((resolve) => setTimeout(resolve, PAGE_REQUEST_DELAY_MS));
    }
  }

  if (pageUrl) {
    return jsonResponse({
      error: "HISTORICAL_RANGE_TOO_LARGE",
      detail: `Historical results exceeded the ${MAX_RESULT_PAGES}-page limit. Narrow the date range or select a coarser timeframe.`,
      pagesFetched: pageCount,
      barsFetched: rawResults.length,
    }, 413);
  }

  const bars = rawResults.flatMap((bar) => {
    if (!isRecord(bar) || ["t", "o", "h", "l", "c", "v"].some((field) => typeof bar[field] !== "number")) {
      return [];
    }
    return [{
      timestamp: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
    }];
  });

  return jsonResponse({ bars }, 200);
});
