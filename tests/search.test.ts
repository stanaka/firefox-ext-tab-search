import { closedEntries, metadata, openTabEntry, sortRecent, tabGroupIndex } from "../src/entries";
import { displayUrl, filterAndSort, normalize, score } from "../src/search";
import type { SearchEntry } from "../src/types";

const open = (overrides: Partial<SearchEntry> = {}): SearchEntry => ({ kind: "open-tab", id: 3, windowId: 1, title: "Project notes", url: "https://example.com/docs", lastAccessed: 50, ...overrides } as SearchEntry);

describe("entry conversion", () => {
  it("converts metadata and ignores unaddressable open tabs", () => {
    expect(metadata({})).toEqual({ title: "Untitled tab", url: "", favIconUrl: undefined });
    expect(openTabEntry({ title: "No ID" })).toBeUndefined();
    expect(openTabEntry({ id: 1, windowId: 2, title: "One", url: "https://one.test", lastAccessed: 9 })).toMatchObject({ kind: "open-tab", title: "One", lastAccessed: 9 });
  });

  it("attaches only valid, named group metadata to open tabs", () => {
    const colors = ["blue", "cyan", "grey", "green", "orange", "pink", "purple", "red", "yellow"] as const;
    const groups = tabGroupIndex([
      ...colors.map((color, index) => ({ id: index + 5, title: index === 0 ? "  Work  " : color, color })),
      { id: 20, title: "   ", color: "red" },
      { id: 21, title: "Unknown color", color: "teal" },
      { id: "22", title: "Invalid ID", color: "green" },
    ]);
    expect([...groups.values()].map((group) => group.color)).toEqual(colors);
    expect(openTabEntry({ id: 1, windowId: 2, groupId: 5 }, groups)).toMatchObject({ group: { title: "Work", color: "blue" } });
    expect(openTabEntry({ id: 2, windowId: 2, groupId: -1 }, groups)).not.toHaveProperty("group");
    expect(openTabEntry({ id: 3, windowId: 2, groupId: 99 }, groups)).not.toHaveProperty("group");
    expect(openTabEntry({ id: 4, windowId: 2, groupId: 20 }, groups)).not.toHaveProperty("group");
    expect(openTabEntry({ id: 5, windowId: 2, groupId: 21 }, groups)).not.toHaveProperty("group");
  });

  it("maps closed tabs and windows, choosing their active representative", () => {
    expect(closedEntries({ lastModified: 4, tab: { sessionId: "tab-1", title: "Old", url: "https://old.test" } })).toMatchObject({ kind: "closed-tab", sessionId: "tab-1", title: "Old" });
    const entry = closedEntries({ lastModified: 4, window: { sessionId: "window-1", tabs: [{ title: "First", url: "https://first.test" }, { title: "Active", url: "https://active.test", active: true }] } });
    expect(entry).toMatchObject({ kind: "closed-window", sessionId: "window-1", title: "Active", tabCount: 2 });
    expect(entry && entry.kind === "closed-window" && entry.searchTabs.map((tab) => tab.title)).toEqual(["First", "Active"]);
  });

  it("ignores closed tabs and windows without a usable nested session ID", () => {
    expect(closedEntries({ sessionId: "top-level-only", tab: { title: "Old" } })).toBeUndefined();
    expect(closedEntries({ window: { tabs: [{ title: "Old" }] } })).toBeUndefined();
    expect(closedEntries({ tab: { sessionId: 123, title: "Old" } })).toBeUndefined();
    expect(closedEntries({ window: { sessionId: "", tabs: [{ title: "Old" }] } })).toBeUndefined();
  });
});

describe("search", () => {
  it("normalizes whitespace and formats URLs safely", () => {
    expect(normalize("  HEllo\n world  ")).toBe("hello world");
    expect(displayUrl("https://example.com/path?q=x")).toBe("example.com/path");
    expect(displayUrl("not a url")).toBe("not a url");
  });

  it("weights exact/prefix title matches over host and full URLs", () => {
    const exact = open({ title: "docs", lastAccessed: 1 });
    const prefix = open({ id: 4, title: "Docs guide", lastAccessed: 2 });
    const host = open({ id: 5, title: "Elsewhere", url: "https://docs.example.test", lastAccessed: 3 });
    expect(score(exact, "docs")).toBeGreaterThan(score(prefix, "docs")!);
    expect(score(prefix, "docs")).toBeGreaterThan(score(host, "docs")!);
  });

  it("searches group names below titles and above hosts, including across fields", () => {
    const titleMatch = open({ id: 1, title: "work", lastAccessed: 1 });
    const groupMatch = open({ id: 2, title: "Project notes", group: { title: "Work", color: "blue" }, lastAccessed: 2 });
    const hostMatch = open({ id: 3, title: "Elsewhere", url: "https://work.example.test", lastAccessed: 3 });
    expect(score(titleMatch, "work")).toBeGreaterThan(score(groupMatch, "work")!);
    expect(score(groupMatch, "work")).toBeGreaterThan(score(hostMatch, "work")!);
    expect(score(groupMatch, "work project example")).toBeDefined();
    expect(filterAndSort([groupMatch, open({ id: 4, group: { title: "Personal", color: "pink" } })], "work")).toEqual([groupMatch]);
  });

  it("requires all tokens, searches every closed-window tab, and uses recency ties", () => {
    const closedWindow: SearchEntry = { kind: "closed-window", sessionId: "window", title: "Representative", url: "https://representative.test", tabCount: 2, searchTabs: [{ title: "Invoice May", url: "https://billing.test/may" }, { title: "Other", url: "" }], lastModified: 30 };
    expect(score(closedWindow, "invoice may")).toBeDefined();
    expect(score(closedWindow, "invoice missing")).toBeUndefined();
    const sorted = filterAndSort([open({ id: 1, title: "same", lastAccessed: 1 }), open({ id: 2, title: "same", lastAccessed: 9 })], "same");
    expect(sorted[0]).toMatchObject({ id: 2 });
    expect(sortRecent([open({ id: 1, lastAccessed: 1 }), open({ id: 2, lastAccessed: 9 })])[0]).toMatchObject({ id: 2 });
  });
});
