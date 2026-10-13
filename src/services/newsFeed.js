import { supabase } from "../supabaseClient";

export const NEWS_CATEGORIES = Object.freeze([
  { value: "all", label: "All" },
  { value: "forex", label: "Forex" },
  { value: "crypto", label: "Crypto" },
  { value: "equities", label: "Equities" },
  { value: "macro", label: "Macro" },
]);

function messageFromFunctionError(error) {
  const response = error?.context;
  if (response && typeof response.clone === "function") {
    return response.clone().json().then((body) => ({
      code: body?.code || "",
      message: body?.message || error.message,
    })).catch(() => ({ code: "", message: error.message }));
  }
  return Promise.resolve({
    code: error?.code || "",
    message: error?.message || "The request failed. Please try again.",
  });
}

export async function loadNews({ category = "all", tickers = [], limit = 20, before } = {}) {
  const { data, error } = await supabase.functions.invoke("news", {
    body: { category, tickers, limit, ...(before ? { before } : {}) },
  });
  if (error) {
    const detail = await messageFromFunctionError(error);
    const requestError = new Error(detail.message || "News could not be loaded.");
    requestError.code = detail.code;
    throw requestError;
  }
  if (!data?.ok || !Array.isArray(data.items)) {
    const requestError = new Error(data?.message || "The news service returned an invalid response.");
    requestError.code = data?.code || "INVALID_RESPONSE";
    throw requestError;
  }
  return data;
}

export async function loadNewsExplanation(newsId) {
  const { data, error } = await supabase.functions.invoke("news-explain", {
    body: { newsId },
  });
  if (error) {
    const detail = await messageFromFunctionError(error);
    const requestError = new Error(detail.message || "The explanation could not be loaded.");
    requestError.code = detail.code;
    throw requestError;
  }
  if (!data?.ok || !data.explanation || typeof data.explanation !== "object") {
    const requestError = new Error(data?.message || "The explanation service returned an invalid response.");
    requestError.code = data?.code || "INVALID_RESPONSE";
    throw requestError;
  }
  return data.explanation;
}
