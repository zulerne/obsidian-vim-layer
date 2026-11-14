import { normalizePath, Notice, Plugin, TAbstractFile } from "obsidian";
import { CommandIdModal } from "./command-id";
import { EditorLayout } from "./editor-layout";
import { Harpoon } from "./harpoon";
import { InputMethodSwitcher } from "./im";
import { Jump } from "./jump";
import { DEFAULT_KEYMAP_YAML, extractYaml, GroupItem, parseKeymap } from "./leader/keymap";
import { LeaderModal } from "./leader/modal";
import { DEFAULT_READING_KEYMAP, ReadingLayer } from "./reading/reading";
import {
	DEFAULT_HINT_SELECTORS,
	DEFAULT_IM_SETTINGS,
	DEFAULT_SETTINGS,
	IM_SETTING_KEYS,
	ImSettings,
	VimLayerSettings,
	VimLayerSettingTab,
} from "./settings";
import { VimKeyHints } from "./vim-hints";
import { VimModeWatcher } from "./vim-mode";
import { Vimrc } from "./vimrc";

const IM_STORAGE_KEY = "vim-layer-input-method";

export default class VimLayerPlugin extends Plugin {
	settings: VimLayerSettings = { ...DEFAULT_SETTINGS };
	leaderKeymap: GroupItem = { type: "group", items: new Map() };
	vimMode!: VimModeWatcher;
	reading!: ReadingLayer;
	harpoon!: Harpoon;
	im!: InputMethodSwitcher;
	vimrc!: Vimrc;
	jump!: Jump;
	keyHints!: VimKeyHints;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new VimLayerSettingTab(this.app, this));

		this.addCommand({ id: "leader", name: "Open leader menu", callback: () => new LeaderModal(this).open() });
		this.addCommand({ id: "copy-command-id", name: "Copy command ID", callback: () => new CommandIdModal(this.app).open() });
		this.addCommand({ id: "reload-leader-keymap", name: "Reload leader keymap", callback: () => void this.loadLeaderKeymap(false) });

		// First keydown handler: tracks the keyboard layout for everything below.
		new EditorLayout(this).load();
		this.vimMode = new VimModeWatcher(this);
		// Before the Reading view layer, so its key handler sees Esc first while a jump is active.
		this.jump = new Jump(this);
		this.jump.load();
		this.reading = new ReadingLayer(this);
		this.reading.load();
		this.harpoon = new Harpoon(this);
		this.harpoon.load();
		this.im = new InputMethodSwitcher(this);
		this.im.load();
		this.vimrc = new Vimrc(this);
		this.vimrc.load();
		this.keyHints = new VimKeyHints(this);
		this.keyHints.load();

		this.app.workspace.onLayoutReady(async () => {
			await this.loadLeaderKeymap(true);
			const reloadIfKeymap = (file: TAbstractFile) => {
				if (this.settings.leaderKeymapPath && file.path === this.keymapPath()) void this.loadLeaderKeymap(true);
			};
			this.registerEvent(this.app.vault.on("modify", reloadIfKeymap));
			this.registerEvent(this.app.vault.on("create", reloadIfKeymap));
			this.registerEvent(this.app.vault.on("rename", reloadIfKeymap));
		});
	}

	private keymapPath(): string {
		return normalizePath(this.settings.leaderKeymapPath);
	}

	/** Load the leader keymap. Quiet loads report errors in a short notice; explicit loads list them. */
	async loadLeaderKeymap(quiet: boolean): Promise<void> {
		let yaml = DEFAULT_KEYMAP_YAML;
		let source = "built-in keymap";
		if (this.settings.leaderKeymapPath) {
			const path = this.keymapPath();
			source = path;
			try {
				yaml = extractYaml(await this.app.vault.adapter.read(path), path);
			} catch {
				new Notice(`Vim Layer: cannot read leader keymap ${path}`);
				return;
			}
		}
		const { keymap, errors } = parseKeymap(yaml);
		if (errors.length && !keymap.items.size) {
			new Notice(`Vim Layer: leader keymap ${source} not loaded:\n${errors.slice(0, 5).join("\n")}`, 10000);
			return;
		}
		this.leaderKeymap = keymap;
		if (errors.length) {
			const detail = quiet ? `${errors.length} problem(s), run "Reload leader keymap" for details` : errors.join("\n");
			new Notice(`Vim Layer: ${source}: ${detail}`, quiet ? 5000 : 15000);
		} else if (!quiet) {
			new Notice(`Vim Layer: loaded ${source}`);
		}
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as (Partial<VimLayerSettings> & Partial<ImSettings>) | null;
		this.settings = { ...DEFAULT_SETTINGS, hintSelectors: [...DEFAULT_HINT_SELECTORS], harpoonFiles: [], ...data };
		// 0.1.6 and earlier kept input method settings in data.json; move them to this device.
		if (data && IM_SETTING_KEYS.some((k) => k in data)) {
			if (!this.app.loadLocalStorage(IM_STORAGE_KEY)) {
				const moved: Partial<ImSettings> = {};
				for (const k of IM_SETTING_KEYS) if (k in data) Object.assign(moved, { [k]: data[k] });
				this.saveImSettings({ ...DEFAULT_IM_SETTINGS, ...moved });
			}
			for (const k of IM_SETTING_KEYS) delete (this.settings as Partial<ImSettings>)[k];
			await this.saveSettings();
		}
	}

	/** Input method settings of this device (localStorage, not synced with the vault). */
	imSettings(): ImSettings {
		const stored = this.app.loadLocalStorage(IM_STORAGE_KEY) as Partial<ImSettings> | null;
		return { ...DEFAULT_IM_SETTINGS, ...stored };
	}

	saveImSettings(s: ImSettings): void {
		this.app.saveLocalStorage(IM_STORAGE_KEY, s);
	}

	/** Lists left at their defaults are not stored, so new defaults reach existing installs. */
	async saveSettings(): Promise<void> {
		const data: Partial<VimLayerSettings> = { ...this.settings };
		if (data.hintSelectors?.join("\n") === DEFAULT_HINT_SELECTORS.join("\n")) delete data.hintSelectors;
		if (data.readingKeymap === DEFAULT_READING_KEYMAP) delete data.readingKeymap;
		await this.saveData(data);
	}
}
