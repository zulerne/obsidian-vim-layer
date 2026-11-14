// Scrolls the active view: Reading view, the editor or any other scrollable view.
import { App } from "obsidian";

const SELECTORS = [".markdown-preview-view", ".cm-scroller", ".view-content"];

/**
 * The main scroll area of the active view: the largest visible candidate. A note's hidden editor
 * (or reading view) and its embeds use the same classes, so the first match is not always the right one.
 */
function scroller(app: App): HTMLElement | null {
	const root = app.workspace.getMostRecentLeaf()?.view?.containerEl ?? activeDocument.body;
	let best: HTMLElement | null = null;
	for (const el of Array.from(root.querySelectorAll<HTMLElement>(SELECTORS.join(",")))) {
		if (!el.isShown() || el.clientHeight === 0) continue;
		const scrollable = el.scrollHeight > el.clientHeight;
		const bestScrollable = best !== null && best.scrollHeight > best.clientHeight;
		if (!best || (scrollable && !bestScrollable) || (scrollable === bestScrollable && el.clientHeight > best.clientHeight)) best = el;
	}
	return best;
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
