// Non-Latin keyboard layouts in one place: track which layout is on, learn which character each key types in it,
// and let Obsidian's Vim read keys by position.
//
// - Letters and other non-ASCII characters go through Vim's own langmap (built from the learned layout), so f/t/r
//   still take the typed character literally.
// - ASCII punctuation that sits on another key in the layout ("/" types "." on a Russian layout) cannot be
//   remapped by langmap without breaking Latin layouts; those keys are sent to Vim by position here.
import { onEveryWindow } from "./windows";
import { MarkdownView } from "obsidian";
import { isNonLatinLayout, qwertyChar, refreshLayout, trackLayout } from "./keys";
import type VimLayerPlugin from "./main";
import { cmOf, vimApi } from "./obsidian-internal";

const VIM_NAMES: Record<string, string> = { "<": "<lt>" };

/** Keys whose character in a non-Latin layout is worth learning: letters and the punctuation keys around them. */
const LEARNED_CODES = /^(Key[A-Z]|Backquote|BracketLeft|BracketRight|Semicolon|Quote|Comma|Period)$/;

const isAscii = (ch: string) => ch.charCodeAt(0) <= 0x7e;

/** Escape a character for Vim's langmap option. */
const escLangmap = (ch: string) => (/[\\,;"|]/.test(ch) ? `\\${ch}` : ch);

export class EditorLayout {
	private saveTimer: number | null = null;
	/** The langmap this plugin set, so a langmap from the user's vimrc is left alone. */
	private appliedLangmap = "";

	constructor(private readonly plugin: VimLayerPlugin) {}

	/** Registered first, so every other handler sees the current layout guess. */
	load(): void {
		const { plugin } = this;
		onEveryWindow(plugin, (win, doc) => {
			plugin.registerDomEvent(doc, "keydown", (e) => this.onKeyDown(e), { capture: true });
			plugin.registerDomEvent(win, "focus", () => void refreshLayout());
		});
		void refreshLayout();
		// Vim's API appears with the first editor.
		plugin.app.workspace.onLayoutReady(() => this.applyLangmap());
		plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", () => this.applyLangmap()));
		plugin.register(() => {
			if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
			const vim = vimApi();
			if (vim && this.appliedLangmap && vim.getOption?.("langmap") === this.appliedLangmap) vim.langmap?.("", false);
		});
	}

	private onKeyDown(e: KeyboardEvent): void {
		trackLayout(e);
		this.learn(e);
		this.remapPunctuation(e);
	}

	/** Remember which character each key types in the non-Latin layout, from the keys you press. */
	private learn(e: KeyboardEvent): void {
		if (e.ctrlKey || e.metaKey || e.altKey || [...e.key].length !== 1 || isAscii(e.key) || !LEARNED_CODES.test(e.code)) return;
		const ch = e.key.toLowerCase();
		const known = this.plugin.settings.jumpAltLayout;
		if (known[e.code] === ch) return;
		this.plugin.settings.jumpAltLayout = { ...known, [e.code]: ch };
		this.applyLangmap();
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => void this.plugin.saveSettings(), 2000);
	}

	/** Build Vim's langmap from the learned layout: "фa,ФA,..." — each non-Latin character to its QWERTY key. */
	private applyLangmap(): void {
		const vim = vimApi();
		if (!vim?.langmap || this.plugin.settings.keyMode === "typed") return;
		const pairs: string[] = [];
		for (const [code, ch] of Object.entries(this.plugin.settings.jumpAltLayout)) {
			if (isAscii(ch)) continue;
			const lower = qwertyChar({ code, shiftKey: false } as KeyboardEvent);
			const upper = qwertyChar({ code, shiftKey: true } as KeyboardEvent);
			if (!lower || !upper) continue;
			pairs.push(escLangmap(ch) + escLangmap(lower));
			const shifted = ch.toUpperCase();
			if (shifted !== ch) pairs.push(escLangmap(shifted) + escLangmap(upper));
		}
		const langmap = pairs.join(",");
		if (langmap === this.appliedLangmap) return;
		// A langmap set by the user (in the vimrc) wins.
		const current = vim.getOption?.("langmap");
		if (current && current !== this.appliedLangmap) return;
		vim.langmap(langmap, false);
		this.appliedLangmap = langmap;
	}

	/** ASCII punctuation on another key ("/" types "." on a Russian layout): send it to Vim by position. */
	private remapPunctuation(e: KeyboardEvent): void {
		if (this.plugin.settings.keyMode === "typed" || !isNonLatinLayout()) return;
		if (e.ctrlKey || e.metaKey || e.altKey || [...e.key].length !== 1 || !isAscii(e.key) || /^Key[A-Z]$/.test(e.code)) return;
		// A jump reads its own keys.
		if (this.plugin.jump?.active) return;
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		const target = activeDocument.activeElement;
		if (!view || view.getMode() !== "source" || !target?.closest(".cm-content") || !view.contentEl.contains(target)) return;
		const cm = cmOf(view);
		const vim = cm?.state?.vim;
		const api = vimApi();
		// After f, t, r and the like Vim expects the character itself.
		if (!cm || !vim || vim.insertMode || vim.expectLiteralNext || !api) return;
		const key = qwertyChar(e);
		if (!key || key === e.key) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		api.handleKey(cm, VIM_NAMES[key] ?? key);
	}
}
