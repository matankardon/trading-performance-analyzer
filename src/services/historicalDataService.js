import { supabase } from "../supabaseClient";

export const historicalAssetSuggestions = Object.freeze(["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "SPY", "QQQ"]);

function getFunctionErrorMessage(error) {
  return error?.detail || error?.message || "Historical data request failed.";
}

export async function fetchHistoricalBars(asset, timeframe, startDate, endDate) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(sessionError.message);
  }

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error("A valid Supabase access token is required.");
  }

  const { data, error } = await supabase.functions.invoke("historical-data", {
    body: { asset, timeframe, startDate, endDate },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    let functionError;
    try {
      functionError = error.context?.clone
        ? await error.context.clone().json()
        : error.context;
    } catch {
      functionError = null;
    }
    if (functionError?.error === "AUTH_REQUIRED" || error.status === 401) {
      throw new Error("Your session expired. Please sign in again.");
    }
    throw new Error(getFunctionErrorMessage(functionError) || getFunctionErrorMessage(error));
  }

  if (!Array.isArray(data?.bars)) {
    throw new Error("Historical data returned an incomplete result.");
  }

  return data.bars;
}