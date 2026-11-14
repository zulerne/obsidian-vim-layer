// Editor jumps, like flash.nvim / hop: labels over visible text, type a label to move the cursor there.
// "Jump to characters": type a few characters, then a label on each match. "Jump to word": a label on every word.
import { MarkdownView, Notice } from "obsidian";
import { eventToKey, isNonLatinLayout } from "./keys";
import type VimLayerPlugin from "./main";
import { hintLabels } from "./reading/hints";

/** The part of CodeMirror 6's EditorView that jumps use. */
interface CmView {
	state: { sliceDoc(from: number, to: number): string; selection: { main: { head: number; anchor: number } } };
	viewport: { from: number; to: number };
	coordsAtPos(pos: number): { left: number; top: number; bottom: number } | null;
	dispatch(spec: { selection: { anchor: number; head?: number }; scrollIntoView?: boolean }): void;
	focus(): void;
	scrollDOM: HTMLElement;
	contentDOM: HTMLElement;
}

interface Target {
	pos: number;
	label: string;
	marker: HTMLElement;
}

function editorView(view: MarkdownView | null): CmView | null {
	return (view?.editor as unknown as { cm?: CmView } | undefined)?.cm ?? null;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The current keyboard layout: physical key code → character (Chromium Keyboard API). */
type LayoutMap = { get(code: string): string | undefined; forEach(fn: (value: string, code: string) => void): void };

async function currentLayout(): Promise<LayoutMap | null> {
	const keyboard = (navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<LayoutMap> } }).keyboard;
	try {
		return (await keyboard?.getLayoutMap?.()) ?? null;
	} catch {
		return null;
	}
}

const isLatin = (ch: string | undefined) => !ch || ch.charCodeAt(0) <= 0x7e;

export class Jump {
	private cm: CmView | null = null;
	private phase: "idle" | "chars" | "labels" = "idle";
	private chars = "";
	/** One regex character class per typed key: the key's character in every layout it was matched for. */
	private charClasses: string[] = [];
	private typed = "";
	private targets: Target[] = [];
	private container: HTMLElement | null = null;
	private layout: LayoutMap | null = null;

	constructor(private readonly plugin: VimLayerPlugin) {}

	get active(): boolean {
		return this.phase !== "idle";
	}

	load(): void {
		const { plugin } = this;
		plugin.addCommand({ id: "jump-to-chars", name: "Jump to characters (type, then a label)", callback: () => this.start("chars") });
		plugin.addCommand({ id: "jump-to-word", name: "Jump to word (a label on every word)", callback: () => this.start("word") });
		// Capture phase on the document, registered before the Reading view layer, so Esc cancels a jump first.
		const bind = (doc: Document) => {
			plugin.registerDomEvent(doc, "keydown", (e) => this.onKeyDown(e), { capture: true });
			plugin.registerDomEvent(doc, "mousedown", () => this.cancel(), { capture: true });
		};
		bind(activeDocument);
		plugin.registerEvent(plugin.app.workspace.on("window-open", (win) => bind(win.doc)));
		plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", () => this.cancel()));
		// Remember a non-Latin layout when you type in it, so jumps can find its letters while a Latin layout is on.
		plugin.registerDomEvent(activeDocument, "keydown", (e) => this.learnLayout(e), { capture: true, passive: true });
		plugin.register(() => this.cancel());
	}

	private start(kind: "chars" | "word"): void {
		void currentLayout().then((layout) => this.begin(kind, layout));
	}

	private begin(kind: "chars" | "word", layout: LayoutMap | null): void {
		this.cancel();
		this.layout = layout;
		const cm = editorView(this.plugin.app.workspace.getActiveViewOfType(MarkdownView));
		if (!cm) {
			new Notice("Vim Layer: jumps work in the editor");
			return;
		}
		this.cm = cm;
		if (kind === "word") {
			this.showLabels(this.wordRegex());
			return;
		}
		this.phase = "chars";
		this.chars = "";
		cm.contentDOM.addClass("vim-layer-jump-dim");
		cm.scrollDOM.addEventListener("scroll", this.onScroll, { once: true });
	}

	private wordRegex(): RegExp {
		try {
			return new RegExp(this.plugin.settings.jumpWordRegex, "gu");
		} catch {
			new Notice("Vim Layer: invalid word pattern, using the default");
			return /[\p{L}\p{N}_]{3,}/gu;
		}
	}

	private readonly onScroll = () => this.cancel();

	cancel(): void {
		if (this.phase === "idle") return;
		this.phase = "idle";
		this.container?.remove();
		this.container = null;
		this.targets = [];
		this.typed = "";
		this.chars = "";
		this.charClasses = [];
		this.layout = null;
		this.cm?.contentDOM.removeClass("vim-layer-jump-dim");
		this.cm?.scrollDOM.removeEventListener("scroll", this.onScroll);
		this.cm = null;
	}

	/** Visible document positions where the pattern matches. */
	private matches(regex: RegExp): number[] {
		const cm = this.cm;
		if (!cm) return [];
		const { from, to } = cm.viewport;
		const text = cm.state.sliceDoc(from, to);
		const box = cm.scrollDOM.getBoundingClientRect();
		const out: number[] = [];
		regex.lastIndex = 0;
		for (let m = regex.exec(text); m; m = regex.exec(text)) {
			if (m[0].length === 0) {
				regex.lastIndex++;
				continue;
			}
			const pos = from + m.index;
			const c = cm.coordsAtPos(pos);
			if (c && c.top >= box.top && c.bottom <= box.bottom) out.push(pos);
		}
		return out;
	}

	private showLabels(regex: RegExp): void {
		const cm = this.cm;
		if (!cm) return;
		const positions = this.matches(regex);
		if (!positions.length) {
			if (this.chars) new Notice(`Vim Layer: no "${this.chars}" on screen`);
			this.cancel();
			return;
		}
		if (positions.length === 1) {
			this.jump(positions[0], false);
			return;
		}
		// Nearest to the cursor get the shortest labels.
		const head = cm.state.selection.main.head;
		const order = [...positions].sort((a, b) => Math.abs(a - head) - Math.abs(b - head));
		const labels = hintLabels(order.length, this.plugin.settings.hintChars);
		const container = activeDocument.body.createDiv({ cls: "vim-layer-hints" });
		container.style.setProperty("--vim-layer-hint-font-size", `${this.plugin.settings.hintFontSize}px`);
		this.container = container;
		this.targets = order.map((pos, i) => {
			const c = cm.coordsAtPos(pos);
			const marker = container.createSpan({ cls: "vim-layer-hint vim-layer-jump-label", text: this.display(labels[i]) });
			marker.style.left = `${c?.left ?? 0}px`;
			marker.style.top = `${c?.top ?? 0}px`;
			return { pos, label: labels[i], marker };
		});
		this.phase = "labels";
		this.typed = "";
		cm.contentDOM.addClass("vim-layer-jump-dim");
		cm.scrollDOM.removeEventListener("scroll", this.onScroll);
		cm.scrollDOM.addEventListener("scroll", this.onScroll, { once: true });
	}

	/** Move the cursor; Shift on the last label letter selects from the cursor instead. */
	private jump(pos: number, select: boolean): void {
		const cm = this.cm;
		this.cancel();
		if (!cm) return;
		const anchor = cm.state.selection.main.anchor;
		cm.dispatch({ selection: select ? { anchor, head: pos } : { anchor: pos } });
		cm.focus();
	}

	private onKeyDown(e: KeyboardEvent): void {
		if (this.phase === "idle") return;
		if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		if (e.key === "Escape") {
			this.cancel();
			return;
		}
		if (this.phase === "chars") {
			if (e.key === "Backspace") {
				this.chars = this.chars.slice(0, -1);
				this.charClasses.pop();
				return;
			}
			// Search characters are taken as typed, so words in any language can be found.
			if ([...e.key].length !== 1 || e.ctrlKey || e.metaKey) {
				this.cancel();
				return;
			}
			this.chars += e.key;
			this.charClasses.push(this.charClass(e));
			if (this.charClasses.length >= this.plugin.settings.jumpCharCount) {
				const flags = this.plugin.settings.jumpCaseSensitive ? "gu" : "giu";
				this.showLabels(new RegExp(this.charClasses.join(""), flags));
			}
			return;
		}
		if (e.key === "Backspace") {
			this.typed = this.typed.slice(0, -1);
			this.refilter();
			return;
		}
		// Labels are Latin letters, read by key position so they work in any layout.
		const key = eventToKey(e, this.plugin.settings.keyMode);
		if (key === null || [...key].length !== 1) {
			this.cancel();
			return;
		}
		const candidate = this.typed + key.toLowerCase();
		const exact = this.targets.find((t) => t.label === candidate);
		if (exact) {
			this.jump(exact.pos, e.shiftKey);
			return;
		}
		if (!this.targets.some((t) => t.label.startsWith(candidate))) {
			this.cancel();
			return;
		}
		this.typed = candidate;
		this.refilter();
	}

	private saveTimer: number | null = null;

	/**
	 * Remember which character each key types in your non-Latin layout, from the keys you press.
	 * (The Keyboard API reports Latin characters for a Russian layout on macOS, so it cannot be asked.)
	 */
	private learnLayout(e: KeyboardEvent): void {
		if (e.ctrlKey || e.metaKey || e.altKey || [...e.key].length !== 1 || isLatin(e.key)) return;
		if (!/^(Key[A-Z]|Backquote|BracketLeft|BracketRight|Semicolon|Quote|Comma|Period)$/.test(e.code)) return;
		const ch = e.key.toLowerCase();
		const known = this.plugin.settings.jumpAltLayout;
		if (known[e.code] === ch) return;
		this.plugin.settings.jumpAltLayout = { ...known, [e.code]: ch };
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => void this.plugin.saveSettings(), 2000);
	}

	/**
	 * A typed key matches what it types in the current layout and what it types on QWERTY,
	 * so Cyrillic and Latin words are both found without switching layouts.
	 */
	private charClass(e: KeyboardEvent): string {
		const alternatives = new Set([e.key]);
		const qwerty = eventToKey(e, "physical");
		if (qwerty && [...qwerty].length === 1) alternatives.add(qwerty);
		for (const ch of [this.layout?.get(e.code), this.plugin.settings.jumpAltLayout[e.code]]) {
			if (ch) alternatives.add(e.shiftKey ? ch.toUpperCase() : ch);
		}
		return `(?:${[...alternatives].map(escapeRegex).join("|")})`;
	}

	/** Labels are typed by key position; with a non-Latin layout they are shown in that layout's letters. */
	private display(label: string): string {
		if (!isNonLatinLayout()) return label;
		const alt = this.plugin.settings.jumpAltLayout;
		return [...label].map((ch) => (/^[a-z]$/.test(ch) ? (alt[`Key${ch.toUpperCase()}`] ?? ch) : ch)).join("");
	}

	private refilter(): void {
		for (const t of this.targets) {
			const matches = t.label.startsWith(this.typed);
			t.marker.toggleClass("is-filtered", !matches);
			t.marker.empty();
			if (matches && this.typed) {
				t.marker.createSpan({ cls: "vim-layer-hint-typed", text: this.display(this.typed) });
				t.marker.appendText(this.display(t.label.slice(this.typed.length)));
			} else {
				t.marker.setText(this.display(t.label));
			}
		}
	}
}
