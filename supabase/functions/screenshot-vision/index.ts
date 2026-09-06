import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const extractionFields = [
  "asset",
  "direction",
  "entry",
  "exit",
  "stopLoss",
  "takeProfit",
  "pnl",
  "date",
  "time",
  "timeframe",
  "positionSize",
  "riskReward",
  "strategy",
];

const conditionFields = [
  "Liquidity Sweep",
  "MSS",
  "FVG",
  "Displacement",
  "Order Block",
  "Stochastic Confirmation",
];

const conditionValues = [
  "NOT DETECTED",
  "CONFIDENT",
  "LIKELY",
  "UNCERTAIN",
];

const warning = "AI-extracted data is a draft — verify all fields before saving.";

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(code: string, detail: string, status: number) {
  return jsonResponse({ error: code, detail }, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactStringFields(
  value: unknown,
  fields: string[],
): value is Record<string, string> {
  if (!isRecord(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every(
    (field) => keys.includes(field) && typeof value[field] === "string",
  );
}

function isValidConditionStates(value: unknown): value is Record<string, string> {
  return hasExactStringFields(value, conditionFields) && conditionFields.every(
    (field) => conditionValues.includes(value[field]),
  );
}

function isValidExtraction(value: unknown): value is Record<string, string> {
  return hasExactStringFields(value, extractionFields);
}

function getImageDataUrl(body: unknown): string | null {
  if (!isRecord(body) || typeof body.image !== "string" || !body.image.trim()) {
    return null;
  }

  const image = body.image.trim();
  if (image.startsWith("data:image/") && image.includes(";base64,")) {
    return image;
  }

  if (/^[A-Za-z0-9+/]+=*$/.test(image)) {
    const mimeType = typeof body.mimeType === "string" && body.mimeType.startsWith("image/")
      ? body.mimeType
      : "image/png";
    return `data:${mimeType};base64,${image}`;
  }

  return null;
}

async function authenticate(request: Request): Promise<boolean> {
  const authorization = request.headers.get("Authorization");
  const hasAuthorizationHeader = Boolean(authorization);
  const hasBearerPrefix = Boolean(authorization?.startsWith("Bearer "));
  console.log("auth header present:", hasAuthorizationHeader);
  console.log("auth header starts with Bearer:", hasBearerPrefix);

  if (!hasBearerPrefix) {
    console.error("auth rejected: missing or invalid Authorization scheme");
    return false;
  }

  const token = authorization.slice("Bearer ".length).trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const hasSupabaseUrl = Boolean(supabaseUrl);
  const hasSupabaseAnonKey = Boolean(supabaseAnonKey);
  console.log("SUPABASE_URL defined:", hasSupabaseUrl);
  console.log("SUPABASE_ANON_KEY defined:", hasSupabaseAnonKey);

  if (!token || !supabaseUrl || !supabaseAnonKey) {
    console.error("auth rejected: token or Supabase auth configuration missing");
    return false;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  console.log("calling supabase.auth.getUser");
  const { data, error } = await supabase.auth.getUser(token);
  console.log("supabase.auth.getUser error:", error ? { message: error.message, status: error.status } : null);
  console.log("supabase.auth.getUser returned user:", Boolean(data.user));
  return !error && Boolean(data.user);
}

function visionPrompt() {
  return `Inspect the supplied trading screenshot. First identify the visible chart platform, timeframe, and relevant visual context internally. Then return only strict JSON matching this exact schema, with no markdown or extra keys:
{
  "extraction": {
    "asset": "", "direction": "", "entry": "", "exit": "", "stopLoss": "", "takeProfit": "", "pnl": "", "date": "", "time": "", "timeframe": "", "positionSize": "", "riskReward": "", "strategy": ""
  },
  "conditionStates": {
    "Liquidity Sweep": "NOT DETECTED", "MSS": "NOT DETECTED", "FVG": "NOT DETECTED", "Displacement": "NOT DETECTED", "Order Block": "NOT DETECTED", "Stochastic Confirmation": "NOT DETECTED"
  }
}

Use an empty string for every extraction field you cannot read confidently. Never guess numbers, dates, prices, or labels. For each setup condition, use exactly one of NOT DETECTED, CONFIDENT, LIKELY, or UNCERTAIN based only on visible evidence; use NOT DETECTED when unclear.`;
}

async function requestVision(imageDataUrl: string, apiKey: string, model: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [{
          role: "user",
          content: [
            { type: "text", text: visionPrompt() },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          ],
        }],
      }),
    });

    if (!response.ok) {
      return { error: `OpenAI returned HTTP ${response.status}.` };
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    return typeof content === "string" ? { content } : { error: "OpenAI returned no message content." };
  } catch (error) {
    return { error: error instanceof Error && error.name === "AbortError" ? "OpenAI request timed out." : "OpenAI request failed." };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request) => {
  console.log("request received:", { method: request.method, authorizationHeaderPresent: Boolean(request.headers.get("Authorization")) });

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Only POST requests are supported.", 405);
  }

  if (!(await authenticate(request))) {
    return errorResponse("AUTH_REQUIRED", "A valid Supabase access token is required.", 401);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  console.log("OPENAI_API_KEY diagnostics:", {
    defined: Boolean(apiKey),
    length: apiKey?.length ?? 0,
    startsWithSk: apiKey?.startsWith("sk-") ?? false,
  });
  if (!apiKey) {
    return errorResponse("OPENAI_NOT_CONFIGURED", "OPENAI_API_KEY is not configured.", 500);
  }

  const model = Deno.env.get("OPENAI_VISION_MODEL") || "gpt-4o-mini";
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Request body must be valid JSON.", 400);
  }

  const imageDataUrl = getImageDataUrl(body);
  if (!imageDataUrl) {
    return errorResponse("IMAGE_REQUIRED", "Provide a base64 image in the image field.", 400);
  }

  const visionResult = await requestVision(imageDataUrl, apiKey, model);
  if ("error" in visionResult) {
    return errorResponse("VISION_REQUEST_FAILED", visionResult.error, 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(visionResult.content);
  } catch {
    return errorResponse("VISION_PARSE_FAILED", "OpenAI returned malformed JSON.", 502);
  }

  if (!isRecord(parsed) || !isValidExtraction(parsed.extraction) || !isValidConditionStates(parsed.conditionStates)) {
    return errorResponse("VISION_SCHEMA_INVALID", "OpenAI response did not match the canonical screenshot schema.", 502);
  }

  return jsonResponse({
    extraction: parsed.extraction,
    conditionStates: parsed.conditionStates,
    model,
    warning,
  }, 200);
});