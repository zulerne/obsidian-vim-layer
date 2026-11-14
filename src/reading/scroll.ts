// Scrolls the active view: Reading view, the editor or any other scrollable view.
import { App } from "obsidian";

const SELECTORS = [".markdown-preview-view", ".cm-scroller", ".view-content"];

function scroller(app: App): HTMLElement | null {
	const root = app.workspace.getMostRecentLeaf()?.view?.containerEl ?? activeDocument.body;
	for (const sel of SELECTORS) {
		const el = root.querySelector<HTMLElement>(sel);
		if (el && el.scrollHeight > el.clientHeight) return el;
	}
	for (const sel of SELECTORS) {
		const el = root.querySelector<HTMLElement>(sel);
		if (el) return el;
	}
	return null;
}

export function scrollBy(app: App, delta: number): void {
	scroller(app)?.scrollBy({ top: delta });
}

export function scrollHalfPage(app: App, direction: 1 | -1): void {
	const el = scroller(app);
	if (el) el.scrollBy({ top: (direction * el.clientHeight) / 2 });
}

export function scrollToEdge(app: App, edge: "top" | "bottom"): void {
	const el = scroller(app);
	if (el) el.scrollTo({ top: edge === "top" ? 0 : el.scrollHeight });
}
