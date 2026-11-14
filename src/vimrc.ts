// .vimrc support for Obsidian's Vim mode: map/noremap/unmap, exmap, obcommand, mapleader, set clipboard,
// source, and Obsidian motions (]] [[ gl gL gf). Replaces Vimrc Support and reads the same file format.
import { MarkdownView, Notice } from "obsidian";
import type VimLayerPlugin from "./main";
import { appCommands, CmAdapter, cmOf, ExParams, isPluginEnabled, Pos, VimApi, vimApi } from "./obsidian-internal";

const LEADER_COMMANDS = new Set([
	"map", "nmap", "imap", "vmap", "omap",
	"noremap", "nnoremap", "vnoremap", "inoremap", "onoremap",
	"unmap", "iunmap", "nunmap", "vunmap",
]);

const HEADING = /^#{1,6} /gm;
const CODE_BLOCK = /(^```+)(.*?^\1|.*)/gms;
const LINK = /\[\[.*?\]\]|\[(?:[^\\[\]\n]|\\.)*?\]\(.*?[^\\]\)|[a-z]+:\/\/\S+/g;
/** Links written as \[[...]] or \[...](...) are escaped text, not links. */
const escaped = (content: string) => (m: RegExpMatchArray) => (m.index ?? 0) > 0 && content[(m.index ?? 0) - 1] === "\\";

const within = (m: RegExpMatchArray, i: number) => (m.index ?? 0) <= i && i < (m.index ?? 0) + m[0].length;

/** Position of the n-th match after (or before) the cursor, wrapping around the file. */
function jumpToPattern(cm: CmAdapter, head: Pos, repeat: number, regex: RegExp, dir: "next" | "previous", skip?: (m: RegExpMatchArray) => boolean): Pos {
	const content = cm.getValue();
	const cursor = cm.indexFromPos(head);
	const all = [...content.matchAll(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g"))].filter((m) => !skip?.(m));
	const prev = all.filter((m) => (m.index ?? 0) < cursor && !within(m, cursor));
	const cur = all.filter((m) => within(m, cursor));
	const next = all.filter((m) => (m.index ?? 0) > cursor);
	const ordered = dir === "next" ? [...next, ...prev, ...cur] : [...prev.reverse(), ...next.reverse(), ...cur.reverse()];
	if (!ordered.length) return head;
	const n = repeat % ordered.length || ordered.length;
	return cm.posFromIndex(ordered[n - 1].index ?? 0);
}

function jumpToHeading(cm: CmAdapter, head: Pos, repeat: number, dir: "next" | "previous"): Pos {
	const blocks = [...cm.getValue().matchAll(CODE_BLOCK)];
	return jumpToPattern(cm, head, repeat, HEADING, dir, (m) => blocks.some((b) => within(b, m.index ?? 0)));
}

export class Vimrc {
	private loaded = false;
	private leader = "\\";
	/** Normal-mode mappings from the vimrc with a readable description, for the key hints. */
	private mappings = new Map<string, string>();
	private clipboardSync = false;
	private lastYank = "";
	private lastClipboard = "";

	constructor(private readonly plugin: VimLayerPlugin) {}

	/** Takes over only when the module is on and Vimrc Support is not running. */
	get active(): boolean {
		return this.plugin.settings.vimrcEnabled && !isPluginEnabled(this.plugin.app, "obsidian-vimrc-support");
	}

	load(): void {
		const { plugin } = this;
		plugin.addCommand({ id: "reload-vimrc", name: "Reload vimrc", callback: () => void this.reload() });
		const tryLoad = () => void this.loadOnce();
		plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", tryLoad));
		plugin.registerEvent(plugin.app.workspace.on("file-open", tryLoad));
		plugin.app.workspace.onLayoutReady(tryLoad);
		// Yank ↔ system clipboard, checked after each key and click like Vimrc Support does.
		const sync = () => void this.syncClipboard();
		plugin.registerDomEvent(activeDocument, "keyup", sync);
		plugin.registerDomEvent(activeDocument, "click", sync);
		plugin.registerDomEvent(activeDocument, "focusin", sync);
	}

	private editorCm(): CmAdapter | null {
		return cmOf(this.plugin.app.workspace.getActiveViewOfType(MarkdownView));
	}

	private async loadOnce(): Promise<void> {
		if (this.loaded || !this.active) return;
		const vim = vimApi();
		const cm = this.editorCm();
		if (!vim || !cm) return;
		this.loaded = true;
		void this.readMappings();
		// Commands and motions belong to this plugin instance, so define them on every load.
		this.defineCommands(vim);
		// Vim's mappings outlive a plugin reload: run the file only once per app session.
		if (vim.loadedVimrc) return;
		vim.loadedVimrc = true;
		await this.runFile(vim, cm, this.plugin.settings.vimrcPath, true);
	}

	/** Clear user mappings and run the vimrc again. */
	async reload(): Promise<void> {
		if (!this.active) {
			new Notice("Vim Layer: vimrc loading is off or Vimrc Support is enabled");
			return;
		}
		const vim = vimApi();
		const cm = this.editorCm();
		if (!vim || !cm) {
			new Notice("Vim Layer: open a note in the editor with Vim mode on, then reload");
			return;
		}
		if (!this.loaded) {
			this.loaded = true;
			vim.loadedVimrc = true;
			this.defineCommands(vim);
		}
		vim.mapclear?.();
		// mapclear also drops the built-in motions (]] [[ gl gL gf); map them again.
		this.mapBuiltins(vim);
		this.leader = "\\";
		this.clipboardSync = false;
		const errors = await this.runFile(vim, cm, this.plugin.settings.vimrcPath, false);
		await this.readMappings();
		if (!errors) new Notice(`Vim Layer: reloaded ${this.plugin.settings.vimrcPath}`);
	}

	userMappings(): ReadonlyMap<string, string> {
		return this.mappings;
	}

	/** Describe the vimrc's normal-mode mappings: ":grep<CR>" with "exmap grep obcommand omnisearch:show-modal" → the command's name. */
	private async readMappings(): Promise<void> {
		let text: string;
		try {
			text = await this.plugin.app.vault.adapter.read(this.plugin.settings.vimrcPath);
		} catch {
			return;
		}
		let leader = "\\";
		const exmaps = new Map<string, string>();
		const maps: [string, string][] = [];
		for (const raw of text.split("\n")) {
			const line = raw.trim();
			const lead = /^let\s+mapleader\s*=\s*["'](.+?)["']$/i.exec(line);
			if (lead) leader = lead[1];
			const ex = /^exmap\s+(\S+)\s+(.+)$/.exec(line);
			if (ex) exmaps.set(ex[1], ex[2]);
			const map = /^(?:n?map|n?noremap)\s+(?:<silent>\s+)?(\S+)\s+(.+)$/i.exec(line);
			if (map) maps.push([map[1].replace(/<leader>/gi, leader), map[2]]);
		}
		const commands = appCommands(this.plugin.app);
		const out = new Map<string, string>();
		for (const [lhs, rhs] of maps) {
			if (lhs.startsWith("<")) continue;
			let desc = rhs;
			const exName = /^:(\S+?)<CR>$/i.exec(rhs)?.[1];
			const body = exName ? exmaps.get(exName) : undefined;
			const id = body ? /^obcommand\s+(\S+)$/.exec(body)?.[1] : undefined;
			if (id) desc = commands.findCommand(id)?.name ?? id;
			else if (body) desc = `:${body}`;
			out.set(lhs, desc);
		}
		this.mappings = out;
	}

	/** Returns the number of failed lines. */
	private async runFile(vim: VimApi, cm: CmAdapter, path: string, quiet: boolean): Promise<number> {
		let text: string;
		try {
			text = await this.plugin.app.vault.adapter.read(path);
		} catch {
			if (!quiet) new Notice(`Vim Layer: cannot read ${path}`);
			return 1;
		}
		const errors: string[] = [];
		text.split("\n").forEach((raw, i) => {
			const line = raw.trim();
			if (!line || line.startsWith('"')) return;
			const leader = /^let\s+mapleader\s*=\s*["'](.+?)["']$/i.exec(line);
			if (leader) {
				this.leader = leader[1];
				return;
			}
			const cmd = line.split(/\s+/, 1)[0];
			const processed = LEADER_COMMANDS.has(cmd) ? line.replace(/<leader>/gi, this.leader) : line;
			try {
				vim.handleEx(cm, processed);
			} catch (e) {
				errors.push(`${path}:${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
			}
		});
		if (errors.length) {
			console.warn("Vim Layer: vimrc errors\n" + errors.join("\n"));
			new Notice(`Vim Layer: ${errors.length} vimrc line(s) failed:\n${errors.slice(0, 5).join("\n")}`, 10000);
		}
		return errors.length;
	}

	private runObsidianCommand(id: string): void {
		const commands = appCommands(this.plugin.app);
		const command = commands.commands[id] as
			| {
					callback?: () => void;
					checkCallback?: (checking: boolean) => boolean | void;
					editorCallback?: (editor: unknown, view: unknown) => void;
					editorCheckCallback?: (checking: boolean, editor: unknown, view: unknown) => boolean | void;
			  }
			| undefined;
		if (!command) throw new Error(`Command ${id} was not found; run "obcommand" without arguments to list commands in the console`);
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		const editor = view?.editor;
		if (command.editorCheckCallback) command.editorCheckCallback(false, editor, view);
		else if (command.editorCallback) command.editorCallback(editor, view);
		else if (command.checkCallback) command.checkCallback(false);
		else if (command.callback) command.callback();
		else throw new Error(`Command ${id} cannot be run from Vim`);
	}

	private defineCommands(vim: VimApi): void {
		vim.defineOption("clipboard", "", "string", ["clip"], (value?: unknown) => {
			if (typeof value !== "string" || !value) return;
			if (value.trim() !== "unnamed" && value.trim() !== "unnamedplus") {
				throw new Error("clipboard: only 'unnamed' and 'unnamedplus' are supported");
			}
			this.clipboardSync = true;
		});
		vim.defineOption("tabstop", 4, "number", [], (value?: unknown, cm?: unknown) => {
			const editor = cm as { setOption?: (k: string, v: unknown) => void } | undefined;
			if (typeof value === "number" && value > 0 && editor?.setOption) editor.setOption("tabSize", value);
		});

		for (const [name, mode] of [["iunmap", "insert"], ["nunmap", "normal"], ["vunmap", "visual"]] as const) {
			vim.defineEx(name, "", (_cm, p: ExParams) => {
				const keys = p.argString?.trim();
				if (keys) vim.unmap(keys, mode);
			});
		}
		vim.defineEx("noremap", "", (_cm, p: ExParams) => {
			if (!p.args?.length) throw new Error("noremap needs a mapping");
			vim.noremap(...p.args);
		});
		vim.defineEx("exmap", "", (_cm, p: ExParams) => {
			const args = [...(p.args ?? [])];
			if (args.length < 2) throw new Error("exmap needs a name and a command");
			const name = args.shift() as string;
			const body = args.join(" ");
			vim.defineEx(name, "", (cm) => vim.handleEx(cm, body));
		});
		vim.defineEx("obcommand", "", (_cm, p: ExParams) => {
			if (p.args?.length !== 1) throw new Error("obcommand needs exactly one command ID");
			this.runObsidianCommand(p.args[0]);
		});
		vim.defineEx("source", "", (cm, p: ExParams) => {
			const file = p.argString?.trim();
			if (file) void this.runFile(vim, cm, file, false);
		});

		vim.defineMotion("vimLayerNextHeading", (cm: CmAdapter, head: Pos, a: { repeat: number }) => jumpToHeading(cm, head, a.repeat, "next"));
		vim.defineMotion("vimLayerPrevHeading", (cm: CmAdapter, head: Pos, a: { repeat: number }) => jumpToHeading(cm, head, a.repeat, "previous"));
		vim.defineMotion("vimLayerNextLink", (cm: CmAdapter, head: Pos, a: { repeat: number }) => jumpToPattern(cm, head, a.repeat, LINK, "next", escaped(cm.getValue())));
		vim.defineMotion("vimLayerPrevLink", (cm: CmAdapter, head: Pos, a: { repeat: number }) => jumpToPattern(cm, head, a.repeat, LINK, "previous", escaped(cm.getValue())));

		vim.defineAction("vimLayerFollowLink", () => {
			const editor = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
			if (!editor) return;
			// On the opening brackets of a link, step inside first so Obsidian sees the link.
			const { line, ch } = editor.getCursor();
			const moved = [...editor.getRange({ line, ch }, { line, ch: ch + 2 })].filter((c) => c === "[").length;
			for (let i = 0; i < moved; i++) editor.exec("goRight");
			this.runObsidianCommand("editor:follow-link");
			for (let i = 0; i < moved; i++) editor.exec("goLeft");
		});
		this.mapBuiltins(vim);
	}

	private mapBuiltins(vim: VimApi): void {
		vim.mapCommand("]]", "motion", "vimLayerNextHeading", undefined, {});
		vim.mapCommand("[[", "motion", "vimLayerPrevHeading", undefined, {});
		vim.mapCommand("gl", "motion", "vimLayerNextLink", undefined, {});
		vim.mapCommand("gL", "motion", "vimLayerPrevLink", undefined, {});
		vim.mapCommand("gf", "action", "vimLayerFollowLink", undefined, {});
		vim.mapCommand("gx", "action", "vimLayerFollowLink", undefined, {});
	}

	private async syncClipboard(): Promise<void> {
		if (!this.clipboardSync) return;
		const vim = vimApi();
		const register = vim?.getRegisterController?.().getRegister("yank");
		if (!register) return;
		const yank = register.keyBuffer?.[0] ?? "";
		try {
			if (yank !== this.lastYank) {
				await navigator.clipboard.writeText(yank);
				this.lastYank = yank;
				this.lastClipboard = yank;
				return;
			}
			const clip = await navigator.clipboard.readText();
			if (clip !== this.lastClipboard) {
				register.setText(clip);
				this.lastClipboard = clip;
				this.lastYank = register.keyBuffer?.[0] ?? "";
			}
		} catch {
			// The document may not be focused; try again on the next event.
		}
	}
}
