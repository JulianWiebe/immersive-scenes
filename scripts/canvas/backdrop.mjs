/**
 * The backdrop of an immersive scene in Token and Hero mode: a solid colour covering the whole
 * canvas, a blurred and darkened copy of the background filling everything outside the stage
 * frame, and the background image or video fitted into the frame.
 */
import { acquireTexture } from "./texture-cache.mjs";
import { fitSize } from "../utils/frame.mjs";
import { getSetting } from "../settings.mjs";

export default class Backdrop {
  /**
   * @param {PIXI.Container} container   Parent container (owned by the stage layer)
   */
  constructor(container) {
    this.container = container;
  }

  /** @type {Function|null} */
  #release = null;

  /** @type {HTMLVideoElement|null} */
  #video = null;

  #background = null;

  /**
   * Build the backdrop, replacing whatever was shown before.
   * @param {object|null} background    Normalized background (see schema) or null for a plain fill
   * @param {{x:number,y:number,width:number,height:number}} frame   Stage frame (world space)
   * @param {{x:number,y:number,width:number,height:number}} rect    Area to cover (the full canvas)
   */
  async build(background, frame, rect) {
    const loaded = background?.src ? await acquireTexture(background.src, {
      loop: background.loop,
      volume: background.volume * getSetting("backgroundVolume")
    }) : null;
    if ( this.container.destroyed ) {
      loaded?.release();
      return;
    }
    this.clear();
    this.#background = background;
    this.#release = loaded?.release ?? null;
    this.#video = loaded?.video ?? null;

    const color = Number.parseInt((background?.color ?? "#000000").slice(1), 16);
    const fill = new PIXI.Graphics();
    fill.beginFill(color, 1).drawRect(rect.x, rect.y, rect.width, rect.height).endFill();
    this.container.addChild(fill);
    if ( !loaded ) return;

    const { texture } = loaded;

    // Blurred surround outside the frame
    const surround = new PIXI.Sprite(texture);
    const cover = fitSize(texture.width, texture.height, rect.width, rect.height, "cover");
    surround.anchor.set(0.5);
    surround.position.set(rect.x + (rect.width / 2), rect.y + (rect.height / 2));
    surround.width = cover.width;
    surround.height = cover.height;
    surround.tint = 0x5a5a5a;
    const blur = new PIXI.BlurFilter(24, 4);
    blur.repeatEdgePixels = true;
    surround.filters = [blur];
    this.container.addChild(surround);

    // Framed background
    const framed = new PIXI.Sprite(texture);
    const size = fitSize(texture.width, texture.height, frame.width, frame.height, background.fit);
    framed.anchor.set(0.5);
    framed.position.set(frame.x + (frame.width / 2), frame.y + (frame.height / 2));
    framed.width = size.width;
    framed.height = size.height;
    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff, 1).drawRect(frame.x, frame.y, frame.width, frame.height).endFill();
    framed.mask = mask;
    this.container.addChild(framed, mask);
  }

  /** Update playback volume after a client setting change. */
  refreshVolume() {
    if ( this.#video && this.#background ) {
      const volume = this.#background.volume * getSetting("backgroundVolume");
      this.#video.volume = volume;
      this.#video.muted = volume <= 0;
    }
  }

  /** Remove everything. */
  clear() {
    if ( !this.container.destroyed ) this.container.removeChildren().forEach(c => c.destroy({ children: true }));
    this.#release?.();
    this.#release = null;
    this.#video = null;
    this.#background = null;
  }
}
