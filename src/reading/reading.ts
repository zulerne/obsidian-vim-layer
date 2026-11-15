// Reading view layer: Vim keys while a note is in Reading view, switching between reading and editing,
// and the mode indicator. Replaces Vimium+.
import { onEveryWindow } from "../windows";
import { MarkdownView, View, WorkspaceLeaf } from "obsidian";
import { eventToKey, parseKey } from "../keys";
import type VimLayerPlugin from "../main";
import { appCommands, cmOf, isPluginEnabled, runCommand, vaultConfig } from "../obsidian-internal";
import { HintEngine } from "./hints";
import { collectBookmarks, collectRecentFiles, OmniModal } from "./omnibar";
import { scrollBy, scrollHalfPage, scrollToEdge } from "./scroll";

const CHORD_TIMEOUT_MS = 600;

export const DEFAULT_READING_KEYMAP = `# Reading view keys: key sequence, then a command ID. Later lines win.
j vim-layer:scroll-down
k vim-layer:scroll-up
d vim-layer:scroll-half-page-down
u vim-layer:scroll-half-page-up
g g vim-layer:scroll-to-top
G vim-layer:scroll-to-bottom
f vim-layer:hints
F vim-layer:hints-new-tab
i vim-layer:edit
/ editor:open-search
n vim-layer:search-next
N vim-layer:search-previous
J workspace:next-tab
K workspace:previous-tab
g t workspace:next-tab
g T workspace:previous-tab
t workspace:new-tab
x workspace:close
X workspace:undo-close-pane
H app:go-back
L app:go-forward
b vim-layer:bookmarks
B vim-layer:bookmarks-new-tab
O vim-layer:omnibar
o switcher:open
p command-palette:open
space vim-layer:leader
`;

export interface ReadingBinding {
	keys: string[];
	command: string;
}

export function parseReadingKeymap(text: string): { bindings: ReadingBinding[]; errors: string[] } {
	const bindings = new Map<string, ReadingBinding>();
	const errors: string[] = [];
	text.split("\n").forEach((raw, i) => {
		const line = raw.trim();
		if (!line || line.startsWith("#")) return;
		const tokens = line.split(/\s+/);
		if (tokens.length < 2) {
			errors.push(`line ${i + 1}: expected keys and a command ID`);
			return;
		}
		const command = tokens.pop() as string;
		const keys = tokens.map(parseKey);
		if (keys.some((k) => k === null)) {
			errors.push(`line ${i + 1}: unknown key in "${tokens.join(" ")}"`);
			return;
		}
		const k = keys as string[];
		// "-" as the command removes a binding.
		if (command === "-") bindings.delete(k.join(" "));
		else bindings.set(k.join(" "), { keys: k, command });
	});
	return { bindings: [...bindings.values()], errors };
}

type Mode = "reading" | "editing";

function isEditableTarget(): boolean {
	const el = activeDocument.activeElement as HTMLElement | null;
	if (!el) return false;
	return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export class ReadingLayer {
	readonly hints: HintEngine;
	private bindings: ReadingBinding[] = [];
	private pending: string[] = [];
	private pendingTimer: number | null = null;
	private mode: Mode = "reading";
	private indicatorEl: HTMLElement | null = null;

	constructor(private readonly plugin: VimLayerPlugin) {
		this.hints = new HintEngine(plugin.app, () => ({
			chars: plugin.settings.hintChars,
			selectors: plugin.settings.hintSelectors,
			fontSize: plugin.settings.hintFontSize,
			keyMode: plugin.settings.keyMode,
		}));
	}

	/** Takes over only when the module is on and Vimium+ is not running. */
	get active(): boolean {
		return this.plugin.settings.readingEnabled && !isPluginEnabled(this.plugin.app, "vimium-plus");
	}

	load(): void {
		const { plugin } = this;
		const { app } = plugin;
		this.reloadKeymap();
		this.registerCommands();

		onEveryWindow(plugin, (_win, doc) => plugin.registerDomEvent(doc, "keydown", (e) => this.onKeyDown(e), { capture: true }));

		// Switching panes keeps each pane's own mode; only a file newly opened in the active pane is forced.
		plugin.registerEvent(app.workspace.on("active-leaf-change", () => this.syncFromView()));
		plugin.registerEvent(app.workspace.on("layout-change", () => this.syncFromView()));
		plugin.registerEvent(
			app.workspace.on("file-open", () => void this.forceReading(app.workspace.getActiveViewOfType(MarkdownView)?.leaf ?? null)),
		);
		plugin.vimMode.onModeChange(() => this.refreshIndicator());

		app.workspace.onLayoutReady(() => {
			this.applyConfig();
			this.syncFromView();
		});
		plugin.register(() => {
			this.hints.hide();
			this.clearPending();
			this.indicatorEl?.remove();
			this.restoreConfig();
		});
	}

	reloadKeymap(): string[] {
		const { bindings, errors } = parseReadingKeymap(this.plugin.settings.readingKeymap);
		this.bindings = bindings;
		return errors;
	}

	/**
	 * Apply "Open notes in Reading view" and "Turn on Vim mode". Obsidian's own values are kept in data.json:
	 * Obsidian does not unload plugins when it quits, so they must survive restarts to be restored later.
	 */
	applyConfig(): void {
		const config = vaultConfig(this.plugin.app);
		const s = this.plugin.settings;
		const on = this.active;
		let changed = false;
		if (on && s.forceReadingView) {
			if (s.originalDefaultViewMode === undefined) {
				s.originalDefaultViewMode = config.getConfig("defaultViewMode") ?? "source";
				changed = true;
			}
			if (config.getConfig("defaultViewMode") !== "preview") config.setConfig("defaultViewMode", "preview");
		} else if (s.originalDefaultViewMode !== undefined) {
			config.setConfig("defaultViewMode", s.originalDefaultViewMode);
			delete s.originalDefaultViewMode;
			changed = true;
		}
		if (on && s.enableVimMode) {
			if (s.originalVimMode === undefined) {
				s.originalVimMode = config.getConfig("vimMode") ?? false;
				changed = true;
			}
			if (config.getConfig("vimMode") !== true) config.setConfig("vimMode", true);
		} else if (s.originalVimMode !== undefined) {
			config.setConfig("vimMode", s.originalVimMode);
			delete s.originalVimMode;
			changed = true;
		}
		if (changed) void this.plugin.saveSettings();
		this.refreshIndicator();
	}

	/** The plugin is being turned off: give Obsidian its own values back. */
	private restoreConfig(): void {
		const config = vaultConfig(this.plugin.app);
		const s = this.plugin.settings;
		if (s.originalDefaultViewMode === undefined && s.originalVimMode === undefined) return;
		if (s.originalDefaultViewMode !== undefined) config.setConfig("defaultViewMode", s.originalDefaultViewMode);
		if (s.originalVimMode !== undefined) config.setConfig("vimMode", s.originalVimMode);
		delete s.originalDefaultViewMode;
		delete s.originalVimMode;
		void this.plugin.saveSettings();
	}

	private registerCommands(): void {
		const { plugin } = this;
		const { app } = plugin;
		const step = () => plugin.settings.scrollStep;
		const cmds: [string, string, () => void][] = [
			["scroll-down", "Scroll down", () => scrollBy(app, step())],
			["scroll-up", "Scroll up", () => scrollBy(app, -step())],
			["scroll-half-page-down", "Scroll half a page down", () => scrollHalfPage(app, 1)],
			["scroll-half-page-up", "Scroll half a page up", () => scrollHalfPage(app, -1)],
			["scroll-to-top", "Scroll to top", () => scrollToEdge(app, "top")],
			["scroll-to-bottom", "Scroll to bottom", () => scrollToEdge(app, "bottom")],
			["hints", "Show link hints", () => this.hints.show(false)],
			["hints-new-tab", "Show link hints (open in new tab)", () => this.hints.show(true)],
			["edit", "Edit note (leave Reading view)", () => void this.enterEditing()],
			["read", "Return to Reading view", () => void this.exitToReading()],
			["bookmarks", "Open bookmark", () => new OmniModal(app, collectBookmarks(app), false, false).open()],
			["bookmarks-new-tab", "Open bookmark in new tab", () => new OmniModal(app, collectBookmarks(app), true, false).open()],
			["omnibar", "Open bookmark, recent file or URL in new tab", () => this.openOmnibar()],
			["search-next", "Next match of the note search", () => this.searchStep("next")],
			["search-previous", "Previous match of the note search", () => this.searchStep("previous")],
		];
		for (const [id, name, callback] of cmds) plugin.addCommand({ id, name, callback });
	}

	/** The note search bar (/) of the active note, if it is open. */
	private searchBar(): HTMLElement | null {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		const bar = view?.containerEl.querySelector<HTMLElement>(".document-search-container");
		return bar && bar.isShown() ? bar : null;
	}

	private searchStep(dir: "next" | "previous"): void {
		const buttons = this.searchBar()?.querySelectorAll<HTMLElement>(".document-search-button");
		// Obsidian's bar has Previous, then Next.
		buttons?.[dir === "next" ? 1 : 0]?.click();
	}

	private openOmnibar(): void {
		const { app } = this.plugin;
		const items = collectBookmarks(app);
		const seen = new Set(items.map((i) => i.detail));
		for (const item of collectRecentFiles(app)) if (!seen.has(item.detail)) items.push(item);
		new OmniModal(app, items, true, true).open();
	}

	// ---- key routing ----

	private onKeyDown(e: KeyboardEvent): void {
		if (!this.active) return;
		if (this.hints.active) {
			e.preventDefault();
			e.stopPropagation();
			this.hints.handleKey(e);
			return;
		}
		if (e.defaultPrevented || activeDocument.querySelector(".modal-container")) {
			this.clearPending();
			return;
		}
		if (e.key === "Escape" && this.handleEditorEscape(e)) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		if (this.handleSearchKey(e)) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		if (!this.inReadingContext() || isEditableTarget()) {
			// A prefix typed in Reading view does not wait for a key typed somewhere else.
			this.clearPending();
			return;
		}
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		const key = eventToKey(e, this.plugin.settings.keyMode);
		if (key === null) return;
		if (this.feedKey(key)) {
			e.preventDefault();
			e.stopPropagation();
		}
	}

	/**
	 * Note search in Reading view, Vim style: Enter in the search field keeps the first match and leaves the field,
	 * so n / N step through matches; Esc outside the field closes the search.
	 */
	private handleSearchKey(e: KeyboardEvent): boolean {
		if (e.ctrlKey || e.metaKey || e.altKey) return false;
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.getMode() !== "preview") return false;
		const bar = this.searchBar();
		if (!bar) return false;
		const target = activeDocument.activeElement;
		if (e.key === "Enter" && !e.shiftKey && target?.instanceOf(HTMLInputElement) && bar.contains(target)) {
			target.blur();
			// Obsidian has already moved to the next match on this Enter; Vim stays on the first one.
			this.searchStep("previous");
			return true;
		}
		if (e.key === "Escape" && !bar.contains(target)) {
			bar.querySelector<HTMLElement>(".document-search-close-button")?.click();
			return true;
		}
		return false;
	}

	/** Reading view of a note, or an empty tab. */
	private inReadingContext(): boolean {
		const view = this.plugin.app.workspace.getActiveViewOfType(View);
		if (!view) return false;
		if (view instanceof MarkdownView) return view.getMode() === "preview";
		return view.getViewType() === "empty";
	}

	/** Esc in Vim normal mode (nothing pending) leaves the editor for Reading view. */
	private handleEditorEscape(e: KeyboardEvent): boolean {
		if (!this.plugin.settings.escapeToReading || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return false;
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.getMode() !== "source") return false;
		const target = activeDocument.activeElement;
		if (!target || !view.contentEl.contains(target) || !target.closest(".cm-editor")) return false;
		// Esc closes an open suggestion list (links, tags) first.
		if (activeDocument.querySelector(".suggestion-container")) return false;
		const vim = cmOf(view)?.state?.vim;
		if (vim) {
			const input = vim.inputState;
			const busy =
				vim.insertMode ||
				vim.visualMode ||
				!!input?.operator ||
				!!input?.keyBuffer?.length ||
				!!input?.prefixRepeat?.length ||
				!!input?.motionRepeat?.length;
			if (busy) return false;
		}
		void this.exitToReading();
		return true;
	}

	private feedKey(key: string): boolean {
		const hadPending = this.pending.length > 0;
		const candidate = [...this.pending, key];
		const seq = candidate.join(" ");
		const exact = this.bindings.find((b) => b.keys.join(" ") === seq);
		const extendable = this.bindings.some(
			(b) => b.keys.length > candidate.length && b.keys.slice(0, candidate.length).join(" ") === seq,
		);
		if (extendable) {
			this.clearPending();
			this.pending = candidate;
			// Like Vim: wait for the next key, unless the keys so far are a binding of their own.
			if (exact) {
				this.pendingTimer = window.setTimeout(() => {
					this.pending = [];
					this.pendingTimer = null;
					this.plugin.keyHints.hide();
					this.run(exact.command);
				}, CHORD_TIMEOUT_MS);
			}
			this.showPendingHints(candidate);
			return true;
		}
		this.clearPending();
		if (exact) {
			this.run(exact.command);
			return true;
		}
		// Dead end: drop the buffered prefix and try this key on its own.
		return hadPending ? this.feedKey(key) : false;
	}

	private showPendingHints(prefix: string[]): void {
		const label = (keys: string[]) => keys.map((k) => ([...k].length === 1 ? k : `<${k}>`)).join("");
		const commands = appCommands(this.plugin.app);
		const entries: [string, string][] = this.bindings
			.filter((b) => b.keys.length > prefix.length && b.keys.slice(0, prefix.length).join(" ") === prefix.join(" "))
			.map((b) => [label(b.keys), commands.findCommand(b.command)?.name ?? b.command]);
		this.plugin.keyHints.showLater(label(prefix), entries);
	}

	private clearPending(): void {
		if (this.pending.length) this.plugin.keyHints?.hide();
		this.pending = [];
		if (this.pendingTimer !== null) window.clearTimeout(this.pendingTimer);
		this.pendingTimer = null;
	}

	private run(command: string): void {
		runCommand(this.plugin.app, command);
	}

	// ---- reading / editing ----

	async enterEditing(): Promise<void> {
		const { app } = this.plugin;
		const view = app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		const centerLine = this.readingCenterLine(view);
		this.mode = "editing";
		await this.setLeafMode(view.leaf, "source");
		const fresh = app.workspace.getActiveViewOfType(MarkdownView);
		if (fresh && centerLine !== null) {
			const pos = { line: centerLine, ch: 0 };
			fresh.editor.setCursor(pos);
			fresh.editor.scrollIntoView({ from: pos, to: pos }, true);
		}
		fresh?.editor.focus();
		this.refreshIndicator();
	}

	async exitToReading(): Promise<void> {
		this.mode = "reading";
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			await this.setLeafMode(view.leaf, "preview");
			(activeDocument.activeElement as HTMLElement | null)?.blur?.();
		}
		this.refreshIndicator();
	}

	/** Source line near the middle of the Reading view, so editing starts where you were reading. */
	private readingCenterLine(view: MarkdownView): number | null {
		const total = view.editor.lineCount();
		const container = view.containerEl.querySelector<HTMLElement>(".markdown-preview-view");
		if (total <= 0 || !container || container.scrollHeight <= 0) return null;
		const top = view.previewMode.getScroll();
		const visible = (container.clientHeight / container.scrollHeight) * total;
		return Math.min(Math.max(Math.round(top + visible / 2), 0), total - 1);
	}

	private syncFromView(): void {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) this.mode = view.getMode() === "preview" ? "reading" : "editing";
		this.refreshIndicator();
	}

	private async forceReading(leaf: WorkspaceLeaf | null): Promise<void> {
		if (!this.active || !this.plugin.settings.forceReadingView || this.mode !== "reading" || !leaf) return;
		const state = leaf.getViewState();
		if (state.type !== "markdown" || state.state?.mode === "preview") return;
		await this.setLeafMode(leaf, "preview");
	}

	private async setLeafMode(leaf: WorkspaceLeaf, mode: "source" | "preview"): Promise<void> {
		const state = leaf.getViewState();
		if (state.type !== "markdown") return;
		state.state = { ...state.state, mode };
		// Editing opens Live Preview rather than raw source.
		if (mode === "source") state.state.source = false;
		await leaf.setViewState(state);
	}

	// ---- mode indicator ----

	refreshIndicator(): void {
		const { plugin } = this;
		if (!this.active || !plugin.settings.showModeIndicator) {
			this.indicatorEl?.remove();
			this.indicatorEl = null;
			return;
		}
		if (!this.indicatorEl) {
			this.indicatorEl = plugin.addStatusBarItem();
			this.indicatorEl.addClass("vim-layer-mode");
		}
		const el = this.indicatorEl;
		const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
		let text = "";
		let cls = "";
		if (view?.getMode() === "preview") text = "READING";
		else if (view) {
			const vim = cmOf(view)?.state?.vim;
			const m = vim ? plugin.vimMode.mode : null;
			text = m ? m.toUpperCase() : "EDITING";
			cls = m ?? "insert";
		}
		el.setText(text);
		el.toggle(text !== "");
		el.dataset.mode = cls || "reading";
	}
}
