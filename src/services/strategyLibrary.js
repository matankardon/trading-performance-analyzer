import { supabase } from "../supabaseClient";
import { dbToStrategy, dbToStrategyVersion } from "../models/strategy";

export async function fetchStrategyLibrary(userId) {
  if (!userId) return [];

  const { data: strategyRows, error: strategyError } = await supabase
    .from("strategies")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (strategyError) throw strategyError;

  const ids = (strategyRows || []).map(({ id }) => id);
  const { data: versionRows, error: versionError } = ids.length
    ? await supabase
        .from("strategy_versions")
        .select("*")
        .in("strategy_id", ids)
        .order("version_number", { ascending: false })
    : { data: [], error: null };

  if (versionError) throw versionError;

  return (strategyRows || []).map((strategy) => dbToStrategy(
    strategy,
    (versionRows || [])
      .filter((version) => version.strategy_id === strategy.id)
      .map(dbToStrategyVersion),
  ));
}
