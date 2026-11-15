import { App, Platform, PluginSettingTab, Setting, SettingDefinitionItem, SettingGroupItem, TextAreaComponent } from "obsidian";
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
	/** Obsidian's own values before Vim Layer changed them, restored when the option or the plugin is turned off. */
	originalDefaultViewMode?: unknown;
	originalVimMode?: unknown;

	jumpCharCount: number;
	jumpCaseSensitive: boolean;
	jumpWordRegex: string;
	/** A non-Latin layout seen while typing: physical key code → character. */
	jumpAltLayout: Record<string, string>;

	harpoonFiles: HarpoonEntry[];
	harpoonImported: boolean;


	vimrcEnabled: boolean;
	vimrcPath: string;
}

/**
 * Input method switching runs shell commands, so it is kept per device (localStorage), not in data.json:
 * a synced or shared vault cannot make another machine run commands, and paths differ between systems.
 */
export interface ImSettings {
	imEnabled: boolean;
	imPath: string;
	imLeaveCommand: string;
	imEnterCommand: string;
	imGetCommand: string;
}

export const IM_SETTING_KEYS = ["imEnabled", "imPath", "imLeaveCommand", "imEnterCommand", "imGetCommand"] as const;

export const DEFAULT_IM_SETTINGS: ImSettings = {
	imEnabled: false,
	imPath: Platform.isMacOS ? "/opt/homebrew/bin" : Platform.isWin ? "" : "/usr/bin",
	imLeaveCommand: Platform.isMacOS ? "macism com.apple.keylayout.ABC" : Platform.isWin ? "im-select.exe 1033" : "fcitx5-remote -c",
	imEnterCommand: Platform.isMacOS ? "macism {{im}}" : Platform.isWin ? "im-select.exe {{im}}" : "fcitx5-remote {{im}}",
	imGetCommand: Platform.isMacOS ? "macism" : Platform.isWin ? "im-select.exe" : "fcitx5-remote | sed 's/^2$/-o/;s/^1$/-c/'",
};

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

	// --- Obsidian 1.13+: declarative settings (rendered and searchable by Obsidian) ---

	getSettingDefinitions(): SettingDefinitionItem[] {
		const p = this.plugin;
		const s = () => p.settings;
		const conflict = (pluginId: string, name: string): SettingGroupItem => ({
			name: `${name} is enabled`,
			desc: `This part of Vim Layer stays off while ${name} runs. Disable ${name} to use it.`,
			searchable: false,
			visible: () => isPluginEnabled(this.app, pluginId),
			render: (setting) => setting.settingEl.addClass("vim-layer-setting-conflict"),
		});
		const codeArea = (
			setting: Setting,
			get: () => string,
			set: (v: string) => Promise<void>,
			rows: number,
			reset: { tooltip: string; value: () => string },
		) => {
			let area!: TextAreaComponent;
			setting.settingEl.addClass("vim-layer-setting-textarea");
			setting.addTextArea((t) => {
				area = t;
				t.inputEl.addClass("vim-layer-setting-code");
				t.inputEl.rows = rows;
				t.inputEl.spellcheck = false;
				t.setValue(get());
				// Saved shortly after typing stops and when the field loses focus, so the text is kept even if the
				// settings close without a blur event.
				let timer: number | null = null;
				const flush = () => {
					if (timer !== null) window.clearTimeout(timer);
					timer = null;
					if (t.getValue() !== get()) void set(t.getValue());
				};
				t.inputEl.addEventListener("input", () => {
					if (timer !== null) window.clearTimeout(timer);
					timer = window.setTimeout(flush, 500);
				});
				t.inputEl.addEventListener("blur", flush);
			});
			setting.addExtraButton((b) =>
				b
					.setIcon("rotate-ccw")
					.setTooltip(reset.tooltip)
					.onClick(async () => {
						area.setValue(reset.value());
						await set(reset.value());
					}),
			);
		};
		const items: SettingDefinitionItem[] = [
			{
				name: "Key layout",
				desc: "How keys are read in Vim Layer's menus and in Reading view. Auto: Latin layouts use the typed character, other layouts (Cyrillic, Greek…) the key's QWERTY position. Physical: always the QWERTY position. Typed: always the typed character.",
				control: {
					type: "dropdown",
					key: "keyMode",
					options: { auto: "Auto", physical: "Physical (QWERTY position)", typed: "Typed character" },
				},
			},
			{
				type: "group",
				heading: "Leader menu",
				items: [
					{
						name: "Keymap file",
						desc: "Vault path to a YAML keymap in the Spacekeys format (.yml, or .md with a YAML code block). Empty: built-in keymap. Reloaded on change.",
						control: { type: "text", key: "leaderKeymapPath", placeholder: "Meta/leader.yml" },
					},
					{
						name: "Reload keymap",
						desc: "Read the keymap file again and list any problems in it.",
						render: (setting) => {
							setting.addButton((b) => b.setButtonText("Reload").onClick(() => void p.loadLeaderKeymap(false)));
						},
					},
					{
						name: "Hint delay",
						desc: "Milliseconds before the leader menu and the key hints list the keys. 0 lists them at once.",
						control: { type: "number", key: "leaderDelay", min: 0, defaultValue: DEFAULT_SETTINGS.leaderDelay },
					},
					{
						name: "Key hints",
						desc: "After a key that starts a sequence (g, z, [ or ] in Vim Normal mode; g and other prefixes of your Reading view bindings), list the keys that can follow. Uses the hint delay above.",
						control: { type: "toggle", key: "vimKeyHints" },
					},
				],
			},
			{
				type: "group",
				heading: "Reading view",
				items: [
					conflict("vimium-plus", "Vimium+"),
					{
						name: "Vim keys in Reading view",
						desc: "Scrolling, link hints, tabs and your own bindings while a note is in Reading view or a tab is empty.",
						control: { type: "toggle", key: "readingEnabled" },
					},
					{
						name: "Key bindings",
						desc: "One per line: key sequence, then a command ID (g g vim-layer:scroll-to-top). Keys use the leader keymap notation; a later line wins; “-” as the command removes a binding.",
						render: (setting) =>
							codeArea(
								setting,
								() => s().readingKeymap,
								async (v) => {
									s().readingKeymap = v;
									await p.saveSettings();
									p.reading.reloadKeymap();
								},
								14,
								{ tooltip: "Restore default bindings", value: () => DEFAULT_READING_KEYMAP },
							),
					},
					{ name: "Scroll step", desc: "Pixels per j/k.", control: { type: "number", key: "scrollStep", min: 1, defaultValue: DEFAULT_SETTINGS.scrollStep } },
					{
						name: "Hint characters",
						desc: "Letters for link hint labels, most convenient first.",
						control: {
							type: "text",
							key: "hintChars",
							validate: (v: string) => (new Set(v.trim()).size > 1 ? undefined : "Use at least two different letters"),
						},
					},
					{
						name: "Hint targets",
						desc: "CSS selectors of elements that get a hint, one per line.",
						render: (setting) =>
							codeArea(
								setting,
								() => s().hintSelectors.join("\n"),
								async (v) => {
									s().hintSelectors = v.split("\n").map((x) => x.trim()).filter(Boolean);
									await p.saveSettings();
								},
								8,
								{ tooltip: "Restore default selectors", value: () => DEFAULT_HINT_SELECTORS.join("\n") },
							),
					},
					{ name: "Hint font size", control: { type: "number", key: "hintFontSize", min: 5, defaultValue: DEFAULT_SETTINGS.hintFontSize } },
					{
						name: "Open notes in Reading view",
						desc: "Notes open in Reading view; i edits, Esc returns. Obsidian's own default view mode comes back when turned off.",
						control: { type: "toggle", key: "forceReadingView" },
					},
					{
						name: "Esc returns to Reading view",
						desc: "Esc in Vim Normal mode (nothing pending) leaves the editor.",
						control: { type: "toggle", key: "escapeToReading" },
					},
					{
						name: "Turn on Vim mode",
						desc: "Turns on Obsidian's Vim key bindings in the editor while Vim Layer runs.",
						control: { type: "toggle", key: "enableVimMode" },
					},
					{
						name: "Mode indicator",
						desc: "READING / NORMAL / INSERT / VISUAL in the status bar.",
						control: { type: "toggle", key: "showModeIndicator" },
					},
				],
			},
			{
				type: "group",
				heading: "Jumps",
				items: [
					{
						name: "Characters to type",
						desc: "Jump to characters: how many characters to type before the labels appear.",
						control: { type: "dropdown", key: "jumpCharCount", options: { "1": "1", "2": "2", "3": "3" } },
					},
					{
						name: "Case sensitive",
						desc: "Jump to characters: match upper and lower case exactly.",
						control: { type: "toggle", key: "jumpCaseSensitive" },
					},
					{
						name: "Word pattern",
						desc: "Jump to word: a regular expression for what counts as a word. The default is 3 or more letters, digits or _ in any language.",
						control: {
							type: "text",
							key: "jumpWordRegex",
							placeholder: DEFAULT_SETTINGS.jumpWordRegex,
							validate: (v: string) => {
								try {
									new RegExp(v || DEFAULT_SETTINGS.jumpWordRegex, "gu");
									return undefined;
								} catch (e) {
									return e instanceof Error ? e.message : "Invalid regular expression";
								}
							},
						},
					},
				],
			},
			{
				type: "group",
				heading: "Harpoon",
				items: [
					{
						name: "Files",
						desc: "Commands: Harpoon: add current file, open list, go to file 1–9, remove current file.",
						render: (setting) => {
							const fill = () =>
								setting.setDesc(
									s().harpoonFiles.length
										? s().harpoonFiles.map((f, i) => `${i + 1}. ${f.path}`).join("  ·  ")
										: "Empty. Commands: Harpoon: add current file, open list, go to file 1–9.",
								);
							fill();
							setting.addButton((b) =>
								b.setButtonText("Clear").onClick(async () => {
									s().harpoonFiles = [];
									await p.saveSettings();
									fill();
								}),
							);
						},
					},
				],
			},
		];
		if (Platform.isDesktopApp) {
			items.push({
				type: "group",
				heading: "Input method",
				items: [
					conflict("vim-im-control", "Vim IM Control"),
					{
						name: "Switch input method",
						desc: "Leave Insert mode: save the current input method and switch to the one below. Enter Insert mode: switch back. These settings stay on this device and are not synced with the vault.",
						control: { type: "toggle", key: "imEnabled" },
					},
					{ name: "Extra PATH", desc: "Folder with the switcher (macism, im-select, fcitx5-remote).", control: { type: "text", key: "imPath" } },
					{ name: "On leaving Insert", desc: "Command that switches to the Latin layout.", control: { type: "text", key: "imLeaveCommand" } },
					{
						name: "On entering Insert",
						desc: "Command that restores the saved input method; {{im}} is replaced with it. Empty: do not restore.",
						control: { type: "text", key: "imEnterCommand" },
					},
					{ name: "Get current", desc: "Command that prints the current input method. Empty: do not restore.", control: { type: "text", key: "imGetCommand" } },
				],
			});
		}
		items.push({
			type: "group",
			heading: "Vimrc",
			items: [
				conflict("obsidian-vimrc-support", "Vimrc Support"),
				{
					name: "Load vimrc",
					desc: "Run a vimrc file in Obsidian's Vim mode: map / noremap / unmap, exmap, obcommand, let mapleader, set clipboard=unnamed, source. Adds ]] [[ (headings), gl gL (links), gf gx (follow link).",
					control: { type: "toggle", key: "vimrcEnabled" },
				},
				{
					name: "Vimrc file",
					desc: "Vault path. Use “Reload vimrc” after editing.",
					control: { type: "text", key: "vimrcPath", placeholder: DEFAULT_SETTINGS.vimrcPath },
				},
				{
					name: "Create vimrc",
					desc: "Create the vimrc file with the Quick start keys: Space opens the leader menu in the editor, s and S jump. An existing file is not changed.",
					render: (setting) => {
						setting.addButton((b) => b.setButtonText("Create").onClick(() => void p.vimrc.createExample()));
					},
				},
				{
					name: "Reload vimrc",
					desc: "Clear the mappings and run the vimrc file again.",
					render: (setting) => {
						setting.addButton((b) => b.setButtonText("Reload").onClick(() => void p.vimrc.reload()));
					},
				},
			],
		});
		return items;
	}

	getControlValue(key: string): unknown {
		if ((IM_SETTING_KEYS as readonly string[]).includes(key)) return this.plugin.imSettings()[key as keyof ImSettings];
		if (key === "jumpCharCount") return String(this.plugin.settings.jumpCharCount);
		return (this.plugin.settings as unknown as Record<string, unknown>)[key];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const p = this.plugin;
		if ((IM_SETTING_KEYS as readonly string[]).includes(key)) {
			const im = p.imSettings();
			(im as unknown as Record<string, unknown>)[key] = typeof value === "string" ? value.trim() : value;
			p.saveImSettings(im);
			return;
		}
		const settings = p.settings as unknown as Record<string, unknown>;
		switch (key) {
			case "jumpCharCount":
				settings[key] = Number(value);
				break;
			case "leaderKeymapPath":
			case "hintChars":
				settings[key] = String(value).trim();
				break;
			case "jumpWordRegex":
				settings[key] = String(value).trim() || DEFAULT_SETTINGS.jumpWordRegex;
				break;
			case "vimrcPath":
				settings[key] = String(value).trim() || DEFAULT_SETTINGS.vimrcPath;
				break;
			case "leaderDelay":
				settings[key] = Math.max(0, Math.round(Number(value) || 0));
				break;
			default:
				settings[key] = value;
		}
		await p.saveSettings();
		if (key === "leaderKeymapPath") await p.loadLeaderKeymap(true);
		if (["readingEnabled", "forceReadingView", "escapeToReading", "enableVimMode", "showModeIndicator"].includes(key)) p.reading.applyConfig();
	}

	// --- Obsidian < 1.13: imperative fallback ---

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
			const im = p.imSettings();
			const saveIm = () => p.saveImSettings(im);
			new Setting(containerEl)
				.setName("Switch input method")
				.setDesc(
					"Leave Insert mode: save the current input method and switch to the one below. Enter Insert mode: switch back. These settings stay on this device and are not synced with the vault.",
				)
				.addToggle((t) =>
					t.setValue(im.imEnabled).onChange((v) => {
						im.imEnabled = v;
						saveIm();
					}),
				);
			const text = (name: string, desc: string, key: "imPath" | "imLeaveCommand" | "imEnterCommand" | "imGetCommand") =>
				new Setting(containerEl)
					.setName(name)
					.setDesc(desc)
					.addText((t) => {
						t.inputEl.addClass("vim-layer-setting-code");
						t.setValue(im[key]).onChange((v) => {
							im[key] = v.trim();
							saveIm();
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
		new Setting(containerEl)
			.setName("Create vimrc")
			.setDesc("Create the vimrc file with the Quick start keys: Space opens the leader menu in the editor, s and S jump. An existing file is not changed.")
			.addButton((b) => b.setButtonText("Create").onClick(() => void p.vimrc.createExample()));
	}
}
