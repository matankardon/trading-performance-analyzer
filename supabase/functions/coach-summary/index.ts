import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { processCoachSummary } from "./postProcessing.ts";
import { isValidCoachAnalysis } from "./requestValidation.ts";

const MAX_REQUEST_BYTES = 50 * 1024;
const SYSTEM_PROMPT = "Trading journal coach. Use ONLY numbers present in the input. No price predictions, no signals, no financial advice, no invented causes. Mention sample sizes; flag low-sample items as tentative. Be concise and plain-language.";

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(error: string, status: number) {
  return jsonResponse({ ok: false, error }, status);
}

async function authenticate(request: Request): Promise<boolean> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const token = authorization.slice("Bearer ".length).trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!token || !supabaseUrl || !supabaseAnonKey) return false;

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    return !error && Boolean(data.user);
  } catch {
    return false;
  }
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
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return new TextDecoder().decode(bytes);
}

async function requestAnthropic(analysis: Record<string, unknown>, apiKey: string, model: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const userPrompt = `Summarize this precomputed, anonymized Coaching analysis. Return only strict JSON with exactly these fields: {"summary":"string","strengths":["string"],"weaknesses":["string"],"focusNext":["string"]}. Use no more than 3 items in each list. Every item must name its source metric and cite the relevant sample size. Treat n<5 as tentative. Do not add identifiers or details not present in the aggregates.\n\nANALYSIS:\n${JSON.stringify(analysis)}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) return { error: `AI provider returned HTTP ${response.status}.` };

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { error: "AI provider returned a non-JSON response." };
    }
    if (typeof payload !== "object" || payload === null || !("content" in payload) || !Array.isArray(payload.content)) {
      return { error: "AI provider returned no summary content." };
    }
    const content = payload.content
      .filter((block: unknown) => typeof block === "object" && block !== null && "type" in block && block.type === "text" && "text" in block && typeof block.text === "string")
      .map((block: { text: string }) => block.text)
      .join("\n");
    return content.trim() ? { content } : { error: "AI provider returned no summary content." };
  } catch (error) {
    return {
      error: error instanceof Error && error.name === "AbortError"
        ? "AI summary request timed out. Please retry."
        : "AI summary request failed. Please retry.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return errorResponse("Only POST requests are supported.", 405);
  }
  if (!(await authenticate(request))) {
    return errorResponse("A valid Supabase access token is required.", 401);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return errorResponse("AI summary is not configured. Set ANTHROPIC_API_KEY for this Edge Function.", 500);
  }

  let bodyText: string | null;
  try {
    bodyText = await readLimitedBody(request);
  } catch {
    return errorResponse("Could not read the request body.", 400);
  }
  if (bodyText === null) {
    return errorResponse("Request body exceeds the 50 KB limit.", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)
    || Object.keys(body).length !== 1 || !("analysis" in body)
    || !isValidCoachAnalysis(body.analysis)) {
    return errorResponse("Request must contain only valid precomputed Coaching aggregates.", 400);
  }

  const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001";
  const providerResult = await requestAnthropic(body.analysis, apiKey, model);
  if ("error" in providerResult) return errorResponse(providerResult.error, 502);

  const processed = processCoachSummary(providerResult.content, body.analysis);
  if (!processed.ok) {
    return errorResponse(`AI summary was rejected: ${processed.error}. Please retry.`, 502);
  }

  return jsonResponse({ ok: true, ...processed.result }, 200);
});