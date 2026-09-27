export type TabMetadata = {
  title: string;
  url: string;
  favIconUrl?: string;
};

export type TabGroupColor = "blue" | "cyan" | "grey" | "green" | "orange" | "pink" | "purple" | "red" | "yellow";

export type TabGroupMetadata = {
  title: string;
  color: TabGroupColor;
};

export type OpenTabEntry = TabMetadata & {
  kind: "open-tab";
  id: number;
  windowId: number;
  lastAccessed: number;
  group?: TabGroupMetadata;
};

export type ClosedTabEntry = TabMetadata & {
  kind: "closed-tab";
  sessionId: string;
  lastModified: number;
};

export type ClosedWindowEntry = TabMetadata & {
  kind: "closed-window";
  sessionId: string;
  tabCount: number;
  searchTabs: TabMetadata[];
  lastModified: number;
};

export type SearchEntry = OpenTabEntry | ClosedTabEntry | ClosedWindowEntry;

export type BrowserApi = {
  tabs: {
    query(queryInfo: object): Promise<Array<Record<string, unknown>>>;
    update(tabId: number, updateProperties: { active: boolean }): Promise<unknown>;
    remove(tabId: number): Promise<void>;
    onCreated: BrowserEvent;
    onRemoved: BrowserEvent;
    onUpdated: BrowserEvent;
    onActivated: BrowserEvent;
  };
  windows: { update(windowId: number, updateInfo: { focused: boolean }): Promise<unknown> };
  tabGroups: {
    query(queryInfo: object): Promise<Array<Record<string, unknown>>>;
    onCreated: BrowserEvent;
    onMoved: BrowserEvent;
    onRemoved: BrowserEvent;
    onUpdated: BrowserEvent;
  };
  sessions: {
    getRecentlyClosed(filter?: { maxResults?: number }): Promise<Array<Record<string, unknown>>>;
    restore(sessionId: string): Promise<Record<string, unknown>>;
    onChanged?: BrowserEvent;
  };
};

export type BrowserEvent = { addListener(listener: (...args: never[]) => void): void; removeListener(listener: (...args: never[]) => void): void };
