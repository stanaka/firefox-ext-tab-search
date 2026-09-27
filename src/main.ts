import "./popup.css";
import { TabSearchPopup } from "./popup";
import type { BrowserApi } from "./types";

const popup = new TabSearchPopup(browser as unknown as BrowserApi);
void popup.start();
window.addEventListener("unload", () => popup.destroy(), { once: true });
