/**
 * A cast member on the stage: a full-body sprite (hero style) or a bordered portrait (token style),
 * plus an optional nameplate. Handles look crossfades, movement tweens and entrance/exit animations.
 */
import { SILHOUETTE } from "../constants.mjs";
import { acquireTexture } from "./texture-cache.mjs";
import { tween, stopTween } from "./animate.mjs";
import PortraitBorder, { drawShape } from "./portrait-border.mjs";
import { createBorder } from "./border-mesh.mjs";
import { toWorld } from "../utils/frame.mjs";
import { reducedMotion } from "../settings.mjs";

const CROSSFADE = 450;
const MOVE = 500;

export default class CastSprite extends PIXI.Container {
  /**
   * @param {object} item     View item (see buildView)
   * @param {"hero"|"token"} style
   */
  constructor(item, style) {
    super();
    this.item = item;
    this.style = style;
    this.sortableChildren = true;
    this.#moveName = Symbol(`cast-move-${item.id}`);

    /** Holds the look faces (the current one last). Mirroring flips this container only. */
    this.faces = this.addChild(new PIXI.Container());
    this.faces.zIndex = 1;
    if ( style === "token" ) {
      this.border = this.addChild(createBorder() ?? new PortraitBorder());
      this.border.zIndex = 2;
    }
    this.nameplate = this.addChild(new PIXI.Container());
    this.nameplate.zIndex = 3;
  }

  /** @type {symbol} */
  #moveName;

  /** Current display height in pixels (hero: sprite height, token: portrait diameter). */
  #size = 0;

  /** @type {Array<{container: PIXI.Container, sprite: PIXI.Sprite, release: Function}>} */
  #faces = [];

  /** Guards against out-of-order look loads. */
  #lookToken = 0;

  /* -------------------------------------------- */

  /**
   * Load the item's look and place it without animation.
   * @param {{x:number,y:number,width:number,height:number}} frame
   */
  async init(frame) {
    await this.setLook(this.item.src, { animate: false });
    this.place(this.item, frame, { animate: false });
    this.restyle(this.item);
  }

  /**
   * Swap the displayed look, crossfading from the previous one.
   * @param {string} src
   * @param {object} [options]
   * @param {boolean} [options.animate=true]
   */
  async setLook(src, { animate = true } = {}) {
    const token = ++this.#lookToken;
    const loaded = (await acquireTexture(src || SILHOUETTE)) ?? (await acquireTexture(SILHOUETTE));
    if ( this.destroyed || (token !== this.#lookToken) ) {
      loaded?.release();
      return;
    }
    const face = this.#createFace(loaded);
    const previous = [...this.#faces];
    this.#faces.push(face);
    this.faces.addChild(face.container);
    this.#layoutFace(face);
    if ( animate && previous.length ) {
      face.container.alpha = 0;
      await tween(face.container, { alpha: 1 }, { duration: CROSSFADE });
    }
    for ( const old of previous ) this.#destroyFace(old);
  }

  #createFace(loaded) {
    const container = new PIXI.Container();
    const sprite = container.addChild(new PIXI.Sprite(loaded?.texture ?? PIXI.Texture.EMPTY));
    let mask = null;
    if ( this.style === "token" ) {
      sprite.anchor.set(0.5, 0.5);
      mask = container.addChild(new PIXI.Graphics());
      sprite.mask = mask;
    }
    else sprite.anchor.set(0.5, 1);
    return { container, sprite, mask, release: loaded?.release ?? (() => {}) };
  }

  #destroyFace(face) {
    this.#faces.findSplice(f => f === face);
    face.container.destroy({ children: true });
    face.release();
  }

  /** Size a face for the current display size. */
  #layoutFace(face) {
    const { sprite, mask } = face;
    const tex = sprite.texture;
    const tw = tex.width || 1;
    const th = tex.height || 1;
    if ( this.style === "hero" ) {
      sprite.height = this.#size;
      sprite.width = this.#size * (tw / th);
      return;
    }
    // Token: cover-fit the portrait into the shape and clip it
    const d = this.#size;
    const s = Math.max(d / tw, d / th);
    sprite.width = tw * s;
    sprite.height = th * s;
    mask.clear();
    drawShape(mask, this.item.border.shape, d / 2);
  }

  /* -------------------------------------------- */

  /**
   * Move and resize to the item's placement.
   * @param {object} item
   * @param {{x:number,y:number,width:number,height:number}} frame
   * @param {object} [options]
   * @param {boolean} [options.animate=true]
   */
  async place(item, frame, { animate = true } = {}) {
    this.item = item;
    const { x, y } = toWorld(frame, item.x, item.y);
    const size = item.size * frame.height;
    this.zIndex = item.z;
    const flip = item.mirror ? -1 : 1;
    stopTween(this.#moveName);

    const resize = () => {
      for ( const face of this.#faces ) this.#layoutFace(face);
      this.#drawDecorations();
    };
    if ( !animate || (this.#size === 0) || reducedMotion() ) {
      this.#size = size;
      this.position.set(x, y);
      this.faces.scale.x = flip;
      resize();
      return;
    }

    // Animate position and size together, re-laying out faces on every frame
    const from = { x: this.x, y: this.y, size: this.#size, flip: this.faces.scale.x };
    const t = { p: 0 };
    const done = foundry.canvas.animation.CanvasAnimation.animate([{ parent: t, attribute: "p", to: 1 }], {
      context: this,
      name: this.#moveName,
      duration: MOVE,
      easing: "easeInOutCosine",
      ontick: () => {
        if ( this.destroyed ) return;
        this.position.set(from.x + ((x - from.x) * t.p), from.y + ((y - from.y) * t.p));
        this.#size = from.size + ((size - from.size) * t.p);
        this.faces.scale.x = (from.flip + ((flip - from.flip) * t.p)) || 0.001;
        resize();
      }
    });
    const completed = await done;
    if ( this.destroyed || !completed ) return;
    this.#size = size;
    this.position.set(x, y);
    this.faces.scale.x = flip;
    resize();
  }

  /** Update nameplate and border after a style change. */
  restyle(item) {
    this.item = item;
    for ( const face of this.#faces ) this.#layoutFace(face);
    this.#drawDecorations();
  }

  #drawDecorations() {
    const d = this.#size;
    if ( this.border ) this.border.update(d, this.item.border);
    this.#drawNameplate();
  }

  #drawNameplate() {
    const plate = this.nameplate;
    plate.removeChildren().forEach(c => c.destroy());
    if ( !this.item.showName || !this.item.name ) return;
    const d = this.#size;
    const fontSize = Math.max(10, Math.round((this.style === "hero" ? 0.045 : 0.13) * d));
    const style = foundry.canvas.containers.PreciseText.getTextStyle({
      fontSize,
      fill: this.item.nameColor,
      strokeThickness: Math.max(2, fontSize / 8),
      dropShadowBlur: fontSize / 3
    });
    const text = new foundry.canvas.containers.PreciseText(this.item.name, style);
    text.anchor.set(0.5, 0.5);
    const padX = fontSize * 0.7;
    const padY = fontSize * 0.25;
    const bg = new PIXI.Graphics();
    bg.beginFill(0x000000, 0.55);
    bg.drawRoundedRect(-(text.width / 2) - padX, -(text.height / 2) - padY, text.width + (padX * 2), text.height + (padY * 2), fontSize * 0.5);
    bg.endFill();
    plate.addChild(bg, text);
    plate.position.set(0, this.style === "hero" ? -fontSize * 1.6 : (d / 2) + (fontSize * 0.9));
  }

  /* -------------------------------------------- */
  /*  Entrance / Exit                             */
  /* -------------------------------------------- */

  /**
   * Play an entrance animation.
   * @param {{type: string, duration: number}} entrance
   */
  async enter({ type, duration }) {
    if ( type === "none" || !duration ) return;
    const target = { alpha: 1, x: this.x, y: this.y, "scale.x": 1, "scale.y": 1 };
    this.alpha = 0;
    if ( type === "slide" ) this.x += (this.item.x < 0.5 ? -1 : 1) * this.#size * 0.6;
    else if ( type === "rise" ) this.y += this.#size * 0.15;
    else if ( type === "zoom" ) this.scale.set(0.6);
    await tween(this, target, { duration, easing: "easeOutCircle" });
  }

  /**
   * Play an exit animation and destroy the sprite.
   * @param {{type: string, duration: number}} entrance
   */
  async exit({ type, duration }) {
    this.eventMode = "none";
    if ( type !== "none" && duration ) {
      const to = { alpha: 0 };
      if ( type === "slide" ) to.x = this.x + ((this.item.x < 0.5 ? -1 : 1) * this.#size * 0.6);
      else if ( type === "rise" ) to.y = this.y + (this.#size * 0.15);
      else if ( type === "zoom" ) Object.assign(to, { "scale.x": 0.6, "scale.y": 0.6 });
      await tween(this, to, { duration: duration * 0.75, easing: "easeInCircle" });
    }
    if ( !this.destroyed ) this.destroy({ children: true });
  }

  /** Display height in pixels. */
  get displaySize() {
    return this.#size;
  }

  destroy(options) {
    for ( const face of [...this.#faces] ) face.release();
    this.#faces = [];
    super.destroy(options);
  }
}
