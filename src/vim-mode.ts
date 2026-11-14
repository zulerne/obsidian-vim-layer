// Tracks the Vim mode (normal/insert/visual/replace) of markdown editors and reports changes.
import { MarkdownView } from "obsidian";
import type VimLayerPlugin from "./main";
import { CmAdapter, cmOf } from "./obsidian-internal";

export type VimMode = "normal" | "insert" | "visual" | "replace";
export type VimModeListener = (mode: VimMode, prev: VimMode) => void;

export class VimModeWatcher {
	mode: VimMode = "normal";
	private readonly bound = new Set<CmAdapter>();
	private readonly listeners = new Set<VimModeListener>();

	constructor(private readonly plugin: VimLayerPlugin) {
		const attach = () => this.attachActive();
		plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", attach));
		plugin.registerEvent(plugin.app.workspace.on("file-open", attach));
		plugin.registerEvent(plugin.app.workspace.on("layout-change", attach));
		plugin.app.workspace.onLayoutReady(attach);
		plugin.register(() => {
			for (const cm of this.bound) cm.off("vim-mode-change", this.onChange);
			this.bound.clear();
		});
	}

	onModeChange(listener: VimModeListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private attachActive(): void {
		// Forget editors that were closed.
		for (const old of this.bound) {
			if ((old as unknown as { cm6?: { dom?: HTMLElement } }).cm6?.dom?.isConnected === false) {
				old.off("vim-mode-change", this.onChange);
				this.bound.delete(old);
			}
		}
		const cm = cmOf(this.plugin.app.workspace.getActiveViewOfType(MarkdownView));
		if (!cm?.on) return;
		// Each editor has its own Vim mode: take the one of the editor that became active, without reporting a
		// change (switching panes is not entering or leaving Insert mode).
		const vim = cm.state?.vim;
		if (vim) this.mode = vim.insertMode ? "insert" : vim.visualMode ? "visual" : "normal";
		if (this.bound.has(cm)) return;
		this.bound.add(cm);
		cm.on("vim-mode-change", this.onChange);
	}

	private readonly onChange = (modeObj?: { mode?: string }): void => {
		const raw = modeObj?.mode;
		const mode: VimMode = raw === "insert" || raw === "visual" || raw === "replace" ? raw : "normal";
		if (mode === this.mode) return;
		const prev = this.mode;
		this.mode = mode;
		for (const l of this.listeners) l(mode, prev);
	};
}
