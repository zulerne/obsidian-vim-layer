// Leader keymap: a tree of groups, commands and files, read from YAML in the Spacekeys format.
import { parseYaml } from "obsidian";
import { parseKey } from "../keys";

export interface CommandItem {
	type: "command";
	command: string;
	description?: string;
}

export interface FileItem {
	type: "file";
	file: string;
	description?: string;
}

export interface GroupItem {
	type: "group";
	description?: string;
	/** Canonical key code → item. */
	items: Map<string, KeymapItem>;
}

export type KeymapItem = CommandItem | FileItem | GroupItem;

export interface ParseResult {
	keymap: GroupItem;
	errors: string[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function optString(v: unknown): string | undefined {
	return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function parseItem(value: unknown, path: string, errors: string[]): KeymapItem | null {
	// Short form: "command-id Optional description".
	if (typeof value === "string") {
		const m = /^\s*(\S+)(?:\s+(.*))?$/.exec(value);
		if (!m) {
			errors.push(`${path}: empty command`);
			return null;
		}
		return { type: "command", command: m[1], description: optString(m[2]) };
	}
	if (!isObject(value)) {
		errors.push(`${path}: expected a command string, a command, a file or a group`);
		return null;
	}
	const description = optString(value.description);
	if ("items" in value) return parseGroup(value, path, errors);
	if (typeof value.command === "string") return { type: "command", command: value.command.trim(), description };
	if (typeof value.file === "string") return { type: "file", file: value.file.trim(), description };
	errors.push(`${path}: needs "command", "file" or "items"`);
	return null;
}

function parseGroup(value: Record<string, unknown>, path: string, errors: string[]): GroupItem {
	const group: GroupItem = { type: "group", description: optString(value.description), items: new Map() };
	const items = value.items ?? {};
	if (!isObject(items)) {
		errors.push(`${path || "root"}: "items" must be a mapping`);
		return group;
	}
	for (const [rawKey, child] of Object.entries(items)) {
		const childPath = path ? `${path} ${rawKey}` : rawKey;
		// null removes a key (kept for compatibility with Spacekeys files).
		if (child === null || child === undefined) continue;
		const key = parseKey(rawKey);
		if (!key) {
			errors.push(`${childPath}: unknown key "${rawKey}"`);
			continue;
		}
		const item = parseItem(child, childPath, errors);
		if (!item) continue;
		if (group.items.has(key)) errors.push(`${childPath}: duplicate key, the later entry wins`);
		group.items.set(key, item);
	}
	return group;
}

/** Take YAML from a .yml file, or from the first code block of a Markdown file. */
export function extractYaml(text: string, path: string): string {
	if (!path.toLowerCase().endsWith(".md")) return text;
	const m = /^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^\1\s*$/m.exec(text);
	return m ? m[2] : "";
}

export function parseKeymap(yaml: string): ParseResult {
	const errors: string[] = [];
	let data: unknown;
	try {
		data = parseYaml(yaml);
	} catch (e) {
		errors.push(`YAML: ${e instanceof Error ? e.message : String(e)}`);
		return { keymap: { type: "group", items: new Map() }, errors };
	}
	if (data === null || data === undefined) return { keymap: { type: "group", items: new Map() }, errors };
	if (!isObject(data)) {
		errors.push("root: expected a mapping with an \"items\" key");
		return { keymap: { type: "group", items: new Map() }, errors };
	}
	return { keymap: parseGroup(data, "", errors), errors };
}

/** Built-in keymap used when no file is set. Only core Obsidian commands. */
export const DEFAULT_KEYMAP_YAML = `description: Leader
items:
  f: switcher:open Find file
  p: command-palette:open Commands
  "/": global-search:open Search in vault
  e: app:toggle-left-sidebar Toggle left sidebar
  w: editor:save-file Save
  q: workspace:close Close tab
  t:
    description: Tabs
    items:
      n: workspace:new-tab New tab
      v: workspace:split-vertical Split right
      s: workspace:split-horizontal Split down
      u: workspace:undo-close-pane Reopen closed tab
  b: bookmarks:open Bookmarks
  o: outline:open Outline
`;
