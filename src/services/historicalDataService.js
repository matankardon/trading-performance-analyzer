import { supabase } from "../supabaseClient";

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
    throw new Error(getFunctionErrorMessage(functionError) || getFunctionErrorMessage(error));
  }

  if (!Array.isArray(data?.bars)) {
    throw new Error("Historical data returned an incomplete result.");
  }

  return data.bars;
}