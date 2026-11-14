// Internal Obsidian and CodeMirror APIs that are stable in practice but not in the published typings.
import { App, MarkdownView } from "obsidian";

export interface AppCommands {
	commands: Record<string, { id: string; name: string }>;
	findCommand(id: string): { id: string; name: string } | undefined;
	executeCommandById(id: string): boolean;
}

export function appCommands(app: App): AppCommands {
	return (app as unknown as { commands: AppCommands }).commands;
}

export function runCommand(app: App, id: string): boolean {
	return appCommands(app).executeCommandById(id);
}

export function isPluginEnabled(app: App, id: string): boolean {
	const plugins = (app as unknown as { plugins?: { enabledPlugins?: Set<string> } }).plugins;
	return plugins?.enabledPlugins?.has(id) ?? false;
}

interface VaultConfig {
	getConfig(key: string): unknown;
	setConfig(key: string, value: unknown): void;
}

export function vaultConfig(app: App): VaultConfig {
	return app.vault as unknown as VaultConfig;
}

export interface BookmarkItem {
	type: string;
	title?: string;
	path?: string;
	subpath?: string;
	url?: string;
	items?: BookmarkItem[];
}

export function bookmarkItems(app: App): BookmarkItem[] {
	const internal = (app as unknown as {
		internalPlugins?: { getEnabledPluginById(id: string): { items: BookmarkItem[] } | null };
	}).internalPlugins;
	return internal?.getEnabledPluginById("bookmarks")?.items ?? [];
}

/** The CodeMirror 5 compatible adapter Obsidian puts on each editor; the Vim keymap lives there. */
export interface CmAdapter {
	on(event: string, handler: (...args: never[]) => void): void;
	off(event: string, handler: (...args: never[]) => void): void;
	state?: { vim?: VimState };
	getValue(): string;
	indexFromPos(pos: { line: number; ch: number }): number;
	posFromIndex(index: number): { line: number; ch: number };
}

export interface VimState {
	insertMode?: boolean;
	visualMode?: boolean;
	inputState?: { keyBuffer?: unknown[]; operator?: unknown; prefixRepeat?: unknown[]; motionRepeat?: unknown[] };
}

export function cmOf(view: MarkdownView | null): CmAdapter | null {
	const editor = (view as unknown as { editMode?: { editor?: { cm?: { cm?: CmAdapter } } } } | null)?.editMode?.editor;
	return editor?.cm?.cm ?? null;
}

export type Pos = { line: number; ch: number };

export interface ExParams {
	args?: string[];
	argString?: string;
}

export interface VimRegister {
	keyBuffer?: string[];
	setText(text: string): void;
}

/** The part of CodeMirror's Vim API (replit/codemirror-vim) that Vim Layer uses. */
export interface VimApi {
	loadedVimrc?: boolean;
	handleEx(cm: CmAdapter, line: string): void;
	mapclear?(ctx?: string): void;
	defineOption(name: string, defaultValue: unknown, type: string, aliases: string[], callback: (value?: unknown, cm?: unknown) => void): void;
	defineEx(name: string, prefix: string, fn: (cm: CmAdapter, params: ExParams) => void): void;
	unmap(keys: string, mode: string): void;
	noremap(...args: string[]): void;
	defineMotion(name: string, fn: (cm: CmAdapter, head: Pos, args: { repeat: number }) => Pos): void;
	defineAction(name: string, fn: (cm: CmAdapter, args: { repeat: number }) => void): void;
	mapCommand(keys: string, type: string, name: string, args?: unknown, extra?: Record<string, unknown>): void;
	getRegisterController?(): { getRegister(name: string): VimRegister | undefined };
}

export function vimApi(): VimApi | null {
	return (window as unknown as { CodeMirrorAdapter?: { Vim?: VimApi } }).CodeMirrorAdapter?.Vim ?? null;
}

export function isVimEnabled(app: App): boolean {
	return vaultConfig(app).getConfig("vimMode") === true;
}
