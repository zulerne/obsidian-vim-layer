// Which-key style leader menu: a bar at the bottom of the window that waits for a key sequence.
import { Modal, Notice, TFile } from "obsidian";
import { compareKeys, eventToKey } from "../keys";
import type { GroupItem, KeymapItem } from "./keymap";
import type VimLayerPlugin from "../main";
import { appCommands } from "../obsidian-internal";

// Commands run after the menu has closed and focus has returned to where it was.
const EXEC_DELAY_MS = 50;

const KEY_LABELS: Record<string, string> = {
	space: "SPC",
	enter: "RET",
	escape: "ESC",
	tab: "TAB",
	backspace: "BS",
};

function keyLabel(key: string): string {
	return key.replace(/[a-z0-9]+$/, (base) => (base.length > 1 ? (KEY_LABELS[base] ?? base) : base));
}

export class LeaderModal extends Modal {
	private sequence: string[] = [];
	private timer: number | null = null;
	private readonly suggestionsEl: HTMLElement;
	private readonly statusEl: HTMLElement;

	constructor(private readonly plugin: VimLayerPlugin) {
		super(plugin.app);
		this.containerEl.addClass("vim-layer-leader-container");
		this.modalEl.addClass("vim-layer-leader");
		this.modalEl.empty();
		this.suggestionsEl = this.modalEl.createDiv({ cls: "vim-layer-leader-items" });
		this.statusEl = this.modalEl.createDiv({ cls: "vim-layer-leader-status" });
		// Every key goes to the menu; returning false stops Obsidian and other plugins from seeing it.
		this.scope.register(null, null, (evt) => {
			this.handleKey(evt);
			return false;
		});
	}

	onOpen(): void {
		this.setCollapsed(this.plugin.settings.leaderDelay > 0);
		this.restartTimer();
		this.render();
	}

	onClose(): void {
		this.clearTimer();
		this.contentEl.empty();
	}

	private setCollapsed(collapsed: boolean): void {
		this.containerEl.toggleClass("vim-layer-leader-collapsed", collapsed);
	}

	private clearTimer(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = null;
	}

	private restartTimer(): void {
		this.clearTimer();
		const delay = this.plugin.settings.leaderDelay;
		if (delay > 0 && this.containerEl.hasClass("vim-layer-leader-collapsed")) {
			this.timer = window.setTimeout(() => {
				this.timer = null;
				this.setCollapsed(false);
			}, delay);
		}
	}

	private handleKey(evt: KeyboardEvent): void {
		evt.preventDefault();
		evt.stopPropagation();
		const key = eventToKey(evt, this.plugin.settings.keyMode);
		if (key === null) return;
		if (key === "escape") {
			this.close();
			return;
		}
		if (key === "backspace") {
			if (this.sequence.length === 0) this.close();
			else {
				this.sequence.pop();
				this.render();
			}
			return;
		}
		this.restartTimer();
		const group = this.currentGroup();
		const item = group?.items.get(key);
		if (!item) {
			new Notice(`Vim Layer: no leader binding for ${[...this.sequence, key].map(keyLabel).join(" ")}`);
			this.close();
			return;
		}
		if (item.type === "group") {
			this.sequence.push(key);
			this.render();
			return;
		}
		this.close();
		window.setTimeout(() => void this.run(item), EXEC_DELAY_MS);
	}

	private currentGroup(): GroupItem | null {
		let group: GroupItem = this.plugin.leaderKeymap;
		for (const key of this.sequence) {
			const next = group.items.get(key);
			if (next?.type !== "group") return null;
			group = next;
		}
		return group;
	}

	private async run(item: KeymapItem): Promise<void> {
		if (item.type === "command") {
			const commands = appCommands(this.app);
			if (!commands.findCommand(item.command)) {
				new Notice(`Vim Layer: unknown command ${item.command}`);
				return;
			}
			commands.executeCommandById(item.command);
		} else if (item.type === "file") {
			const file = this.findFile(item.file);
			if (!file) {
				new Notice(`Vim Layer: file not found: ${item.file}`);
				return;
			}
			await this.app.workspace.getLeaf("tab").openFile(file);
		}
	}

	/** Path from the vault root if it contains "/", otherwise any file with that name. ".md" is optional. */
	private findFile(name: string): TFile | null {
		const target = name.replace(/^\/+/, "").toLowerCase();
		const rooted = name.includes("/");
		const matches = (path: string) => path === target || path === `${target}.md`;
		for (const file of this.app.vault.getFiles()) {
			const candidate = (rooted ? file.path : file.name).toLowerCase();
			if (matches(candidate)) return file;
		}
		return null;
	}

	private describe(item: KeymapItem): { text: string; invalid: boolean } {
		if (item.description) {
			const invalid = item.type === "command" && !appCommands(this.app).findCommand(item.command);
			return { text: item.description, invalid };
		}
		if (item.type === "group") return { text: "+group", invalid: false };
		if (item.type === "file") return { text: `Open ${item.file}`, invalid: false };
		const command = appCommands(this.app).findCommand(item.command);
		if (!command) return { text: item.command, invalid: true };
		// "Plugin: Do something" → "Do something".
		return { text: command.name.replace(/^[^:]+:\s*/, ""), invalid: false };
	}

	private render(): void {
		const group = this.currentGroup();
		this.suggestionsEl.empty();
		this.statusEl.empty();
		if (!group) return;

		const title = group.description ?? "Leader";
		this.statusEl.createSpan({ cls: "vim-layer-leader-path", text: ["SPC", ...this.sequence.map(keyLabel)].join(" ") });
		this.statusEl.createSpan({ cls: "vim-layer-leader-title", text: title });

		const entries = [...group.items.entries()].sort(([ka, a], [kb, b]) => {
			const ga = a.type === "group" ? 0 : 1;
			const gb = b.type === "group" ? 0 : 1;
			return ga - gb || compareKeys(ka, kb);
		});
		for (const [key, item] of entries) {
			const { text, invalid } = this.describe(item);
			const row = this.suggestionsEl.createDiv({ cls: `vim-layer-leader-item is-${item.type}` });
			if (invalid) row.addClass("is-invalid");
			row.createEl("kbd", { text: keyLabel(key) });
			row.createSpan({ cls: "vim-layer-leader-label", text: item.type === "group" ? `+${text.replace(/^\+/, "")}` : text });
			row.setAttr("title", item.type === "command" ? item.command : text);
		}
	}
}
