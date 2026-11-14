# Vim Layer

Vim keys beyond the editor. Obsidian's Vim mode only works while you edit a note; Vim Layer adds the rest:

- **Leader menu**: press `Space` and pick a command from a menu of keys (`Space f` find a file, `Space /` search…), like which-key in Neovim.
- **Reading view keys**: `j`/`k` to scroll, `f` to put letter labels on links and click them from the keyboard, `J`/`K` to switch tabs, `i` to start editing and `Esc` to go back to reading.
- **Jumps**: in the editor, `s` + two characters puts labels on the matches and `S` puts a label on every word; type a label to move the cursor there, like flash.nvim and hop.
- **File marks**: pin a few files and jump to them with `Space 1`…`Space 4`, like Harpoon in Neovim.
- **Layout switching**: Latin layout in Normal mode, your own layout back when you type in Insert mode.
- **.vimrc**: your own Vim mappings for the editor, including mappings that run Obsidian commands.
- **Key hints**: after `g`, `z`, `[` or `]` in the editor, or `g` in Reading view, a bar lists the keys that can follow, your own mappings included.

Everything works in any keyboard layout: keys are matched by their position on a QWERTY keyboard, so `j` also scrolls when a Cyrillic or Greek layout is on. In Vim Normal and Visual mode every key works by its position: Vim Layer learns your layout as you type and sets Vim's `langmap` from it, so letters and punctuation keys (`ж` is `;`, `б` is `,`) do what they do on QWERTY. Punctuation that types another Latin character is sent by position too: on a Russian layout the `/` key (which types `.`) opens search and `Shift+4` is `$`. The character after `f`, `t`, `r` and similar stays as typed, so `fа` finds a Cyrillic «а». Insert mode types as usual. A `langmap` set in your vimrc takes precedence.

Desktop only.

## Quick start

1. Install **Vim Layer** from **Settings → Community plugins → Browse** and enable it.
2. Turn on Vim mode: **Settings → Editor → Vim key bindings** (or **Settings → Vim Layer → Turn on Vim mode**).
3. Make `Space` open the leader menu in the editor. Create a file named `.obsidian.vimrc` in the vault root with:

   ```vim
   unmap <Space>
   exmap leader obcommand vim-layer:leader
   nmap <Space> :leader<CR>

   " Jumps: s + 2 characters, S = every word
   exmap flash obcommand vim-layer:jump-to-chars
   nmap s :flash<CR>
   exmap hop obcommand vim-layer:jump-to-word
   nmap S :hop<CR>
   ```

   Then run **Vim Layer: Reload vimrc** from the command palette, or restart Obsidian. Files starting with a dot are hidden in Obsidian, so create it with any text editor.
4. Open a note in Reading view and press `j`, `f`, `Space`. Reading view keys and `Space` there work without any setup.

Optional next steps:

- **Settings → Vim Layer → Open notes in Reading view** to always start in Reading view (`i` edits, `Esc` returns).
- Your own leader keys: see [Leader menu](#leader-menu).
- File marks: add them to the leader menu, see [File marks](#file-marks-harpoon).
- Layout switching: see [Layout switching](#layout-switching).

## Leader menu

`Space` opens a bar at the bottom of the window. Type the next key to run a command or open a group; after a short pause (**Hint delay**) the bar lists the keys you can press. `Backspace` steps back, `Esc` closes.

In Reading view `Space` is bound by default. In the editor it needs the `.obsidian.vimrc` lines from the [Quick start](#quick-start); without Vim mode, assign a hotkey to **Vim Layer: Open leader menu** in **Settings → Hotkeys** (Obsidian hotkeys cannot use a bare `Space`).

### Built-in keys

| Keys | Command |
|---|---|
| `Space f` | Quick switcher |
| `Space p` | Command palette |
| `Space /` | Search in vault |
| `Space e` | Toggle left sidebar |
| `Space w` / `Space q` | Save / close tab |
| `Space t n` / `t v` / `t s` / `t u` | New tab / split right / split down / reopen closed tab |
| `Space b` | Bookmarks |
| `Space o` | Outline |

### Your own keys

1. Create a YAML file in the vault, for example `Meta/leader.yml`.
2. Set **Settings → Vim Layer → Keymap file** to its path. It replaces the built-in keys and is reloaded whenever you save it.

```yaml
description: Leader
items:
  f: switcher:open Find file              # command ID, then a label
  w:
    command: editor:save-file             # without a label the command's name is shown
  n:
    file: Inbox/Notes                     # open a note
  a: vim-layer:harpoon-add Mark file
  "1": vim-layer:harpoon-1 Mark 1
  s:
    description: Search                   # a group: Space s, then a key below
    items:
      c: command-palette:open Commands
      g: global-search:open Grep
```

- **Command IDs**: run **Vim Layer: Copy command ID**, type the command's name and press `Enter`; the ID (for example `omnisearch:show-modal`) is copied to the clipboard. Commands from other plugins work too.
- **Keys**: one character (`b`, `G`, `/`, `?`), a named key (`space`, `enter`, `tab`, `backspace`, `up`, `f1`…) or modifiers `c` (Ctrl), `a` (Alt), `m` (Cmd/Win), `s` (Shift) before a dash: `c-enter`, `sa-tab`. Capital letters are written as they are: `G`, not `s-g`. Quote keys that YAML treats specially: `"1"`, `"/"`.
- The file may also be a Markdown note: the YAML goes into its first code block.
- The format is the one [Spacekeys](https://github.com/jlumpe/obsidian-spacekeys) uses, so a Spacekeys keymap works as is.
- A wrong command ID is shown in red in the menu. **Vim Layer: Reload leader keymap** lists all problems in the file.

## Reading view

The keys work while a note is in Reading view (or a tab is empty) and no text field has focus.

| Keys | Action |
|---|---|
| `j` / `k` | Scroll down / up |
| `d` / `u` | Half a page down / up |
| `gg` / `G` | Top / bottom |
| `f` | Letter labels on links, buttons and collapsible callouts; type a label to click it |
| `F`, or Shift on the last letter | Same, opening links in a new tab |
| `/` | Search in the note: type, `Enter` to stay on the first match, then `n` / `N` for the next / previous one; `Esc` closes |
| `J` / `K` | Next / previous tab |
| `t` / `x` / `X` | New tab / close tab / reopen closed tab |
| `H` / `L` | Back / forward |
| `b` / `B` | Open a bookmark here / in a new tab |
| `O` | Bookmark, recent file or URL in a new tab |
| `o` / `p` | Quick switcher / command palette |
| `Space` | Leader menu |
| `i` | Edit the note, cursor at the middle of the screen |

In the editor, `Esc` in Vim Normal mode returns to Reading view (from Insert mode, press `Esc` twice).

After the first key of a sequence (`g` of `gg` or `g/`), Vim Layer waits for the next key like Vim does, and after the hint delay a bar lists what can follow, with command names. `Esc` cancels.

### Change the keys

**Settings → Vim Layer → Key bindings** holds every binding, one per line: the keys, then a command ID. Keys are written like in the leader keymap and separated by spaces (`g g`). A later line wins; `-` instead of a command removes a key. ↺ restores the defaults.

```text
y yazi-fm:reveal              # add: y runs a command from another plugin
g / omnisearch:show-modal     # add a two-key sequence
x -                           # remove x
```

Vim Layer's own actions can go anywhere a command ID goes (hotkeys, the leader menu): `vim-layer:scroll-down`, `scroll-up`, `scroll-half-page-down`, `scroll-half-page-up`, `scroll-to-top`, `scroll-to-bottom`, `hints`, `hints-new-tab`, `edit`, `read`, `bookmarks`, `bookmarks-new-tab`, `omnibar`, `search-next`, `search-previous`.

### Other settings

| Setting | Default | What it does |
|---|---|---|
| Vim keys in Reading view | on | Turns all of the above on or off |
| Open notes in Reading view | off | Notes open in Reading view; Obsidian's default view mode is restored when turned off |
| Esc returns to Reading view | on | `Esc` in Vim Normal mode leaves the editor |
| Turn on Vim mode | off | Turns on Obsidian's Vim key bindings while Vim Layer runs |
| Mode indicator | on | `READING` / `NORMAL` / `INSERT` / `VISUAL` in the status bar |
| Scroll step | 70 | Pixels per `j`/`k` |
| Hint characters | `sadfjklewcmpgh` | Letters for labels, most convenient first |
| Hint targets | links, buttons, tabs, file tree… | CSS selectors of elements that get a label |

## Jumps

Two commands for the editor, usually mapped to `s` and `S` in `.obsidian.vimrc` (see [Quick start](#quick-start)):

| Command | ID | What happens |
|---|---|---|
| Jump to characters | `vim-layer:jump-to-chars` | Type 2 characters of the target (the text dims while you type); every match on screen gets a label. A single match is jumped to at once. |
| Jump to word | `vim-layer:jump-to-word` | Every word on screen gets a label right away. |

Type the label to move the cursor; hold Shift on its last letter to select from the cursor instead. Labels closest to the cursor are the shortest. `Esc`, a click or scrolling cancels.

**Any layout, no switching.** Labels are shown in the letters of the current layout (Cyrillic labels on a Russian layout) and can be typed in any layout. In Jump to characters each key matches what it types in both layouts: on a Latin layout, the key with `d`/`в` finds both «d» and «в». The second layout is learned the first time you type in it, for example in Insert mode.

Settings (**Settings → Vim Layer → Jumps**): characters to type (1–3, default 2), case sensitivity, and the word pattern for Jump to word (default: 3 or more letters, digits or `_` in any language).

## File marks (Harpoon)

A short numbered list of files (up to 9). Jumping back to a file puts you where you left it.

| Command | ID |
|---|---|
| Harpoon: add current file | `vim-layer:harpoon-add` |
| Harpoon: open list | `vim-layer:harpoon-list` |
| Harpoon: go to file 1…9 | `vim-layer:harpoon-1` … `vim-layer:harpoon-9` |
| Harpoon: remove current file | `vim-layer:harpoon-remove` |

The commands have no keys of their own. Add them to the leader keymap (`a`, `H`, `"1"`…`"4"`, as in the example above) or to **Settings → Hotkeys**.

In the list: `j`/`k` move, `Enter` or `l` opens, `1`–`9` open by number, `J`/`K` reorder, `dd` removes, `p` puts the removed file back, `Esc` closes. Renamed files stay in the list; deleted files drop out. A list from the Harpoon plugin (`harpoon-cache.json`) is imported once.

## Layout switching

When you leave Insert mode, Vim Layer remembers your keyboard layout and switches to a Latin one, so Normal mode commands work; when you enter Insert mode, your layout comes back. Off by default; it needs a small command-line tool.

**macOS**

1. Install [macism](https://github.com/laishulu/macism): `brew install laishulu/homebrew/macism`.
2. **Settings → Vim Layer → Switch input method**: on. These settings run shell commands, so they are kept on each device and are not synced with the vault. The default commands already use macism:

   | Field | Value |
   |---|---|
   | Extra PATH | `/opt/homebrew/bin` (Apple silicon) or `/usr/local/bin` (Intel) |
   | On leaving Insert | `macism com.apple.keylayout.ABC` |
   | On entering Insert | `macism {{im}}` |
   | Get current | `macism` |

   If your Latin layout is not ABC, switch to it and run `macism` in Terminal to get its ID (for example `com.apple.keylayout.US`).

**Windows**: [im-select](https://github.com/daipeihust/im-select): `im-select.exe 1033` on leaving, `im-select.exe {{im}}` on entering, `im-select.exe` to get the current one; put its folder in **Extra PATH**.

**Linux (fcitx5)**: the defaults use `fcitx5-remote`.

## .vimrc

Vim Layer runs `.obsidian.vimrc` from the vault root (**Settings → Vim Layer → Vimrc file**) when the first editor opens. After editing it, run **Vim Layer: Reload vimrc**.

| Line | Meaning |
|---|---|
| `nmap U <C-r>` | `map`, `nmap`, `imap`, `vmap`, `noremap`, `unmap`, `nunmap`, `iunmap`, `vunmap` as in Vim |
| `exmap back obcommand app:go-back` | Define an Ex command; `obcommand` runs an Obsidian command by ID |
| `nmap <C-o> :back<CR>` | Map keys to that Ex command |
| `let mapleader = ","` | Leader key for `<leader>` in mappings |
| `set clipboard=unnamed` | Yank to and paste from the system clipboard |
| `set tabstop=4` | Tab width |
| `source other.vimrc` | Run another file |

Built in: `]]`/`[[` next/previous heading (any level), `gl`/`gL` next/previous link, `gf` or `gx` follow the link under the cursor (notes and web links).

### Key hints

After `g`, `z`, `[` or `]` in Normal or Visual mode, a bar at the bottom lists the keys that can follow: Vim's own commands, the motions above and your vimrc mappings, described by the Obsidian command they run (`g/` → *Omnisearch: Vault search*). It appears after the leader menu's **Hint delay**, so it stays out of the way when you type fast. Turn it off with **Settings → Vim Layer → Key hints** (this also turns off the Reading view hints).

## Coming from other plugins

Vim Layer covers Spacekeys, Vimium+, Harpoon, Vim IM Control, Vimrc Support and the editor jumps of Jump to link, and reads the same files: the Spacekeys keymap, the Harpoon list and `.obsidian.vimrc`. For Jump to link, map `s`/`S` to `vim-layer:jump-to-chars`/`vim-layer:jump-to-word` instead of `mrj-jump-to-link:activate-lightspeed-jump`/`activate-jump-to-anywhere`. Turn the old plugin off when you switch. Until you do, the matching part of Vim Layer stays off (Vimium+, Vim IM Control, Vimrc Support), so keys are not handled twice. In a Spacekeys keymap, replace `spacekeys:leader` with `vim-layer:leader` and `harpoon:…` commands with the `vim-layer:harpoon-…` ones.

Not carried over: the Web viewer keys and shell commands of Vimium+; `jscommand`, `jsfile`, `sendkeys` and `surround` of Vimrc Support.

## Build from source

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
