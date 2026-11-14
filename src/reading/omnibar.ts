// Fuzzy pickers over bookmarks, recent files and URLs (Vimium's b / B / O).
import { App, prepareFuzzySearch, SuggestModal } from "obsidian";
import { BookmarkItem, bookmarkItems } from "../obsidian-internal";

export interface OmniItem {
	title: string;
	detail: string;
	open: (newTab: boolean) => void;
}

export function collectBookmarks(app: App): OmniItem[] {
	const out: OmniItem[] = [];
	const walk = (items: BookmarkItem[]) => {
		for (const item of items) {
			if (item.type === "group") walk(item.items ?? []);
			else if (item.type === "file" && item.path) {
				const linktext = item.path + (item.subpath ?? "");
				out.push({
					title: item.title || linktext,
					detail: linktext,
					open: (newTab) => void app.workspace.openLinkText(linktext, "", newTab ? "tab" : false),
				});
			} else if (item.type === "url" && item.url) {
				const url = item.url;
				out.push({ title: item.title || url, detail: url, open: () => window.open(url) });
			}
		}
	};
	walk(bookmarkItems(app));
	return out;
}

export function collectRecentFiles(app: App): OmniItem[] {
	return app.workspace.getLastOpenFiles().map((path) => ({
		title: path.replace(/\.md$/, ""),
		detail: path,
		open: (newTab: boolean) => void app.workspace.openLinkText(path, "", newTab ? "tab" : false),
	}));
}

export class OmniModal extends SuggestModal<OmniItem> {
	constructor(
		app: App,
		private readonly items: OmniItem[],
		private readonly newTab: boolean,
		private readonly allowUrl: boolean,
	) {
		super(app);
		this.setPlaceholder(allowUrl ? "Bookmark, recent file or URL…" : "Open bookmark…");
	}

	getSuggestions(query: string): OmniItem[] {
		const q = query.trim();
		let matches: OmniItem[];
		if (!q) matches = [...this.items];
		else {
			const fuzzy = prepareFuzzySearch(q);
			matches = this.items
				.map((item) => ({ item, match: fuzzy(item.title) ?? fuzzy(item.detail) }))
				.filter((s) => s.match !== null)
				.sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0))
				.map((s) => s.item);
		}
		if (this.allowUrl && /^([a-z][a-z0-9+.-]*:\/\/|www\.)/i.test(q)) {
			const url = q.startsWith("www.") ? `https://${q}` : q;
			matches.unshift({ title: `Open URL: ${url}`, detail: url, open: () => window.open(url) });
		}
		return matches;
	}

	renderSuggestion(item: OmniItem, el: HTMLElement): void {
		el.createDiv({ text: item.title });
		if (item.detail !== item.title) el.createDiv({ cls: "vim-layer-omni-detail", text: item.detail });
	}

	onChooseSuggestion(item: OmniItem): void {
		item.open(this.newTab);
	}
}
