import { supabase } from "../supabaseClient";

export async function loadTradeScreenshotSignedUrl(screenshotPath) {
  if (!screenshotPath) throw new Error("This trade has no saved screenshot.");
  const { data, error } = await supabase.storage
    .from("trade-screenshots")
    .createSignedUrl(screenshotPath, 300);
  if (error) throw new Error("Could not load the saved trade screenshot.");
  if (!data?.signedUrl) throw new Error("Could not load the saved trade screenshot.");
  return data.signedUrl;
}
