/**
 * Texture loading for immersive scenes.
 * Images share Foundry's texture cache (pinned so a scene change does not evict them).
 * Videos get their own cloned texture per display object, so each one plays independently;
 * the caller owns such a texture and must release it.
 */
import { MODULE_ID } from "../constants.mjs";

const pinned = new Set();

/** Whether a path points to a video file. */
export function isVideo(src) {
  return foundry.helpers.media.VideoHelper.hasVideoExtension(src);
}

/**
 * Load a texture for display.
 * @param {string} src
 * @param {object} [options]
 * @param {boolean} [options.loop=true]
 * @param {number} [options.volume=0]
 * @returns {Promise<{texture: PIXI.Texture, video: HTMLVideoElement|null, release: () => void}|null>}
 */
export async function acquireTexture(src, { loop = true, volume = 0 } = {}) {
  if ( !src ) return null;
  pin(src);
  let texture;
  try {
    texture = await foundry.canvas.loadTexture(src);
  }
  catch(err) {
    console.warn(`${MODULE_ID} | Could not load ${src}`, err);
    return null;
  }
  if ( !texture?.valid ) return null;

  const source = game.video.getVideoSource(texture);
  if ( !source ) return { texture, video: null, release: () => {} };

  const clone = await game.video.cloneTexture(source);
  const video = game.video.getVideoSource(clone);
  video.muted = volume <= 0;
  Promise.resolve(game.video.play(video, { loop, volume, offset: 0 })).catch(() => {});
  let released = false;
  return {
    texture: clone,
    video,
    release: () => {
      if ( released ) return;
      released = true;
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      catch { /* The element may already be gone */ }
      clone.baseTexture.destroy();
    }
  };
}

/** Warm the texture cache for a list of sources (images only, no playback). */
export async function preloadTextures(sources) {
  const unique = [...new Set(sources.filter(Boolean))];
  unique.forEach(pin);
  await Promise.allSettled(unique.map(src => foundry.canvas.loadTexture(src)));
}

function pin(src) {
  if ( pinned.has(src) ) return;
  pinned.add(src);
  foundry.canvas.TextureLoader.pinSource(src);
}
