import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const MASSIVE_BASE_URL = "https://api.massive.com";

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

function parseTimeframe(timeframe: string): { multiplier: number; timespan: string } | null {
  const normalized = timeframe.trim().toLowerCase();
  const match = normalized.match(/^(\d+)\s*(m|min|h|hour|d|day|w|week|mo|month)$/);
  if (!match) {
    return null;
  }

  const multiplier = Number(match[1]);
  const unit = match[2];
  if (!Number.isInteger(multiplier) || multiplier < 1) {
    return null;
  }

  if (unit === "m" || unit === "min") return { multiplier, timespan: "minute" };
  if (unit === "h" || unit === "hour") return { multiplier, timespan: "hour" };
  if (unit === "d" || unit === "day") return { multiplier, timespan: "day" };
  if (unit === "w" || unit === "week") return { multiplier, timespan: "week" };
  if (unit === "mo" || unit === "month") return { multiplier, timespan: "month" };
  return null;
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
  const aggregation = parseTimeframe(timeframe);

  if (!asset || !aggregation || !isDate(startDate) || !isDate(endDate)) {
    return jsonResponse({
      error: "INVALID_REQUEST",
      detail: "asset, timeframe, startDate, and endDate are required. timeframe must look like 1m, 5m, 1h, 1d, 1w, or 1mo; dates must be YYYY-MM-DD.",
    }, 400);
  }

  if (Date.parse(`${startDate}T00:00:00Z`) > Date.parse(`${endDate}T00:00:00Z`)) {
    return jsonResponse({ error: "INVALID_REQUEST", detail: "startDate must not be after endDate." }, 400);
  }

  const url = new URL(`${MASSIVE_BASE_URL}/v2/aggs/ticker/${encodeURIComponent(asset)}/range/${aggregation.multiplier}/${aggregation.timespan}/${startDate}/${endDate}`);
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
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
    return jsonResponse({ error: code, detail, upstreamStatus: response.status }, response.status === 429 ? 429 : response.status === 401 || response.status === 403 ? 502 : 502);
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

  const rawResults = isRecord(payload) && Array.isArray(payload.results) ? payload.results : [];
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
