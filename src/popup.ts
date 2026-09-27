import { closedEntries, openTabEntry, sortRecent, tabGroupIndex } from "./entries";
import { displayUrl, filterAndSort } from "./search";
import type { BrowserApi, SearchEntry } from "./types";

const RECENT_LIMIT = 25;
const REFRESH_DELAY_MS = 80;

export class TabSearchPopup {
  private readonly input: HTMLInputElement;
  private readonly results: HTMLElement;
  private readonly status: HTMLElement;
  private openEntries: SearchEntry[] = [];
  private recentEntries: SearchEntry[] = [];
  private visible: SearchEntry[] = [];
  private selected = 0;
  private requestGeneration = 0;
  private refreshTimer: number | undefined;
  private readonly refreshListener: (...args: never[]) => void;

  constructor(private readonly api: BrowserApi, document: Document = window.document) {
    this.input = requiredElement<HTMLInputElement>(document, "tab-search");
    this.results = requiredElement(document, "results");
    this.status = requiredElement(document, "status");
    this.refreshListener = () => this.scheduleRefresh();
    this.input.addEventListener("input", () => { this.selected = 0; this.render(); });
    this.input.addEventListener("keydown", (event) => this.onKeydown(event));
    this.registerListeners();
  }

  async start(): Promise<void> { this.input.focus(); await this.refresh(); }

  destroy(): void {
    if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
    this.api.tabs.onCreated.removeListener(this.refreshListener);
    this.api.tabs.onRemoved.removeListener(this.refreshListener);
    this.api.tabs.onUpdated.removeListener(this.refreshListener);
    this.api.tabs.onActivated.removeListener(this.refreshListener);
    this.api.tabGroups.onCreated.removeListener(this.refreshListener);
    this.api.tabGroups.onMoved.removeListener(this.refreshListener);
    this.api.tabGroups.onRemoved.removeListener(this.refreshListener);
    this.api.tabGroups.onUpdated.removeListener(this.refreshListener);
    this.api.sessions.onChanged?.removeListener(this.refreshListener);
  }

  private registerListeners(): void {
    this.api.tabs.onCreated.addListener(this.refreshListener);
    this.api.tabs.onRemoved.addListener(this.refreshListener);
    this.api.tabs.onUpdated.addListener(this.refreshListener);
    this.api.tabs.onActivated.addListener(this.refreshListener);
    this.api.tabGroups.onCreated.addListener(this.refreshListener);
    this.api.tabGroups.onMoved.addListener(this.refreshListener);
    this.api.tabGroups.onRemoved.addListener(this.refreshListener);
    this.api.tabGroups.onUpdated.addListener(this.refreshListener);
    this.api.sessions.onChanged?.addListener(this.refreshListener);
  }

  private scheduleRefresh(): void {
    // Invalidate immediately: the pending response must not render during the debounce.
    this.requestGeneration += 1;
    if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => { void this.refresh(); }, REFRESH_DELAY_MS);
  }

  async refresh(preserveStatus = false): Promise<void> {
    const generation = ++this.requestGeneration;
    try {
      const [tabs, sessions, groups] = await Promise.all([
        this.api.tabs.query({}), this.api.sessions.getRecentlyClosed({ maxResults: RECENT_LIMIT }), this.api.tabGroups.query({}),
      ]);
      if (generation !== this.requestGeneration) return;
      const groupsById = tabGroupIndex(groups);
      this.openEntries = sortRecent(tabs.flatMap((tab) => {
        const entry = openTabEntry(tab, groupsById);
        return entry ? [entry] : [];
      }));
      this.recentEntries = sortRecent(sessions.map(closedEntries).filter((entry): entry is SearchEntry => entry !== undefined));
      if (!preserveStatus) this.status.textContent = "";
      this.render();
    } catch {
      if (generation !== this.requestGeneration) return;
      this.openEntries = [];
      this.recentEntries = [];
      this.status.textContent = "Couldn’t load tabs. Try again.";
      this.render();
    }
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") { window.close(); return; }
    if (!this.visible.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      this.selected = Math.max(0, Math.min(this.visible.length - 1, this.selected + (event.key === "ArrowDown" ? 1 : -1)));
      this.updateSelection();
    } else if (event.key === "Enter") {
      event.preventDefault();
      void this.activate(this.visible[this.selected]);
    }
  }

  private render(): void {
    this.results.replaceChildren();
    const query = this.input.value;
    const open = filterAndSort(this.openEntries, query);
    const recent = filterAndSort(this.recentEntries, query);
    this.visible = [...open, ...recent];
    this.selected = Math.max(0, Math.min(this.selected, Math.max(0, this.visible.length - 1)));
    this.input.setAttribute("aria-activedescendant", this.visible.length ? `result-${this.rowKey(this.visible[this.selected])}` : "");
    if (!this.visible.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = query ? "No matching tabs" : "No tabs to search";
      this.results.append(empty);
      return;
    }
    this.appendSection("Open Tabs", open);
    this.appendSection("Recently Closed", recent);
    this.updateSelection(false);
  }

  private appendSection(title: string, entries: SearchEntry[]): void {
    if (!entries.length) return;
    const heading = document.createElement("h2");
    heading.className = "section-title";
    heading.textContent = title;
    this.results.append(heading);
    for (const entry of entries) this.results.append(this.createRow(entry));
  }

  private createRow(entry: SearchEntry): HTMLElement {
    const row = document.createElement("div");
    row.id = `result-${this.rowKey(entry)}`;
    row.className = "result";
    row.role = "option";
    row.tabIndex = -1;
    row.setAttribute("aria-selected", "false");
    row.setAttribute("aria-label", this.label(entry));
    row.addEventListener("mouseenter", () => { this.selected = this.visible.indexOf(entry); this.updateSelection(); });
    row.addEventListener("click", () => { void this.activate(entry); });
    const icon = document.createElement("img");
    icon.className = "favicon";
    icon.alt = "";
    icon.src = faviconSource(entry.favIconUrl);
    icon.addEventListener("error", () => { icon.src = "icons/tab-search.svg"; }, { once: true });
    const copy = document.createElement("span");
    copy.className = "copy";
    const titleLine = document.createElement("span");
    titleLine.className = "title-line";
    if (entry.kind === "open-tab" && entry.group) {
      const group = document.createElement("span");
      group.className = "group-label";
      group.dataset.groupColor = entry.group.color;
      group.textContent = entry.group.title;
      titleLine.append(group);
    }
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = entry.title;
    titleLine.append(title);
    const subtitle = document.createElement("span");
    subtitle.className = "subtitle";
    subtitle.textContent = entry.kind === "closed-window" ? `${entry.tabCount} tabs · Closed window` : entry.kind === "closed-tab" ? "Recently closed" : displayUrl(entry.url);
    copy.append(titleLine, subtitle);
    row.append(icon, copy);
    if (entry.kind === "open-tab") {
      const close = document.createElement("button");
      close.className = "close";
      close.type = "button";
      close.title = "Close tab";
      close.setAttribute("aria-label", `Close ${entry.title}`);
      close.textContent = "×";
      close.addEventListener("click", (event) => { event.stopPropagation(); void this.closeTab(entry); });
      row.append(close);
    }
    return row;
  }

  private updateSelection(scroll = true): void {
    for (const row of this.results.querySelectorAll<HTMLElement>(".result")) row.setAttribute("aria-selected", String(row.id === `result-${this.rowKey(this.visible[this.selected])}`));
    const selected = document.getElementById(`result-${this.rowKey(this.visible[this.selected] ?? this.visible[0])}`);
    if (selected && scroll) selected.scrollIntoView({ block: "nearest" });
    this.input.setAttribute("aria-activedescendant", selected?.id ?? "");
  }

  private async activate(entry: SearchEntry): Promise<void> {
    try {
      if (entry.kind === "open-tab") {
        await this.api.windows.update(entry.windowId, { focused: true });
        await this.api.tabs.update(entry.id, { active: true });
      } else {
        const restored = await this.api.sessions.restore(entry.sessionId);
        if (entry.kind === "closed-window") {
          const restoredWindow = objectValue(restored.window);
          if (typeof restoredWindow?.id !== "number") throw new Error("Restored window is unavailable");
          await this.api.windows.update(restoredWindow.id, { focused: true });
        } else {
          const restoredTab = objectValue(restored.tab);
          if (typeof restoredTab?.id !== "number" || typeof restoredTab.windowId !== "number") throw new Error("Restored tab is unavailable");
          await this.api.windows.update(restoredTab.windowId, { focused: true });
          await this.api.tabs.update(restoredTab.id, { active: true });
        }
      }
      window.close();
    } catch { this.status.textContent = "That tab is no longer available. Refreshed results."; await this.refresh(true); }
  }

  private async closeTab(entry: Extract<SearchEntry, { kind: "open-tab" }>): Promise<void> {
    try { await this.api.tabs.remove(entry.id); this.scheduleRefresh(); }
    catch { this.status.textContent = "That tab is no longer available. Refreshed results."; await this.refresh(true); }
  }

  private rowKey(entry: SearchEntry): string { return entry.kind === "open-tab" ? `tab-${entry.id}` : `session-${entry.sessionId}`; }
  private label(entry: SearchEntry): string {
    if (entry.kind === "closed-window") return `${entry.title}, ${entry.tabCount} tabs, closed window`;
    if (entry.kind === "closed-tab") return `${entry.title}, recently closed`;
    return `${entry.title}${entry.group ? `, group ${entry.group.title}` : ""}, ${displayUrl(entry.url)}`;
  }
}

function requiredElement<T extends HTMLElement>(document: Document, id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function faviconSource(favIconUrl?: string): string {
  return favIconUrl?.startsWith("data:") || favIconUrl?.startsWith("moz-extension:") ? favIconUrl : "icons/tab-search.svg";
}
