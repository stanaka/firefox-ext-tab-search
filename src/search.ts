import type { SearchEntry, TabMetadata } from "./types";

export function normalize(value: string): string { return value.toLocaleLowerCase().trim().replace(/\s+/g, " "); }

export function displayUrl(url: string): string {
  try { return new URL(url).host + (new URL(url).pathname === "/" ? "" : new URL(url).pathname); } catch { return url; }
}

function subsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const character of haystack) if (character === needle[index]) index += 1;
  return index === needle.length;
}

function tokenScore(token: string, fields: TabMetadata): number {
  const title = normalize(fields.title);
  const group = "groupTitle" in fields && typeof fields.groupTitle === "string" ? normalize(fields.groupTitle) : "";
  const url = normalize(fields.url);
  let host = "";
  try { host = normalize(new URL(fields.url).hostname); } catch { /* URL is display-only input. */ }
  if (title === token) return 120;
  if (title.startsWith(token)) return 100;
  if (title.includes(token)) return 85;
  if (subsequence(token, title)) return 65;
  if (group === token) return 60;
  if (group.startsWith(token)) return 58;
  if (group.includes(token)) return 55;
  if (subsequence(token, group)) return 52;
  if (host.startsWith(token)) return 50;
  if (host.includes(token)) return 40;
  if (url.includes(token)) return 25;
  return -1;
}

function entryFields(entry: SearchEntry): Array<TabMetadata & { groupTitle?: string }> {
  if (entry.kind === "closed-window") return entry.searchTabs;
  if (entry.kind === "open-tab" && entry.group) return [{ ...entry, groupTitle: entry.group.title }];
  return [entry];
}

export function score(entry: SearchEntry, query: string): number | undefined {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (!tokens.length) return 0;
  const candidates = entryFields(entry);
  let best: number | undefined;
  for (const candidate of candidates) {
    const scores = tokens.map((token) => tokenScore(token, candidate));
    if (scores.every((value) => value >= 0)) best = Math.max(best ?? -Infinity, scores.reduce((sum, value) => sum + value, 0));
  }
  return best;
}

export function filterAndSort(entries: SearchEntry[], query: string): SearchEntry[] {
  return entries.map((entry) => ({ entry, score: score(entry, query) })).filter((item): item is { entry: SearchEntry; score: number } => item.score !== undefined)
    .sort((a, b) => b.score - a.score || recency(b.entry) - recency(a.entry)).map((item) => item.entry);
}

export function recency(entry: SearchEntry): number { return entry.kind === "open-tab" ? entry.lastAccessed : entry.lastModified; }
