import { App, Platform, PluginSettingTab, Setting } from "obsidian";
import type { HarpoonEntry } from "./harpoon";
import type { KeyMode } from "./keys";
import type VimLayerPlugin from "./main";
import { isPluginEnabled } from "./obsidian-internal";
import { DEFAULT_READING_KEYMAP } from "./reading/reading";

export const DEFAULT_HINT_SELECTORS = [
	".workspace-tab-header",
	".workspace-tab-header-inner",
	".side-dock-ribbon-action",
	".clickable-icon",
	".nav-file-title",
	".nav-folder-title",
	".tree-item-self",
	".menu-item",
	".markdown-preview-view a",
	".markdown-preview-view .internal-link",
	".markdown-preview-view .external-link",
	".markdown-preview-view .tag",
	".markdown-preview-view .task-list-item-checkbox",
	".markdown-preview-view button",
	".markdown-embed-link",
	".markdown-preview-view .callout.is-collapsible > .callout-title",
	".markdown-preview-view summary",
];

export interface VimLayerSettings {
	keyMode: KeyMode;

	leaderKeymapPath: string;
	leaderDelay: number;
	/** Show which keys can follow g, z, [ and ] in the editor. */
	vimKeyHints: boolean;

	readingEnabled: boolean;
	readingKeymap: string;
	scrollStep: number;
	hintChars: string;
	hintSelectors: string[];
	hintFontSize: number;
	forceReadingView: boolean;
	escapeToReading: boolean;
	enableVimMode: boolean;
	showModeIndicator: boolean;

	jumpCharCount: number;
	jumpCaseSensitive: boolean;
	jumpWordRegex: string;
	/** A non-Latin layout seen while typing: physical key code → character. */
	jumpAltLayout: Record<string, string>;

	harpoonFiles: HarpoonEntry[];
	harpoonImported: boolean;

	imEnabled: boolean;
	imPath: string;
	imLeaveCommand: string;
	imEnterCommand: string;
	imGetCommand: string;

	vimrcEnabled: boolean;
	vimrcPath: string;
}

export const DEFAULT_SETTINGS: VimLayerSettings = {
	keyMode: "auto",

	leaderKeymapPath: "",
	leaderDelay: 300,
	vimKeyHints: true,

	readingEnabled: true,
	readingKeymap: DEFAULT_READING_KEYMAP,
	scrollStep: 70,
	hintChars: "sadfjklewcmpgh",
	hintSelectors: DEFAULT_HINT_SELECTORS,
	hintFontSize: 11,
	forceReadingView: false,
	escapeToReading: true,
	enableVimMode: false,
	showModeIndicator: true,

	jumpCharCount: 2,
	jumpCaseSensitive: false,
	jumpWordRegex: "[\\p{L}\\p{N}_]{3,}",
	jumpAltLayout: {},

	harpoonFiles: [],
	harpoonImported: false,

	imEnabled: false,
	imPath: Platform.isMacOS ? "/opt/homebrew/bin" : Platform.isWin ? "" : "/usr/bin",
	imLeaveCommand: Platform.isMacOS ? "macism com.apple.keylayout.ABC" : Platform.isWin ? "im-select.exe 1033" : "fcitx5-remote -c",
	imEnterCommand: Platform.isMacOS ? "macism {{im}}" : Platform.isWin ? "im-select.exe {{im}}" : "fcitx5-remote {{im}}",
	imGetCommand: Platform.isMacOS ? "macism" : Platform.isWin ? "im-select.exe" : "fcitx5-remote | sed 's/^2$/-o/;s/^1$/-c/'",

	vimrcEnabled: true,
	vimrcPath: ".obsidian.vimrc",
};

export class VimLayerSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: VimLayerPlugin,
	) {
		super(app, plugin);
	}

	private note(el: HTMLElement, pluginId: string, name: string): void {
		if (isPluginEnabled(this.app, pluginId)) {
			el.createDiv({ cls: "vim-layer-setting-warning", text: `${name} is enabled, so this part of Vim Layer stays off. Disable ${name} to use it.` });
		}
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const p = this.plugin;
		const s = p.settings;
		const save = () => p.saveSettings();

		new Setting(containerEl)
			.setName("Key layout")
			.setDesc(
				"How keys are read in Vim Layer's menus and in Reading view. Auto: Latin layouts use the typed character, other layouts (Cyrillic, Greek…) the key's QWERTY position. Physical: always the QWERTY position. Typed: always the typed character.",
			)
			.addDropdown((d) =>
				d
					.addOptions({ auto: "Auto", physical: "Physical (QWERTY position)", typed: "Typed character" })
					.setValue(s.keyMode)
					.onChange(async (v) => {
						s.keyMode = v as KeyMode;
						await save();
					}),
			);

		// ---- Leader ----
		new Setting(containerEl).setName("Leader menu").setHeading();
		new Setting(containerEl)
			.setName("Keymap file")
			.setDesc("Vault path to a YAML keymap in the Spacekeys format (.yml, or .md with a YAML code block). Empty: built-in keymap. Reloaded on change.")
			.addText((t) =>
				t
					.setPlaceholder("Meta/leader.yml")
					.setValue(s.leaderKeymapPath)
					.onChange(async (v) => {
						s.leaderKeymapPath = v.trim();
						await save();
						await p.loadLeaderKeymap(true);
					}),
			)
			.addButton((b) => b.setButtonText("Reload").onClick(() => void p.loadLeaderKeymap(false)));
		new Setting(containerEl)
			.setName("Hint delay")
			.setDesc("Milliseconds before the leader menu and the editor key hints list the keys. 0 lists them at once.")
			.addText((t) =>
				t.setValue(String(s.leaderDelay)).onChange(async (v) => {
					const n = Number(v);
					if (!Number.isFinite(n) || n < 0) return;
					s.leaderDelay = Math.round(n);
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("Key hints")
			.setDesc("After a key that starts a sequence (g, z, [ or ] in Vim Normal mode; g and other prefixes of your Reading view bindings), list the keys that can follow. Uses the hint delay above.")
			.addToggle((t) =>
				t.setValue(s.vimKeyHints).onChange(async (v) => {
					s.vimKeyHints = v;
					await save();
				}),
			);

		// ---- Reading view ----
		new Setting(containerEl).setName("Reading view").setHeading();
		this.note(containerEl, "vimium-plus", "Vimium+");
		new Setting(containerEl)
			.setName("Vim keys in Reading view")
			.setDesc("Scrolling, link hints, tabs and your own bindings while a note is in Reading view or a tab is empty.")
			.addToggle((t) =>
				t.setValue(s.readingEnabled).onChange(async (v) => {
					s.readingEnabled = v;
					await save();
					p.reading.applyConfig();
				}),
			);
		new Setting(containerEl)
			.setName("Key bindings")
			.setDesc("One per line: key sequence, then a command ID (g g vim-layer:scroll-to-top). Keys use the leader keymap notation; a later line wins; “-” as the command removes a binding.")
			.addTextArea((t) => {
				t.inputEl.addClass("vim-layer-setting-code");
				t.inputEl.rows = 14;
				t.setValue(s.readingKeymap).onChange(async (v) => {
					s.readingKeymap = v;
					await save();
					p.reading.reloadKeymap();
				});
			})
			.addExtraButton((b) =>
				b
					.setIcon("rotate-ccw")
					.setTooltip("Restore default bindings")
					.onClick(async () => {
						s.readingKeymap = DEFAULT_READING_KEYMAP;
						await save();
						p.reading.reloadKeymap();
						this.display();
					}),
			);
		new Setting(containerEl)
			.setName("Scroll step")
			.setDesc("Pixels per j/k.")
			.addText((t) =>
				t.setValue(String(s.scrollStep)).onChange(async (v) => {
					const n = Number(v);
					if (Number.isFinite(n) && n > 0) {
						s.scrollStep = n;
						await save();
					}
				}),
			);
		new Setting(containerEl)
			.setName("Hint characters")
			.setDesc("Letters for link hint labels, most convenient first.")
			.addText((t) =>
				t.setValue(s.hintChars).onChange(async (v) => {
					s.hintChars = v.trim();
					await save();
				}),
			);
		new Setting(containerEl)
			.setName("Hint targets")
			.setDesc("CSS selectors of elements that get a hint, one per line.")
			.addTextArea((t) => {
				t.inputEl.addClass("vim-layer-setting-code");
				t.inputEl.rows = 8;
				t.setValue(s.hintSelectors.join("\n")).onChange(async (v) => {
					s.hintSelectors = v.split("\n").map((x) => x.trim()).filter(Boolean);
					await save();
				});
			})
			.addExtraButton((b) =>
				b
					.setIcon("rotate-ccw")
					.setTooltip("Restore default selectors")
					.onClick(async () => {
						s.hintSelectors = [...DEFAULT_HINT_SELECTORS];
						await save();
						this.display();
					}),
			);
		new Setting(containerEl)
			.setName("Hint font size")
			.addText((t) =>
				t.setValue(String(s.hintFontSize)).onChange(async (v) => {
					const n = Number(v);
					if (Number.isFinite(n) && n > 4) {
						s.hintFontSize = n;
						await save();
					}
				}),
			);
		const toggle = (name: string, desc: string, key: "forceReadingView" | "escapeToReading" | "enableVimMode" | "showModeIndicator") =>
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addToggle((t) =>
					t.setValue(s[key]).onChange(async (v) => {
						s[key] = v;
						await save();
						p.reading.applyConfig();
					}),
				);
		toggle("Open notes in Reading view", "Notes open in Reading view; i edits, Esc returns. Restores Obsidian's default view mode when turned off.", "forceReadingView");
		toggle("Esc returns to Reading view", "Esc in Vim Normal mode (nothing pending) leaves the editor.", "escapeToReading");
		toggle("Turn on Vim mode", "Turns on Obsidian's Vim key bindings in the editor while Vim Layer runs.", "enableVimMode");
		toggle("Mode indicator", "READING / NORMAL / INSERT / VISUAL in the status bar.", "showModeIndicator");

		// ---- Jumps ----
		new Setting(containerEl).setName("Jumps").setHeading();
		new Setting(containerEl)
			.setName("Characters to type")
			.setDesc("Jump to characters: how many characters to type before the labels appear.")
			.addDropdown((d) =>
				d
					.addOptions({ "1": "1", "2": "2", "3": "3" })
					.setValue(String(s.jumpCharCount))
					.onChange(async (v) => {
						s.jumpCharCount = Number(v);
						await save();
					}),
			);
		new Setting(containerEl)
			.setName("Case sensitive")
			.setDesc("Jump to characters: match upper and lower case exactly.")
			.addToggle((t) =>
				t.setValue(s.jumpCaseSensitive).onChange(async (v) => {
					s.jumpCaseSensitive = v;
					await save();
				}),
			);
		new Setting(containerEl)
			.setName("Word pattern")
			.setDesc("Jump to word: a regular expression for what counts as a word. The default is 3 or more letters, digits or _ in any language.")
			.addText((t) => {
				t.inputEl.addClass("vim-layer-setting-code");
				t.setValue(s.jumpWordRegex).onChange(async (v) => {
					s.jumpWordRegex = v.trim() || DEFAULT_SETTINGS.jumpWordRegex;
					await save();
				});
			});

		// ---- Harpoon ----
		new Setting(containerEl).setName("Harpoon").setHeading();
		new Setting(containerEl)
			.setName("Files")
			.setDesc(
				s.harpoonFiles.length
					? s.harpoonFiles.map((f, i) => `${i + 1}. ${f.path}`).join("  ·  ")
					: "Empty. Commands: Harpoon: add current file, open list, go to file 1–9.",
			)
			.addButton((b) =>
				b.setButtonText("Clear").onClick(async () => {
					s.harpoonFiles = [];
					await save();
					this.display();
				}),
			);

		// ---- Input method ----
		if (Platform.isDesktopApp) {
			new Setting(containerEl).setName("Input method").setHeading();
			this.note(containerEl, "vim-im-control", "Vim IM Control");
			new Setting(containerEl)
				.setName("Switch input method")
				.setDesc("Leave Insert mode: save the current input method and switch to the one below. Enter Insert mode: switch back.")
				.addToggle((t) =>
					t.setValue(s.imEnabled).onChange(async (v) => {
						s.imEnabled = v;
						await save();
					}),
				);
			const text = (name: string, desc: string, key: "imPath" | "imLeaveCommand" | "imEnterCommand" | "imGetCommand") =>
				new Setting(containerEl)
					.setName(name)
					.setDesc(desc)
					.addText((t) => {
						t.inputEl.addClass("vim-layer-setting-code");
						t.setValue(s[key]).onChange(async (v) => {
							s[key] = v.trim();
							await save();
						});
					});
			text("Extra PATH", "Folder with the switcher (macism, im-select, fcitx5-remote).", "imPath");
			text("On leaving Insert", "Command that switches to the Latin layout.", "imLeaveCommand");
			text("On entering Insert", "Command that restores the saved input method; {{im}} is replaced with it. Empty: do not restore.", "imEnterCommand");
			text("Get current", "Command that prints the current input method. Empty: do not restore.", "imGetCommand");
		}

		// ---- vimrc ----
		new Setting(containerEl).setName("Vimrc").setHeading();
		this.note(containerEl, "obsidian-vimrc-support", "Vimrc Support");
		new Setting(containerEl)
			.setName("Load vimrc")
			.setDesc("Run a vimrc file in Obsidian's Vim mode: map / noremap / unmap, exmap, obcommand, let mapleader, set clipboard=unnamed, source. Adds ]] [[ (headings), gl gL (links), gf (follow link).")
			.addToggle((t) =>
				t.setValue(s.vimrcEnabled).onChange(async (v) => {
					s.vimrcEnabled = v;
					await save();
				}),
			);
		new Setting(containerEl)
			.setName("Vimrc file")
			.setDesc("Vault path. Use the command “Reload vimrc” after editing.")
			.addText((t) =>
				t.setValue(s.vimrcPath).onChange(async (v) => {
					s.vimrcPath = v.trim() || ".obsidian.vimrc";
					await save();
				}),
			)
			.addButton((b) => b.setButtonText("Reload").onClick(() => void p.vimrc.reload()));
	}
}
