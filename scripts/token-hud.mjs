/**
 * Token HUD button: switch the look of the immersive character linked to a token's actor.
 */
import LibraryStore from "./data/library-store.mjs";
import { canPerform } from "./data/permissions.mjs";
import { requestCharacterAction } from "./queries.mjs";
import { resolveLook, lookImage } from "./utils/resolve.mjs";
import { escape, isVideoPath } from "./apps/helpers.mjs";

/**
 * Find the library character linked to a token's (base) actor.
 * @param {TokenDocument} tokenDocument
 * @returns {object|null}
 */
export function characterForToken(tokenDocument) {
  const actorUuid = tokenDocument.actorId ? `Actor.${tokenDocument.actorId}` : null;
  if ( !actorUuid ) return null;
  return Object.values(LibraryStore.characters).find(c => c.actorUuid === actorUuid) ?? null;
}

export function registerTokenHud() {
  Hooks.on("renderTokenHUD", (hud, element) => {
    const tokenDocument = hud.document ?? hud.object?.document;
    const character = tokenDocument ? characterForToken(tokenDocument) : null;
    if ( !character || character.looks.length < 2 || !canPerform(game.user, character, "setLook") ) return;
    const column = element.querySelector(".col.right");
    if ( !column ) return;

    const current = resolveLook(character);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-icon immersive-looks-toggle";
    button.dataset.tooltip = "IMMERSIVE_SCENES.Fields.Look";
    button.innerHTML = `<i class="fa-solid fa-shirt" inert></i>`;

    const palette = document.createElement("div");
    palette.className = "immersive-looks-palette";
    palette.innerHTML = character.looks.map(look => {
      const src = lookImage(look, "token");
      const media = isVideoPath(src) ? `<video src="${escape(src)}" muted loop autoplay playsinline></video>`
        : (src ? `<img src="${escape(src)}" alt="">` : `<i class="fa-solid fa-user"></i>`);
      return `<button type="button" class="${look.id === current?.id ? "active" : ""}" data-look-id="${look.id}"
        data-tooltip="${escape(look.name)}">${media}</button>`;
    }).join("");

    button.addEventListener("click", event => {
      event.preventDefault();
      palette.classList.toggle("active");
      button.classList.toggle("active");
    });
    palette.addEventListener("click", async event => {
      const choice = event.target.closest("button[data-look-id]");
      if ( !choice ) return;
      const ok = await requestCharacterAction(character.id, "setLook", { lookId: choice.dataset.lookId });
      if ( ok ) {
        palette.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === choice));
      }
    });
    const wrapper = document.createElement("div");
    wrapper.className = "immersive-looks";
    wrapper.append(button, palette);
    column.append(wrapper);
  });
}
