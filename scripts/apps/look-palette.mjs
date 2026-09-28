/**
 * A small popup menu opened by right-clicking a cast member on the canvas (GM edit mode):
 * quick look switching plus the most common cast actions.
 */
import { MODULE_ID } from "../constants.mjs";
import LibraryStore from "../data/library-store.mjs";
import { resolveLook, lookImage } from "../utils/resolve.mjs";
import { setCurrentLook, toggleCastEntry, restackCastEntry } from "../data/scene-ops.mjs";
import { escape, t, isVideoPath } from "./helpers.mjs";

let current = null;

/** Close the open palette, if any. */
export function closeLookPalette() {
  current?.remove();
  current = null;
}

/**
 * Open the palette for a cast entry at a screen position.
 * @param {object} options
 * @param {string} options.sceneId
 * @param {string} options.entryId
 * @param {{x: number, y: number}} options.position   Client coordinates
 */
export function openLookPalette({ sceneId, entryId, position }) {
  closeLookPalette();
  const scene = LibraryStore.getScene(sceneId);
  const entry = scene?.cast.find(e => e.id === entryId);
  const character = entry ? LibraryStore.getCharacter(entry.characterId) : null;
  if ( !character ) return;
  const active = resolveLook(character, entry.lookId);

  const menu = document.createElement("div");
  menu.className = "immersive-scenes look-palette themed theme-dark";
  const looks = character.looks.map(look => {
    const src = lookImage(look, "token");
    const media = isVideoPath(src)
      ? `<video src="${escape(src)}" muted loop autoplay playsinline></video>`
      : (src ? `<img src="${escape(src)}" alt="">` : `<i class="fa-solid fa-user"></i>`);
    return `<button type="button" class="look ${look.id === active?.id ? "active" : ""}" data-look-id="${look.id}"
      data-tooltip="${escape(look.name)}" aria-label="${escape(look.name)}">${media}</button>`;
  }).join("");
  const action = (name, icon, label) => `<button type="button" class="palette-action" data-palette="${name}">
    <i class="${icon}" inert></i> ${escape(label)}</button>`;
  menu.innerHTML = `
    <header>${escape(entry.label || character.name)}${entry.lookId ? ` <i class="fa-solid fa-thumbtack" data-tooltip="${escape(t("Palette.Pinned"))}"></i>` : ""}</header>
    ${looks ? `<div class="looks">${looks}</div>` : ""}
    <div class="actions">
      ${action("mirror", "fa-solid fa-arrows-left-right", t("Fields.Mirror"))}
      ${action("forward", "fa-solid fa-arrow-up", t("Palette.Forward"))}
      ${action("back", "fa-solid fa-arrow-down", t("Palette.Back"))}
      ${action("hide", "fa-solid fa-eye-slash", t("Fields.Hidden"))}
      ${action("remove", "fa-solid fa-user-minus", t("Actions.Remove"))}
      ${action("edit", "fa-solid fa-pen", t("Actions.Edit"))}
    </div>`;
  document.body.append(menu);
  const { innerWidth, innerHeight } = window;
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(position.x, innerWidth - rect.width - 8)}px`;
  menu.style.top = `${Math.min(position.y, innerHeight - rect.height - 8)}px`;
  current = menu;

  menu.addEventListener("click", async event => {
    const button = event.target.closest("button");
    if ( !button ) return;
    if ( button.dataset.lookId ) {
      // Pinned entries keep their pinned look; otherwise change what the character wears.
      if ( entry.lookId ) await LibraryStore.updateCastEntry(sceneId, entryId, { lookId: button.dataset.lookId });
      else await setCurrentLook(character.id, button.dataset.lookId);
      Hooks.callAll(`${MODULE_ID}.lookChanged`, character.id, button.dataset.lookId, game.user);
    }
    else switch ( button.dataset.palette ) {
      case "mirror": await toggleCastEntry(sceneId, entryId, "mirror"); break;
      case "hide": await toggleCastEntry(sceneId, entryId, "hidden"); break;
      case "forward": await restackCastEntry(sceneId, entryId, 1); break;
      case "back": await restackCastEntry(sceneId, entryId, -1); break;
      case "remove": await LibraryStore.removeCastEntry(sceneId, entryId); break;
      case "edit": game.modules.get(MODULE_ID).api.editCharacter(character.id); break;
    }
    closeLookPalette();
  });
  const dismiss = event => {
    if ( current && !current.contains(event.target) ) {
      closeLookPalette();
      document.removeEventListener("pointerdown", dismiss, true);
    }
  };
  setTimeout(() => document.addEventListener("pointerdown", dismiss, true), 0);
}
