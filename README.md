# Vim Layer

One Vim keyboard layer for all of Obsidian, in any keyboard layout:

- **Leader menu**: a which-key style bar for key sequences such as `Space f`.
- **Reading view keys**: `j`/`k` scrolling, `f` link hints, tabs, history and your own bindings.
- **Harpoon**: a short numbered list of files to jump between.
- **Input method switching**: Latin layout outside Insert mode, your layout back in Insert.
- **vimrc**: `map`, `noremap`, `exmap`, `obcommand` and more for Obsidian's Vim mode.

Keys are matched by their QWERTY position when the layout is not Latin, so the same keys work with Cyrillic or Greek layouts. Each part stays off while the plugin it replaces is enabled: Vimium+, Vim IM Control or Vimrc Support.

> Early development, desktop only.

## Leader menu

Run **Vim Layer: Open leader menu** (`vim-layer:leader`) to open a bar at the bottom of the window. Type a key sequence to run a command; after a short delay the bar lists the available keys. `Backspace` steps back, `Esc` closes.

Keys are matched by their QWERTY position when the keyboard layout is not Latin, so `Space b` also works with a Cyrillic layout. See **Settings → Vim Layer → Key layout**.

### Space as leader

Obsidian hotkeys cannot use a bare `Space`. With Vim mode and [Vimrc Support](https://github.com/esm7/obsidian-vimrc-support), add to `.obsidian.vimrc`:

```vim
unmap <Space>
exmap leader obcommand vim-layer:leader
nmap <Space> :leader<CR>
```

### Keymap file

Set **Settings → Vim Layer → Keymap file** to a YAML file in the vault (or a Markdown file whose first code block holds the YAML). The file is reloaded when it changes. The format is the one used by [Spacekeys](https://github.com/jlumpe/obsidian-spacekeys), so existing Spacekeys keymaps work as is:

```yaml
description: Leader
items:
  f: switcher:open Find file          # "command-id Description"
  w:
    command: editor:save-file         # description defaults to the command name
  n:
    file: Inbox/Notes                 # open a file
  t:
    description: Tabs                 # a group: press t, then n
    items:
      n: workspace:new-tab New tab
```

Key codes: a single character (`b`, `G`, `/`, `?`), a named key (`space`, `enter`, `tab`, `backspace`, `up`, `f1`…) and modifiers `c`, `a`, `m`, `s` before a dash (`c-enter`, `sa-tab`, `c-?`). Shifted characters are written as the character itself: `G`, not `s-g`.

With no file set, a small built-in keymap of core commands is used.

## Reading view

While a note is in Reading view (or a tab is empty) and no text field has focus, keys run commands from **Settings → Vim Layer → Key bindings**: one binding per line, a key sequence then a command ID.

```text
j vim-layer:scroll-down
g g vim-layer:scroll-to-top
f vim-layer:hints
i vim-layer:edit
space vim-layer:leader
```

Defaults: `j k d u gg G` scroll, `f`/`F` link hints (Shift on the last letter opens a new tab), `/` search, `J`/`K` tabs, `t x X` new/close/reopen tab, `H`/`L` history, `b`/`B`/`O` bookmarks and recent files, `o` quick switcher, `p` command palette, `i` edit. In the editor, `Esc` in Vim Normal mode returns to Reading view. Optional: open notes in Reading view, turn on Vim mode, a mode indicator in the status bar.

## Harpoon

Commands: **Harpoon: add current file**, **open list**, **go to file 1–9**, **remove current file**. The cursor position is remembered per file. In the list: `j`/`k`, `Enter`, `1`–`9`, `J`/`K` to reorder, `dd` to remove, `p` to put back. A list from the Harpoon plugin (`harpoon-cache.json`) is imported once.

## Input method

On leaving Insert mode the current input method is saved and a Latin one is selected; on entering Insert mode the saved one comes back. Commands are configurable: `macism` or `im-select` on macOS, `im-select.exe` on Windows, `fcitx5-remote` on Linux.

## vimrc

`.obsidian.vimrc` (configurable) runs when the first editor opens: `map`/`nmap`/`imap`/`vmap`, `noremap`, `unmap` variants, `exmap`, `obcommand`, `let mapleader`, `set clipboard=unnamed`, `set tabstop`, `source`. Built-in motions: `]]`/`[[` headings, `gl`/`gL` links, `gf` follow link. **Reload vimrc** clears user mappings and runs the file again.

## Install

```sh
npm install
OBSIDIAN_VAULT=/path/to/vault npm run install-vault
```

## Credits

Vim Layer follows the behavior and formats of these MIT-licensed plugins and adapts parts of their code (see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)):

- [Spacekeys](https://github.com/jlumpe/obsidian-spacekeys) by Jared Lumpe: leader keymap format and menu.
- [Vimium+](https://github.com/vimburton/obsidian-vimium-plus) by Stian Lyng: Reading view keys, link hints and their label algorithm.
- [Harpoon](https://github.com/rodrez/obsidian-harpoon) by rodrez.
- [Vim IM Control](https://github.com/hideakitai/obsidian-vim-im-control) by hideakitai.
- [Vimrc Support](https://github.com/esm7/obsidian-vimrc-support) by esm7: vimrc commands and motions.

## License

MIT
