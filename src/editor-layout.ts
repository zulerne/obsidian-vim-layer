// Vim Normal and Visual mode on a non-Latin layout: one rule, every key goes to Vim by its QWERTY position.
// Obsidian's Vim only understands lowercase Cyrillic letters on its own; capitals (Ы for S) and punctuation
// ("/" types "." on a Russian layout) would do nothing or the wrong thing.
import { MarkdownView } from "obsidian";
import { isNonLatinLayout, qwertyChar, refreshLayout, trackLayout } from "./keys";
import type VimLayerPlugin from "./main";
import { cmOf, vimApi } from "./obsidian-internal";

const VIM_NAMES: Record<string, string> = { "<": "<lt>" };

/** Commands whose next key is a character to find or insert (f, t, r, marks, registers, macros): keep it as typed. */
const CHAR_ARGUMENT = /(^|[^g])[fFtTrm'`"q@]$/;

export class EditorLayout {
	private refreshTimer: number | null = null;

	constructor(private readonly plugin: VimLayerPlugin) {}

	/** Registered first, so every other handler sees the current layout guess. */
	load(): void {
		const { plugin } = this;
		const bind = (doc: Document) => plugin.registerDomEvent(doc, "keydown", (e) => this.onKeyDown(e), { capture: true });
		bind(activeDocument);
		plugin.registerEvent(plugin.app.workspace.on("window-open", (win) => bind(win.doc)));
		plugin.registerDomEvent(window, "focus", () => void refreshLayout());
		void refreshLayout();
	}

	private onKeyDown(e: KeyboardEvent): void {
		trackLayout(e);
		// The layout can change without a letter typed; check again shortly after any key.
		if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
		this.refreshTimer = window.setTimeout(() => void refreshLayout(), 300);

		if (this.plugin.settings.keyMode === "typed" || !isNonLatinLayout()) return;
		if (e.ctrlKey || e.metaKey || e.altKey || [...e.key].length !== 1) return;
		// A jump reads its own keys.
		if (this.plugin.jump?.active) return;
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		const target = activeDocument.activeElement;
		if (!view || view.getMode() !== "source" || !target?.closest(".cm-content") || !view.contentEl.contains(target)) return;
		const cm = cmOf(view);
		const vim = cm?.state?.vim;
		const api = vimApi();
		if (!cm || !vim || vim.insertMode || !api) return;
		if (CHAR_ARGUMENT.test((vim.inputState?.keyBuffer ?? []).join(""))) return;
		const key = qwertyChar(e);
		if (!key || key === e.key) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		api.handleKey(cm, VIM_NAMES[key] ?? key);
	}
}
