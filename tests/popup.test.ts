import { faviconSource, TabSearchPopup } from "../src/popup";
import type { BrowserApi, BrowserEvent } from "../src/types";

type Listener = (...args: never[]) => void;
function event(): BrowserEvent & { listeners: Listener[]; fire(): void } {
  const listeners: Listener[] = [];
  return { listeners, addListener(listener) { listeners.push(listener); }, removeListener(listener) { const index = listeners.indexOf(listener); if (index >= 0) listeners.splice(index, 1); }, fire() { listeners.forEach((listener) => listener()); } };
}

function mockApi(overrides: Partial<BrowserApi> = {}): BrowserApi & { calls: string[] } {
  const created = event(); const removed = event(); const updated = event(); const activated = event(); const changed = event();
  const groupCreated = event(); const groupMoved = event(); const groupRemoved = event(); const groupUpdated = event();
  const calls: string[] = [];
  return {
    calls,
    tabs: { query: vi.fn().mockResolvedValue([{ id: 1, windowId: 2, groupId: 5, title: "Alpha", url: "https://alpha.test", lastAccessed: 10 }, { id: 3, windowId: 4, groupId: -1, title: "Beta", url: "https://beta.test", lastAccessed: 5 }]), update: vi.fn().mockImplementation(async (id: number) => { calls.push(`activate:${id}`); }), remove: vi.fn().mockImplementation(async (id: number) => { calls.push(`remove:${id}`); }), onCreated: created, onRemoved: removed, onUpdated: updated, onActivated: activated },
    windows: { update: vi.fn().mockImplementation(async (id: number) => { calls.push(`focus:${id}`); }) },
    tabGroups: { query: vi.fn().mockResolvedValue([{ id: 5, title: "Work", color: "blue" }]), onCreated: groupCreated, onMoved: groupMoved, onRemoved: groupRemoved, onUpdated: groupUpdated },
    sessions: { getRecentlyClosed: vi.fn().mockResolvedValue([{ lastModified: 12, tab: { sessionId: "s1", title: "Old Alpha", url: "https://old.test" } }, { lastModified: 11, window: { sessionId: "w1", tabs: [{ title: "Restored", url: "https://restore.test", active: true }, { title: "Search target", url: "https://target.test" }] } }]), restore: vi.fn().mockResolvedValue({ tab: { id: 8, windowId: 9 } }), onChanged: changed },
    ...overrides,
  };
}

function fixture(): void { document.body.innerHTML = '<input id="tab-search"><p id="status"></p><div id="results"></div>'; }

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

describe("TabSearchPopup", () => {
  beforeEach(() => { fixture(); vi.stubGlobal("close", vi.fn()); Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() }); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("renders grouped results, filters them, and supports clamped arrow navigation", async () => {
    const app = new TabSearchPopup(mockApi()); await app.start();
    expect(document.querySelectorAll(".result")).toHaveLength(4);
    expect(document.querySelectorAll(".section-title")).toHaveLength(2);
    const label = document.querySelector<HTMLElement>(".group-label")!;
    expect(label.textContent).toBe("Work");
    expect(label.dataset.groupColor).toBe("blue");
    expect(label.nextElementSibling?.classList.contains("title")).toBe(true);
    expect(label.closest(".result")?.getAttribute("aria-label")).toContain("group Work");
    expect([...document.querySelectorAll(".result")].filter((row) => row.textContent?.includes("Recently closed") || row.textContent?.includes("Closed window")).every((row) => !row.querySelector(".group-label"))).toBe(true);
    const input = document.querySelector<HTMLInputElement>("#tab-search")!;
    input.value = "work"; input.dispatchEvent(new Event("input"));
    expect(document.querySelectorAll(".result")).toHaveLength(1);
    expect(document.querySelector(".result")?.textContent).toContain("Alpha");
    input.value = "old"; input.dispatchEvent(new Event("input"));
    expect(document.querySelectorAll(".result")).toHaveLength(1);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(document.querySelector(".result")?.getAttribute("aria-selected")).toBe("true");
    input.value = "unmatched"; input.dispatchEvent(new Event("input"));
    expect(document.querySelector(".empty")?.textContent).toBe("No matching tabs");
  });

  it("activates across windows, restores tabs/windows, closes tabs and closes on escape", async () => {
    const api = mockApi(); const app = new TabSearchPopup(api); await app.start();
    const input = document.querySelector<HTMLInputElement>("#tab-search")!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await Promise.resolve(); expect(api.calls).toEqual(["focus:2", "activate:1"]);
    const old = [...document.querySelectorAll<HTMLElement>(".result")].find((row) => row.textContent?.includes("Old Alpha"))!;
    old.click(); await vi.waitFor(() => expect(api.sessions.restore).toHaveBeenCalledWith("s1"));
    await vi.waitFor(() => expect(api.calls).toEqual(["focus:2", "activate:1", "focus:9", "activate:8"]));
    vi.mocked(api.sessions.restore).mockResolvedValueOnce({ window: { id: 10 } });
    const closedWindow = [...document.querySelectorAll<HTMLElement>(".result")].find((row) => row.textContent?.includes("Closed window"))!;
    closedWindow.click(); await vi.waitFor(() => expect(api.sessions.restore).toHaveBeenCalledWith("w1"));
    await vi.waitFor(() => expect(api.calls).toContain("focus:10"));
    const close = document.querySelector<HTMLButtonElement>(".close")!; close.click(); await Promise.resolve(); expect(api.tabs.remove).toHaveBeenCalledWith(1);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); expect(window.close).toHaveBeenCalled();
    app.destroy();
  });

  it("shows load errors and removes live-update listeners on destroy", async () => {
    const api = mockApi(); api.tabs.query = vi.fn().mockRejectedValue(new Error("no tabs"));
    const app = new TabSearchPopup(api); await app.start();
    expect(document.querySelector("#status")?.textContent).toContain("Couldn’t load");
    app.destroy();
    expect((api.tabs.onCreated as unknown as { listeners: Listener[] }).listeners).toHaveLength(0);
    expect((api.tabGroups.onCreated as unknown as { listeners: Listener[] }).listeners).toHaveLength(0);
    expect((api.tabGroups.onMoved as unknown as { listeners: Listener[] }).listeners).toHaveLength(0);
    expect((api.tabGroups.onRemoved as unknown as { listeners: Listener[] }).listeners).toHaveLength(0);
    expect((api.tabGroups.onUpdated as unknown as { listeners: Listener[] }).listeners).toHaveLength(0);
    expect((api.sessions.onChanged as unknown as { listeners: Listener[] }).listeners).toHaveLength(0);
  });

  it("debounces live refreshes and ignores an invalidated pending load", async () => {
    vi.useFakeTimers();
    const api = mockApi();
    const firstTabs = deferred<Array<Record<string, unknown>>>();
    api.tabs.query = vi.fn().mockImplementationOnce(() => firstTabs.promise).mockResolvedValueOnce([
      { id: 7, windowId: 2, title: "Fresh result", url: "https://fresh.test", lastAccessed: 20 },
    ]);
    const app = new TabSearchPopup(api);
    const starting = app.start();
    (api.tabGroups.onUpdated as unknown as { fire(): void }).fire();
    vi.advanceTimersByTime(79);
    expect(api.tabs.query).toHaveBeenCalledTimes(1);
    firstTabs.resolve([{ id: 6, windowId: 2, title: "Stale result", url: "https://stale.test", lastAccessed: 10 }]);
    await Promise.resolve();
    expect(document.querySelector("#results")?.textContent).not.toContain("Stale result");
    await vi.advanceTimersByTimeAsync(1);
    await starting;
    expect(api.tabs.query).toHaveBeenCalledTimes(2);
    expect(document.querySelector("#results")?.textContent).toContain("Fresh result");
    app.destroy();
    vi.useRealTimers();
  });

  it("does not use remote favicons and permits only packaged or data image values", () => {
    expect(faviconSource("https://remote.test/icon.png")).toBe("icons/tab-search.svg");
    expect(faviconSource("data:image/png;base64,abc")).toContain("data:image");
    expect(faviconSource("moz-extension://extension/icon.svg")).toContain("moz-extension:");
  });
});
