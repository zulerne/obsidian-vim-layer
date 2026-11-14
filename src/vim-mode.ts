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
		const cm = cmOf(this.plugin.app.workspace.getActiveViewOfType(MarkdownView));
		if (!cm?.on || this.bound.has(cm)) return;
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
