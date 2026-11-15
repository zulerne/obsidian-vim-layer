// Scrolls the active view: Reading view, the editor or any other scrollable view.
import { App } from "obsidian";

// .bases-view: the table or cards of a base.
const SELECTORS = [".markdown-preview-view", ".cm-scroller", ".bases-view", ".view-content"];

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

/** Bumped by every scroll command, so a running scroll-to-bottom stops when you scroll elsewhere. */
let scrollRun = 0;

export function scrollBy(app: App, delta: number): void {
	scrollRun++;
	scroller(app)?.scrollBy({ top: delta });
}

export function scrollHalfPage(app: App, direction: 1 | -1): void {
	scrollRun++;
	const el = scroller(app);
	if (el) el.scrollBy({ top: (direction * el.clientHeight) / 2 });
}

export function scrollToEdge(app: App, edge: "top" | "bottom"): void {
	const run = ++scrollRun;
	const el = scroller(app);
	if (!el) return;
	if (edge === "top") {
		el.scrollTo({ top: 0 });
		return;
	}
	// Reading view renders long notes lazily: the note grows after you reach its end, so follow it until the height settles.
	let tries = 0;
	let stable = 0;
	let height = -1;
	const step = () => {
		if (run !== scrollRun) return;
		// Plain assignment: scrollTo() stops short here while the note is still being rendered.
		el.scrollTop = el.scrollHeight;
		stable = el.scrollHeight === height ? stable + 1 : 0;
		height = el.scrollHeight;
		if (++tries < 20 && stable < 3) window.setTimeout(step, 50);
	};
	step();
}
