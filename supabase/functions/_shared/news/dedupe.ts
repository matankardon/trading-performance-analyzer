import type { NormalizedNewsItem } from "./types.ts";

export function dedupeNews(items: NormalizedNewsItem[]): NormalizedNewsItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const url = item.url.toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, "");
    const providerKey = `${item.provider}:${item.providerItemId}`;
    if (seen.has(providerKey) || seen.has(`url:${url}`)) return false;
    seen.add(providerKey);
    seen.add(`url:${url}`);
    return true;
  });
}
