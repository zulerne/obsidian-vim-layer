// Key handlers must exist in every Obsidian window: the main one, pop-out windows already open when the plugin
// loads, and ones opened later.
import type { Plugin } from "obsidian";

/**
 * Call `bind` once per window. Modules call this in a fixed order, and each window gets its handlers in that
 * order, so handlers registered earlier see a key first everywhere.
 */
export function onEveryWindow(plugin: Plugin, bind: (win: Window, doc: Document) => void): void {
	const seen = new WeakSet<Document>();
	const once = (win: Window, doc: Document) => {
		if (seen.has(doc)) return;
		seen.add(doc);
		bind(win, doc);
	};
	once(activeWindow, activeDocument);
	plugin.registerEvent(plugin.app.workspace.on("window-open", (w) => once(w.win, w.doc)));
	// Pop-out windows restored with the workspace exist once the layout is ready.
	plugin.app.workspace.onLayoutReady(() => {
		plugin.app.workspace.iterateAllLeaves((leaf) => {
			const container = leaf.getContainer();
			once(container.win, container.doc);
		});
	});
}
