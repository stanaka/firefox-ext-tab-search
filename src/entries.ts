import type { ClosedTabEntry, ClosedWindowEntry, OpenTabEntry, SearchEntry, TabGroupColor, TabGroupMetadata, TabMetadata } from "./types";

const asText = (value: unknown): string => typeof value === "string" ? value : "";
const asNumber = (value: unknown): number => typeof value === "number" ? value : 0;
const TAB_GROUP_COLORS = new Set<TabGroupColor>(["blue", "cyan", "grey", "green", "orange", "pink", "purple", "red", "yellow"]);

export function metadata(tab: Record<string, unknown>): TabMetadata {
  return { title: asText(tab.title) || "Untitled tab", url: asText(tab.url), favIconUrl: asText(tab.favIconUrl) || undefined };
}

export function tabGroupIndex(groups: Array<Record<string, unknown>>): Map<number, TabGroupMetadata> {
  const index = new Map<number, TabGroupMetadata>();
  for (const group of groups) {
    if (typeof group.id !== "number") continue;
    const title = asText(group.title).trim();
    const color = asText(group.color);
    if (!title || !TAB_GROUP_COLORS.has(color as TabGroupColor)) continue;
    index.set(group.id, { title, color: color as TabGroupColor });
  }
  return index;
}

export function openTabEntry(tab: Record<string, unknown>, groups: ReadonlyMap<number, TabGroupMetadata> = new Map()): OpenTabEntry | undefined {
  if (typeof tab.id !== "number" || typeof tab.windowId !== "number") return undefined;
  const group = typeof tab.groupId === "number" && tab.groupId !== -1 ? groups.get(tab.groupId) : undefined;
  return { kind: "open-tab", id: tab.id, windowId: tab.windowId, lastAccessed: asNumber(tab.lastAccessed), ...metadata(tab), ...(group ? { group } : {}) };
}

export function closedEntries(session: Record<string, unknown>): SearchEntry | undefined {
  const lastModified = asNumber(session.lastModified);
  const tab = session.tab;
  if (tab && typeof tab === "object" && !Array.isArray(tab)) {
    const closedTab = tab as Record<string, unknown>;
    const sessionId = asText(closedTab.sessionId);
    if (!sessionId) return undefined;
    return { kind: "closed-tab", sessionId, lastModified, ...metadata(closedTab) } satisfies ClosedTabEntry;
  }
  const window = session.window;
  if (!window || typeof window !== "object" || Array.isArray(window)) return undefined;
  const closedWindow = window as Record<string, unknown>;
  const sessionId = asText(closedWindow.sessionId);
  if (!sessionId) return undefined;
  const rawTabs = closedWindow.tabs;
  if (!Array.isArray(rawTabs) || rawTabs.length === 0) return undefined;
  const searchTabs = rawTabs.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object").map(metadata);
  if (searchTabs.length === 0) return undefined;
  const active = rawTabs.find((item) => Boolean(item) && typeof item === "object" && (item as Record<string, unknown>).active) as Record<string, unknown> | undefined;
  return { kind: "closed-window", sessionId, tabCount: searchTabs.length, searchTabs, lastModified, ...metadata(active ?? rawTabs[0] as Record<string, unknown>) } satisfies ClosedWindowEntry;
}

export function sortRecent(entries: SearchEntry[]): SearchEntry[] {
  return [...entries].sort((a, b) => (b.kind === "open-tab" ? b.lastAccessed : b.lastModified) - (a.kind === "open-tab" ? a.lastAccessed : a.lastModified));
}
