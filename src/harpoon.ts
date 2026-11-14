// Harpoon: a short numbered list of files to jump between, with the cursor remembered per file.
import { MarkdownView, Modal, Notice, TFile } from "obsidian";
import { eventToKey } from "./keys";
import type VimLayerPlugin from "./main";

export interface HarpoonEntry {
	path: string;
	line: number;
	ch: number;
}

const MAX_SLOTS = 9;
const LEGACY_CACHE = "harpoon-cache.json";

export class Harpoon {
	constructor(private readonly plugin: VimLayerPlugin) {}

	private get list(): HarpoonEntry[] {
		return this.plugin.settings.harpoonFiles;
	}

	load(): void {
		const { plugin } = this;
		plugin.addCommand({ id: "harpoon-add", name: "Harpoon: add current file", callback: () => void this.add() });
		plugin.addCommand({ id: "harpoon-list", name: "Harpoon: open list", callback: () => new HarpoonModal(plugin, this).open() });
		plugin.addCommand({ id: "harpoon-remove", name: "Harpoon: remove current file", callback: () => void this.removeCurrent() });
		for (let i = 1; i <= MAX_SLOTS; i++) {
			plugin.addCommand({ id: `harpoon-${i}`, name: `Harpoon: go to file ${i}`, callback: () => void this.goTo(i - 1) });
		}
		// Keep entries pointing at the right file after renames and drop deleted ones.
		plugin.registerEvent(
			plugin.app.vault.on("rename", (file, oldPath) => {
				const entry = this.list.find((e) => e.path === oldPath);
				if (entry) {
					entry.path = file.path;
					void plugin.saveSettings();
				}
			}),
		);
		plugin.registerEvent(
			plugin.app.vault.on("delete", (file) => {
				const i = this.list.findIndex((e) => e.path === file.path);
				if (i >= 0) {
					this.list.splice(i, 1);
					void plugin.saveSettings();
				}
			}),
		);
		plugin.app.workspace.onLayoutReady(() => void this.importLegacy());
	}

	/** One-time import of the Harpoon plugin's list (harpoon-cache.json in the vault root). */
	private async importLegacy(): Promise<void> {
		const s = this.plugin.settings;
		if (s.harpoonImported) return;
		const adapter = this.plugin.app.vault.adapter;
		if (await adapter.exists(LEGACY_CACHE)) {
			try {
				const data = JSON.parse(await adapter.read(LEGACY_CACHE)) as { path?: string; cursor?: { line?: number; ch?: number } }[];
				if (!s.harpoonFiles.length && Array.isArray(data)) {
					s.harpoonFiles = data
						.filter((d) => typeof d.path === "string")
						.slice(0, MAX_SLOTS)
						.map((d) => ({ path: d.path as string, line: d.cursor?.line ?? 0, ch: d.cursor?.ch ?? 0 }));
				}
			} catch {
				// An unreadable cache is ignored; the list starts empty.
			}
		}
		s.harpoonImported = true;
		await this.plugin.saveSettings();
	}

	private cursor(): { line: number; ch: number } {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return { line: 0, ch: 0 };
		if (view.getMode() === "preview") return { line: Math.round(view.previewMode.getScroll()), ch: 0 };
		return view.editor.getCursor();
	}

	/** Remember where we are in the current file if it is in the list. */
	private rememberCursor(): void {
		const file = this.plugin.app.workspace.getActiveFile();
		const entry = file && this.list.find((e) => e.path === file.path);
		if (!entry) return;
		const { line, ch } = this.cursor();
		entry.line = line;
		entry.ch = ch;
	}

	async add(): Promise<void> {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice("Harpoon: no active file");
			return;
		}
		const i = this.list.findIndex((e) => e.path === file.path);
		if (i >= 0) {
			new Notice(`Harpoon: ${file.basename} is already #${i + 1}`);
			return;
		}
		if (this.list.length >= MAX_SLOTS) {
			new Notice(`Harpoon: the list is full (${MAX_SLOTS})`);
			return;
		}
		this.list.push({ path: file.path, ...this.cursor() });
		await this.plugin.saveSettings();
		new Notice(`Harpoon: ${file.basename} → #${this.list.length}`);
	}

	async removeCurrent(): Promise<void> {
		const file = this.plugin.app.workspace.getActiveFile();
		const i = file ? this.list.findIndex((e) => e.path === file.path) : -1;
		if (i < 0) return;
		this.list.splice(i, 1);
		await this.plugin.saveSettings();
		new Notice(`Harpoon: removed ${file?.basename}`);
	}

	async goTo(index: number): Promise<void> {
		const entry = this.list[index];
		if (!entry) {
			new Notice(`Harpoon: no file #${index + 1}`);
			return;
		}
		const { app } = this.plugin;
		const file = app.vault.getAbstractFileByPath(entry.path);
		if (!(file instanceof TFile)) {
			new Notice(`Harpoon: file not found: ${entry.path}`);
			return;
		}
		this.rememberCursor();
		void this.plugin.saveSettings();
		if (app.workspace.getActiveFile()?.path === file.path) return;
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(file, { eState: { line: entry.line } });
		const view = leaf.view;
		if (view instanceof MarkdownView && view.getMode() === "source") {
			const pos = { line: Math.min(entry.line, view.editor.lineCount() - 1), ch: entry.ch };
			view.editor.setCursor(pos);
			view.editor.scrollIntoView({ from: pos, to: pos }, true);
		}
	}

	move(from: number, to: number): void {
		if (to < 0 || to >= this.list.length) return;
		const [entry] = this.list.splice(from, 1);
		this.list.splice(to, 0, entry);
		void this.plugin.saveSettings();
	}

	remove(index: number): HarpoonEntry | undefined {
		const [entry] = this.list.splice(index, 1);
		void this.plugin.saveSettings();
		return entry;
	}

	insert(index: number, entry: HarpoonEntry): void {
		if (this.list.length >= MAX_SLOTS || this.list.some((e) => e.path === entry.path)) return;
		this.list.splice(Math.min(index, this.list.length), 0, entry);
		void this.plugin.saveSettings();
	}

	entries(): readonly HarpoonEntry[] {
		return this.list;
	}
}

/** The list: j/k move, Enter or l opens, 1–9 open by number, J/K reorder, dd removes, p/P puts it back, Esc/q closes. */
class HarpoonModal extends Modal {
	private selected = 0;
	private lastD = 0;
	private removed: HarpoonEntry | null = null;

	constructor(
		private readonly plugin: VimLayerPlugin,
		private readonly harpoon: Harpoon,
	) {
		super(plugin.app);
		this.modalEl.addClass("vim-layer-harpoon");
		this.setTitle("Harpoon");
		this.scope.register(null, null, (evt) => {
			this.handleKey(evt);
			return false;
		});
	}

	onOpen(): void {
		const current = this.app.workspace.getActiveFile()?.path;
		const i = this.harpoon.entries().findIndex((e) => e.path === current);
		this.selected = Math.max(0, i);
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private handleKey(evt: KeyboardEvent): void {
		evt.preventDefault();
		const key = eventToKey(evt, this.plugin.settings.keyMode);
		if (key === null) return;
		const entries = this.harpoon.entries();
		const n = entries.length;
		const open = (i: number) => {
			this.close();
			void this.harpoon.goTo(i);
		};
		if (/^[1-9]$/.test(key)) {
			if (Number(key) <= n) open(Number(key) - 1);
			return;
		}
		switch (key) {
			case "escape":
			case "q":
				this.close();
				return;
			case "enter":
			case "l":
				if (n) open(this.selected);
				return;
			case "j":
			case "down":
				if (n) this.selected = (this.selected + 1) % n;
				break;
			case "k":
			case "up":
				if (n) this.selected = (this.selected - 1 + n) % n;
				break;
			case "J":
				if (this.selected < n - 1) {
					this.harpoon.move(this.selected, this.selected + 1);
					this.selected++;
				}
				break;
			case "K":
				if (this.selected > 0) {
					this.harpoon.move(this.selected, this.selected - 1);
					this.selected--;
				}
				break;
			case "d":
			case "x":
			case "delete":
			case "backspace": {
				// "d" needs a second "d" within half a second, like Vim's dd.
				const now = Date.now();
				if (key === "d" && now - this.lastD > 500) {
					this.lastD = now;
					return;
				}
				this.lastD = 0;
				if (n) {
					this.removed = this.harpoon.remove(this.selected) ?? null;
					this.selected = Math.min(this.selected, Math.max(0, n - 2));
				}
				break;
			}
			case "p":
			case "P":
				if (this.removed) {
					this.harpoon.insert(key === "p" ? this.selected + 1 : this.selected, this.removed);
					this.removed = null;
				}
				break;
			default:
				return;
		}
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		const entries = this.harpoon.entries();
		if (!entries.length) {
			contentEl.createDiv({ cls: "vim-layer-harpoon-empty", text: "No files yet. Use “Harpoon: add current file”." });
		}
		entries.forEach((entry, i) => {
			const row = contentEl.createDiv({ cls: "vim-layer-harpoon-item" });
			row.toggleClass("is-selected", i === this.selected);
			row.createEl("kbd", { text: String(i + 1) });
			row.createSpan({ cls: "vim-layer-harpoon-path", text: entry.path.replace(/\.md$/, "") });
			row.addEventListener("click", () => {
				this.close();
				void this.harpoon.goTo(i);
			});
		});
		contentEl.createDiv({
			cls: "vim-layer-harpoon-help",
			text: "j/k move · Enter open · 1–9 jump · J/K reorder · dd remove · p put back · Esc close",
		});
	}
}
