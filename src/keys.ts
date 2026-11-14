// Key codes in Spacekeys notation: "b", "G", "/", "space", "c-enter", "sa-tab", "c-?".
// Printable characters fold Shift into the character ("G", "?"); named keys keep the "s" modifier.
// Canonical form: modifiers in the order c, a, m, s, then "-", then the base key.

const NAMED: Record<string, string> = {
	space: "space",
	spc: "space",
	enter: "enter",
	return: "enter",
	ret: "enter",
	esc: "escape",
	escape: "escape",
	tab: "tab",
	backspace: "backspace",
	bs: "backspace",
	delete: "delete",
	del: "delete",
	insert: "insert",
	up: "up",
	down: "down",
	left: "left",
	right: "right",
	home: "home",
	end: "end",
	pageup: "pageup",
	pagedown: "pagedown",
};
for (let i = 1; i <= 12; i++) NAMED[`f${i}`] = `f${i}`;

const EVENT_NAMES: Record<string, string> = {
	" ": "space",
	Enter: "enter",
	Escape: "escape",
	Tab: "tab",
	Backspace: "backspace",
	Delete: "delete",
	Insert: "insert",
	ArrowUp: "up",
	ArrowDown: "down",
	ArrowLeft: "left",
	ArrowRight: "right",
	Home: "home",
	End: "end",
	PageUp: "pageup",
	PageDown: "pagedown",
};
for (let i = 1; i <= 12; i++) EVENT_NAMES[`F${i}`] = `f${i}`;

// US QWERTY characters for physical key codes: [unshifted, shifted].
const CODE_CHARS: Record<string, [string, string]> = {
	Backquote: ["`", "~"],
	Minus: ["-", "_"],
	Equal: ["=", "+"],
	BracketLeft: ["[", "{"],
	BracketRight: ["]", "}"],
	Backslash: ["\\", "|"],
	IntlBackslash: ["`", "~"],
	Semicolon: [";", ":"],
	Quote: ["'", '"'],
	Comma: [",", "<"],
	Period: [".", ">"],
	Slash: ["/", "?"],
	Digit1: ["1", "!"],
	Digit2: ["2", "@"],
	Digit3: ["3", "#"],
	Digit4: ["4", "$"],
	Digit5: ["5", "%"],
	Digit6: ["6", "^"],
	Digit7: ["7", "&"],
	Digit8: ["8", "*"],
	Digit9: ["9", "("],
	Digit0: ["0", ")"],
};

const MOD_ORDER = ["c", "a", "m", "s"];

const isChar = (s: string) => [...s].length === 1;

function build(mods: Set<string>, base: string): string {
	if (isChar(base) && mods.has("s")) {
		mods.delete("s");
		base = base.toUpperCase();
	}
	const prefix = MOD_ORDER.filter((m) => mods.has(m)).join("");
	return prefix ? `${prefix}-${base}` : base;
}

/** Normalize a key code from a keymap file. Returns null if it cannot be parsed. */
export function parseKey(raw: string): string | null {
	if (isChar(raw)) return raw;
	const mods = new Set<string>();
	let base = raw;
	const m = /^([camsCAMS]+)-(.+)$/.exec(raw);
	if (m) {
		for (const c of m[1].toLowerCase()) mods.add(c);
		base = m[2];
	}
	if (!isChar(base)) {
		const named = NAMED[base.toLowerCase()];
		if (!named) return null;
		base = named;
	}
	return build(mods, base);
}

/**
 * How printable keys are read:
 * - "typed": the character the layout produces;
 * - "physical": the US-QWERTY key at that position (layout independent);
 * - "auto": typed for Latin characters, physical for anything else (non-Latin layouts).
 */
export type KeyMode = "auto" | "physical" | "typed";

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Dead", "Process", "Unidentified"]);

/** Convert a keyboard event to a canonical key code. Returns null for bare modifiers. */
export function eventToKey(evt: KeyboardEvent, mode: KeyMode): string | null {
	if (MODIFIER_KEYS.has(evt.key)) return null;
	const mods = new Set<string>();
	if (evt.ctrlKey) mods.add("c");
	if (evt.altKey) mods.add("a");
	if (evt.metaKey) mods.add("m");

	const named = EVENT_NAMES[evt.key];
	if (named) {
		if (evt.shiftKey) mods.add("s");
		return build(mods, named);
	}

	let ch: string | null = null;
	const code = evt.code || "";
	const nonLatin = isChar(evt.key) && evt.key.charCodeAt(0) > 0x7e;
	// Alt on macOS produces special characters, so it always uses the key position.
	if (mode === "physical" || (mode === "auto" && nonLatin) || evt.altKey) {
		if (/^Key[A-Z]$/.test(code)) {
			const c = code.slice(3);
			ch = evt.shiftKey ? c : c.toLowerCase();
		} else if (CODE_CHARS[code]) {
			ch = CODE_CHARS[code][evt.shiftKey ? 1 : 0];
		}
	}
	if (ch === null) {
		if (!isChar(evt.key)) return null;
		ch = evt.key;
	}
	// Shift is already reflected in the character.
	return build(mods, ch);
}

/** Sort order: letters by lower case (a before A), then digits, then everything else. */
export function compareKeys(a: string, b: string): number {
	const rank = (k: string) => (/^[a-z]$/i.test(k) ? 0 : /^[0-9]$/.test(k) ? 1 : isChar(k) ? 2 : 3);
	const ra = rank(a);
	const rb = rank(b);
	if (ra !== rb) return ra - rb;
	const la = a.toLowerCase();
	const lb = b.toLowerCase();
	if (la !== lb) return la < lb ? -1 : 1;
	return a < b ? 1 : a > b ? -1 : 0;
}
