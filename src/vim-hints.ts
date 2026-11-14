// Which-key for Vim prefixes in the editor: after g, z, [ or ] a bar lists the keys that can follow.
import { MarkdownView } from "obsidian";
import type VimLayerPlugin from "./main";
import { CmAdapter, cmOf } from "./obsidian-internal";

/** Built-in commands of Obsidian's Vim mode (@replit/codemirror-vim) and Vim Layer's own, by prefix. */
const BUILT_IN: Record<string, [string, string][]> = {
	g: [
		["gg", "Top of the file"],
		["gj", "Down a display line"],
		["gk", "Up a display line"],
		["g0", "Start of the display line"],
		["g^", "First character of the display line"],
		["g$", "End of the display line"],
		["ge", "End of the previous word"],
		["gE", "End of the previous WORD"],
		["gl", "Next link"],
		["gL", "Previous link"],
		["gf", "Follow the link under the cursor"],
		["gx", "Follow the link under the cursor"],
		["gi", "Insert where you last edited"],
		["gI", "Insert at the start of the line"],
		["gv", "Select the last selection again"],
		["gJ", "Join lines without spaces"],
		["gu", "Lowercase (operator)"],
		["gU", "Uppercase (operator)"],
		["g~", "Toggle case (operator)"],
		["gc", "Toggle comment (operator)"],
		["gq", "Wrap text (operator)"],
		["gw", "Wrap text, keep cursor (operator)"],
		["g?", "ROT13 (operator)"],
		["gn", "Select the next search match"],
		["gN", "Select the previous search match"],
		["g*", "Search the word under the cursor, partial"],
		["g#", "Search the word under the cursor backward, partial"],
	],
	z: [
		["zz", "Scroll: cursor line to the middle"],
		["zt", "Scroll: cursor line to the top"],
		["zb", "Scroll: cursor line to the bottom"],
		["z.", "Middle, cursor to the first character"],
		["z⏎", "Top, cursor to the first character"],
		["z-", "Bottom, cursor to the first character"],
	],
	"[": [
		["[[", "Previous heading"],
		["[p", "Paste before, matching indent"],
		["[`", "Previous mark"],
		["['", "Previous mark, line"],
		["[(", "Previous unmatched ("],
		["[{", "Previous unmatched {"],
	],
	"]": [
		["]]", "Next heading"],
		["]p", "Paste after, matching indent"],
		["]`", "Next mark"],
		["]'", "Next mark, line"],
		["])", "Next unmatched )"],
		["]}", "Next unmatched }"],
	],
};

export class VimKeyHints {
	private el: HTMLElement | null = null;
	private timer: number | null = null;

	constructor(private readonly plugin: VimLayerPlugin) {}

	load(): void {
		const { plugin } = this;
		// On the window, so it sees keys that the layout handler on the document passes to Vim itself.
		const bind = (win: Window) => plugin.registerDomEvent(win, "keydown", () => this.onKey(), { capture: true });
		bind(window);
		plugin.registerEvent(plugin.app.workspace.on("window-open", (w) => bind(w.win)));
		plugin.register(() => this.hide());
	}

	/** The editor's Vim adapter, if an editor has focus. */
	private focusedCm(): CmAdapter | null {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		const target = activeDocument.activeElement;
		if (!view || view.getMode() !== "source" || !target?.closest(".cm-editor") || !view.contentEl.contains(target)) return null;
		return cmOf(view);
	}

	private onKey(): void {
		this.hide();
		if (!this.plugin.settings.vimKeyHints) return;
		const cm = this.focusedCm();
		if (!cm) return;
		// Vim updates its key buffer after the event, so look on the next tick.
		window.setTimeout(() => {
			const vim = cm.state?.vim;
			if (!vim || vim.insertMode) return;
			const buffer = (vim.inputState?.keyBuffer ?? []).join("");
			if (!buffer || (!BUILT_IN[buffer] && !this.userEntries(buffer).length)) return;
			this.timer = window.setTimeout(() => this.show(buffer, cm), this.plugin.settings.leaderDelay);
		}, 0);
	}

	private userEntries(prefix: string): [string, string][] {
		const out: [string, string][] = [];
		for (const [keys, desc] of this.plugin.vimrc.userMappings()) {
			if (keys.length > prefix.length && keys.startsWith(prefix)) out.push([keys, desc]);
		}
		return out;
	}

	private show(prefix: string, cm: CmAdapter): void {
		this.timer = null;
		// Still waiting for the same prefix?
		const buffer = (cm.state?.vim?.inputState?.keyBuffer ?? []).join("");
		if (buffer !== prefix) return;
		const entries = new Map<string, string>(BUILT_IN[prefix] ?? []);
		// Your own mappings win over the built-in descriptions.
		for (const [keys, desc] of this.userEntries(prefix)) entries.set(keys, desc);
		this.render(prefix, entries);
	}

	/** Show a list of key sequences after the hint delay (used by Reading view for its multi-key bindings). */
	showLater(prefix: string, entries: [string, string][]): void {
		this.hide();
		if (!this.plugin.settings.vimKeyHints || !entries.length) return;
		this.timer = window.setTimeout(() => {
			this.timer = null;
			this.render(prefix, new Map(entries));
		}, this.plugin.settings.leaderDelay);
	}

	private render(prefix: string, entries: Map<string, string>): void {
		this.el?.remove();
		const el = activeDocument.body.createDiv({ cls: "vim-layer-leader vim-layer-keyhints" });
		const items = el.createDiv({ cls: "vim-layer-leader-items" });
		for (const [keys, desc] of entries) {
			const row = items.createDiv({ cls: "vim-layer-leader-item" });
			row.createEl("kbd", { text: keys });
			row.createSpan({ cls: "vim-layer-leader-label", text: desc });
		}
		const status = el.createDiv({ cls: "vim-layer-leader-status" });
		status.createSpan({ cls: "vim-layer-leader-path", text: prefix });
		status.createSpan({ text: "Esc cancels" });
		this.el = el;
	}

	hide(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = null;
		this.el?.remove();
		this.el = null;
	}
}
