/**
 * Leader-key Command Palette
 *
 * Fuzzy command palette over every slash command Pi has registered — prompts,
 * skills, and extension commands alike. Discovers dynamically via
 * `pi.getCommands()`, so it never drifts when prompts or skills are added or
 * removed. On select, the command is inserted into the editor and Pi's native
 * dispatch handles execution — zero re-implementation of any command.
 *
 * Trigger:  Ctrl+Shift+K   or   /palette
 *
 * Harmony contract:
 * - Reads the command surface from Pi itself (single source of truth).
 * - Owns NO axis: registers no tools, hooks no events, writes no storage.
 * - Reserves only Ctrl+Shift+K (chosen to avoid the built-in
 *   app.model.cycleBackward = shift+ctrl+p, which `matchesKey` normalizes to
 *   the same input as ctrl+shift+p). pi-rewind (Esc+Esc) and pi-btw (/btw)
 *   untouched.
 *
 * This is the "primitives not features" pattern: a navigation/dispatch
 * primitive that amplifies the existing self-extending surface rather than
 * adding content of its own.
 */

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	Container,
	Key,
	Text,
	fuzzyFilter,
	matchesKey,
	type SelectItem,
} from "@earendil-works/pi-tui";

const SHORTCUT = Key.ctrlShift("k");
const MAX_VISIBLE = 12;

type Source = "prompt" | "skill" | "extension";

interface PaletteItem extends SelectItem {
	source: Source;
}

const SOURCE_TAG: Record<Source, string> = {
	prompt: "prompt",
	skill: "skill",
	extension: "ext",
};

function buildItems(pi: ExtensionAPI): PaletteItem[] {
	const commands = pi.getCommands();
	const items: PaletteItem[] = [];
	for (const cmd of commands) {
		// Skip our own /palette to avoid self-reference noise.
		if (cmd.name === "palette") continue;
		const source = (cmd.source ?? "extension") as Source;
		items.push({
			value: cmd.name,
			label: `/${cmd.name}`,
			description: cmd.description,
			source,
		});
	}
	// Stable, readable ordering: prompts first, then skills, then extensions;
	// alphabetical within each group.
	const order: Record<Source, number> = { prompt: 0, skill: 1, extension: 2 };
	items.sort((a, b) => {
		const so = order[a.source] - order[b.source];
		if (so !== 0) return so;
		return a.value.localeCompare(b.value);
	});
	return items;
}

function openPalette(pi: ExtensionAPI, ctx: ExtensionContext): void {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("palette requires interactive mode", "error");
		return;
	}

	const allItems = buildItems(pi);
	if (allItems.length === 0) {
		ctx.ui.notify("No commands available", "warning");
		return;
	}

	let filter = "";
	let filtered: PaletteItem[] = allItems;
	let selected = 0;

	function refilter(): void {
		filtered =
			filter.length === 0
				? allItems
				: fuzzyFilter(allItems, filter, (i) => i.value);
		selected = 0;
	}

	ctx.ui
		.custom<string | null>((tui, theme, _kb, done) => {
			const container = new Container();

			const header = new Text(
				theme.fg("accent", theme.bold("Command Palette")),
			);
			const filterLine = new Text("");
			const listContainer = new Container();
			const footer = new Text(
				theme.fg(
					"dim",
					"type to fuzzy-filter • ↑↓ navigate • enter select • esc cancel",
				),
			);

			container.addChild(header);
			container.addChild(filterLine);
			container.addChild(listContainer);
			container.addChild(footer);

			function renderList(): void {
				listContainer.clear();

				if (filtered.length === 0) {
					listContainer.addChild(
						new Text(theme.fg("warning", "  No matching commands")),
					);
					return;
				}

				// Scroll window centered on selection.
				const half = Math.floor(MAX_VISIBLE / 2);
				const start = Math.max(
					0,
					Math.min(selected - half, filtered.length - MAX_VISIBLE),
				);
				const end = Math.min(start + MAX_VISIBLE, filtered.length);

				for (let i = start; i < end; i++) {
					const item = filtered[i];
					if (!item) continue;
					const isSel = i === selected;
					const tag = theme.fg("dim", `[${SOURCE_TAG[item.source]}]`);
					const name = isSel
						? theme.fg("accent", theme.bold(`→ ${item.label}`))
						: `  ${item.label}`;
					const desc = item.description
						? theme.fg("muted", `  ${item.description.split("\n")[0]}`)
						: "";
					listContainer.addChild(new Text(`${tag} ${name}${desc}`));
				}

				if (start > 0 || end < filtered.length) {
					listContainer.addChild(
						new Text(theme.fg("dim", `  (${selected + 1}/${filtered.length})`)),
					);
				}
			}

			function refresh(): void {
				filterLine.setText(
					theme.fg("muted", "filter: ") + theme.fg("accent", filter || "…"),
				);
				renderList();
				container.invalidate();
				tui.requestRender();
			}

			refresh();

			return {
				render(width: number) {
					return container.render(width);
				},
				invalidate() {
					container.invalidate();
				},
				handleInput(data: string) {
					if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
						done(null);
						return;
					}
					if (matchesKey(data, "enter")) {
						const item = filtered[selected];
						done(item ? item.value : null);
						return;
					}
					if (matchesKey(data, "up")) {
						if (filtered.length > 0) {
							selected = selected === 0 ? filtered.length - 1 : selected - 1;
							refresh();
						}
						return;
					}
					if (matchesKey(data, "down")) {
						if (filtered.length > 0) {
							selected = selected === filtered.length - 1 ? 0 : selected + 1;
							refresh();
						}
						return;
					}
					if (matchesKey(data, "backspace")) {
						if (filter.length > 0) {
							filter = filter.slice(0, -1);
							refilter();
							refresh();
						}
						return;
					}
					// Printable character: append to filter.
					if (data.length === 1) {
						const code = data.charCodeAt(0);
						if (code >= 0x20 && code !== 0x7f && data !== " ") {
							filter += data;
							refilter();
							refresh();
						} else if (data === " ") {
							filter += " ";
							refilter();
							refresh();
						}
					}
					// Ignore other keys (modifier combos, pageup, etc.).
				},
			};
		})
		.then((chosen) => {
			if (chosen === null) return;
			// Insert the command into the editor; Pi's native dispatch handles it
			// when the user presses Enter. This reuses the existing command surface
			// rather than re-implementing any command's behavior.
			ctx.ui.setEditorText(`/${chosen} `);
		});
}

export default function paletteExtension(pi: ExtensionAPI): void {
	pi.registerCommand("palette", {
		description:
			"Open the command palette (fuzzy search over all slash commands)",
		handler: async (_args, ctx) => openPalette(pi, ctx),
	});

	pi.registerShortcut(SHORTCUT, {
		description: "Open command palette",
		handler: async (ctx) => openPalette(pi, ctx),
	});

	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setStatus("palette", ctx.ui.theme.fg("dim", "⌘P palette"));
	});
}
