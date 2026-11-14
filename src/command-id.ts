// Pick a command by name and copy its ID, for keymaps and .vimrc.
import { App, FuzzySuggestModal, Notice } from "obsidian";
import { appCommands } from "./obsidian-internal";

interface CommandInfo {
	id: string;
	name: string;
}

export class CommandIdModal extends FuzzySuggestModal<CommandInfo> {
	constructor(app: App) {
		super(app);
		this.setPlaceholder("Command to copy the ID of…");
	}

	getItems(): CommandInfo[] {
		return Object.values(appCommands(this.app).commands).map(({ id, name }) => ({ id, name }));
	}

	getItemText(item: CommandInfo): string {
		return `${item.name}  ${item.id}`;
	}

	onChooseItem(item: CommandInfo): void {
		void navigator.clipboard.writeText(item.id).then(
			() => new Notice(`Copied ${item.id}`),
			() => new Notice(`Command ID: ${item.id}`, 10000),
		);
	}
}
