// Vimium-style link hints: letter labels over visible clickable elements.
import { App, Platform } from "obsidian";
import { eventToKey, KeyMode } from "../keys";

interface Hint {
	label: string;
	el: HTMLElement;
	marker: HTMLElement;
}

export interface HintOptions {
	chars: string;
	selectors: string[];
	fontSize: number;
	keyMode: KeyMode;
}

/**
 * Prefix-free labels, shortest first (Vimium's algorithm): grow strings by prepending characters,
 * drop the interior nodes, then reverse each label so that none is a prefix of another.
 */
export function hintLabels(count: number, chars: string): string[] {
	const unique = [...new Set(chars.toLowerCase().split(""))];
	const alphabet = unique.length > 1 ? unique : ["s", "a", "d", "f"];
	if (count <= 0) return [];
	const hints = [""];
	let offset = 0;
	while (hints.length - offset < count || hints.length === 1) {
		const hint = hints[offset++];
		for (const ch of alphabet) hints.push(ch + hint);
	}
	return hints
		.slice(offset, offset + count)
		.map((s) => [...s].reverse().join(""))
		.sort();
}

function isVisible(el: HTMLElement): boolean {
	const rect = el.getBoundingClientRect();
	if (rect.width === 0 || rect.height === 0) return false;
	if (rect.bottom < 0 || rect.right < 0 || rect.top > activeWindow.innerHeight || rect.left > activeWindow.innerWidth) return false;
	const style = activeWindow.getComputedStyle(el);
	return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
}

export class HintEngine {
	private container: HTMLElement | null = null;
	private hints: Hint[] = [];
	private typed = "";
	private newTab = false;

	constructor(
		private readonly app: App,
		private readonly options: () => HintOptions,
	) {}

	get active(): boolean {
		return this.container !== null;
	}

	show(newTab: boolean): void {
		this.hide();
		const opts = this.options();
		const targets = this.collectTargets(opts.selectors);
		if (!targets.length) return;
		this.newTab = newTab;
		const labels = hintLabels(targets.length, opts.chars);
		const container = activeDocument.body.createDiv({ cls: "vim-layer-hints" });
		container.style.setProperty("--vim-layer-hint-font-size", `${opts.fontSize}px`);
		this.container = container;
		targets.forEach((el, i) => {
			const rect = el.getBoundingClientRect();
			const marker = container.createSpan({ cls: "vim-layer-hint", text: labels[i] });
			marker.style.left = `${Math.max(0, rect.left)}px`;
			marker.style.top = `${Math.max(0, rect.top)}px`;
			this.hints.push({ label: labels[i], el, marker });
		});
	}

	hide(): void {
		this.container?.remove();
		this.container = null;
		this.hints = [];
		this.typed = "";
	}

	/** Handle a key while hints are shown. Always consumes the key. */
	handleKey(e: KeyboardEvent): void {
		if (e.key === "Escape") {
			this.hide();
			return;
		}
		if (e.key === "Backspace") {
			this.typed = this.typed.slice(0, -1);
			this.refilter();
			return;
		}
		const key = eventToKey(e, this.options().keyMode);
		if (key === null || [...key].length !== 1) return;
		const ch = key.toLowerCase();
		const candidate = this.typed + ch;
		if (!this.hints.some((h) => h.label.startsWith(candidate))) return;
		this.typed = candidate;
		const exact = this.hints.find((h) => h.label === candidate);
		if (exact) {
			// Shift on the last letter opens in a new tab even after a plain `f`.
			const newTab = this.newTab || e.shiftKey;
			this.hide();
			this.activate(exact.el, newTab);
			return;
		}
		this.refilter();
	}

	private refilter(): void {
		for (const hint of this.hints) {
			const matches = hint.label.startsWith(this.typed);
			hint.marker.toggleClass("is-filtered", !matches);
			hint.marker.empty();
			if (matches && this.typed) {
				hint.marker.createSpan({ cls: "vim-layer-hint-typed", text: this.typed });
				hint.marker.appendText(hint.label.slice(this.typed.length));
			} else {
				hint.marker.setText(hint.label);
			}
		}
	}

	private activate(el: HTMLElement, newTab: boolean): void {
		if (!newTab) {
			el.click();
			return;
		}
		const linktext = el.getAttribute("data-href") ?? el.getAttribute("href");
		const internal =
			el.classList.contains("internal-link") ||
			(el.tagName === "A" && linktext !== null && !/^[a-z]+:\/\//i.test(linktext) && !linktext.startsWith("#"));
		if (internal && linktext) {
			void this.app.workspace.openLinkText(linktext, this.app.workspace.getActiveFile()?.path ?? "", "tab");
			return;
		}
		el.dispatchEvent(
			new MouseEvent("click", {
				bubbles: true,
				cancelable: true,
				view: activeWindow,
				ctrlKey: !Platform.isMacOS,
				metaKey: Platform.isMacOS,
			}),
		);
	}

	private collectTargets(selectors: string[]): HTMLElement[] {
		const seen = new Set<Element>();
		const targets: HTMLElement[] = [];
		for (const selector of selectors) {
			let nodes: NodeListOf<Element>;
			try {
				nodes = activeDocument.querySelectorAll(selector);
			} catch {
				continue;
			}
			nodes.forEach((node) => {
				if (!node.instanceOf(HTMLElement) || seen.has(node) || !isVisible(node)) return;
				seen.add(node);
				targets.push(node);
			});
		}
		return targets;
	}
}
