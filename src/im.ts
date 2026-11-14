// Input method switching: Latin layout outside Insert mode, the previous layout back in Insert.
// Replaces Vim IM Control. Runs shell commands such as macism, im-select or fcitx5-remote.
import { Platform } from "obsidian";
import type VimLayerPlugin from "./main";
import { isPluginEnabled } from "./obsidian-internal";
import type { VimMode } from "./vim-mode";

type Exec = (cmd: string, opts: { env: NodeJS.ProcessEnv; timeout: number }, cb: (err: Error | null, stdout: string) => void) => void;

export class InputMethodSwitcher {
	private saved = "";
	private exec: Exec | null = null;

	constructor(private readonly plugin: VimLayerPlugin) {}

	get active(): boolean {
		return Platform.isDesktopApp && this.plugin.settings.imEnabled && !isPluginEnabled(this.plugin.app, "vim-im-control");
	}

	load(): void {
		this.plugin.vimMode.onModeChange((mode, prev) => this.onModeChange(mode, prev));
	}

	private run(cmd: string): Promise<string> {
		if (!Platform.isDesktopApp) return Promise.resolve("");
		if (!this.exec) {
			// Node is only available on desktop, so child_process is required lazily.
			this.exec = (require("child_process") as { exec: Exec }).exec;
		}
		const extra = this.plugin.settings.imPath.trim();
		const sep = Platform.isWin ? ";" : ":";
		const env = { ...process.env, PATH: extra ? `${process.env.PATH ?? ""}${sep}${extra}` : process.env.PATH };
		return new Promise((resolve) => {
			this.exec?.(cmd, { env, timeout: 3000 }, (err, stdout) => {
				if (err) console.warn(`Vim Layer: input method command failed: ${cmd}`, err);
				resolve(err ? "" : String(stdout).trim());
			});
		});
	}

	private onModeChange(mode: VimMode, prev: VimMode): void {
		if (!this.active) return;
		const s = this.plugin.settings;
		if (mode === "insert") {
			if (s.imEnterCommand && s.imGetCommand && this.saved) void this.run(s.imEnterCommand.replace(/\{\{im\}\}/g, this.saved));
		} else if (prev === "insert" && s.imLeaveCommand) {
			void (async () => {
				if (s.imEnterCommand && s.imGetCommand) this.saved = await this.run(s.imGetCommand);
				await this.run(s.imLeaveCommand);
			})();
		}
	}
}
