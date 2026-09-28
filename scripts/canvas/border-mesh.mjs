/**
 * Animated portrait border drawn with a custom shader on a quad mesh.
 * Falls back to the static Graphics border if the shader cannot be created.
 */
import { MODULE_ID } from "../constants.mjs";
import { VERTEX, FRAGMENT, STYLE_IDS, SHAPE_IDS } from "./border-shader.mjs";
import PortraitBorder from "./portrait-border.mjs";
import { reducedMotion } from "../settings.mjs";

/** Extra room around the portrait for glow and flames (fraction of the radius). */
const PAD = 0.6;

/** All live border meshes, animated by one shared ticker function. */
const meshes = new Set();
let tickerAttached = null;
let failed = false;
let geometry = null;

/** Reduced-motion state, re-evaluated at most once per second (it involves matchMedia). */
let frozen = false;
let frozenCheckedAt = 0;

function tick() {
  const nowMs = performance.now();
  if ( nowMs - frozenCheckedAt > 1000 ) {
    frozen = reducedMotion();
    frozenCheckedAt = nowMs;
  }
  const now = frozen ? 0 : nowMs / 1000;
  for ( const border of meshes ) border.tick(now);
}

function ensureTicker() {
  const ticker = canvas?.app?.ticker;
  if ( !ticker || tickerAttached === ticker ) return;
  ticker.add(tick);
  tickerAttached = ticker;
}

function getGeometry() {
  if ( geometry && !geometry.destroyed ) return geometry;
  geometry = new PIXI.Geometry()
    .addAttribute("aVertexPosition", [-1, -1, 1, -1, 1, 1, -1, 1], 2)
    .addAttribute("aUvs", [0, 0, 1, 0, 1, 1, 0, 1], 2)
    .addIndex([0, 1, 2, 0, 2, 3]);
  geometry.refCount = Infinity; // Shared: never destroyed with a mesh
  return geometry;
}

const hexToRgb = hex => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export class BorderMesh extends PIXI.Container {
  constructor() {
    super();
    this.shader = PIXI.Shader.from(VERTEX, FRAGMENT, {
      uColor1: [1, 1, 1], uColor2: [1, 1, 1], uColor3: [1, 1, 1],
      uStyle: 1, uShape: 0, uTime: 0, uWidth: 0.1, uPad: PAD, uAA: 0.01, uAlpha: 1
    });
    this.mesh = this.addChild(new PIXI.Mesh(getGeometry(), this.shader));
    this.#speed = 1;
    meshes.add(this);
    ensureTicker();
  }

  #speed;

  #radius = 1;

  /**
   * Update the border for a portrait size and border configuration.
   * @param {number} diameter
   * @param {object} border     Normalized border config
   */
  update(diameter, border) {
    const u = this.shader.uniforms;
    this.#radius = Math.max(1, diameter / 2);
    this.visible = border.style !== "none";
    u.uStyle = STYLE_IDS[border.style] ?? 1;
    u.uShape = SHAPE_IDS[border.shape] ?? 0;
    u.uColor1 = hexToRgb(border.colors[0]);
    u.uColor2 = hexToRgb(border.colors[1]);
    u.uColor3 = hexToRgb(border.colors[2]);
    // Width is a fraction of the diameter; the shader works in radius units
    u.uWidth = Math.max(0.01, border.width * 2);
    this.#speed = border.speed;
    this.mesh.scale.set(this.#radius * (1 + PAD));
  }

  /** Per-frame update: time, anti-aliasing for the current zoom, and alpha. */
  tick(seconds) {
    if ( this.destroyed || !this.visible ) return;
    const u = this.shader.uniforms;
    u.uTime = seconds * this.#speed;
    const screenRadius = this.#radius * Math.abs(this.worldTransform.a || 1);
    u.uAA = 1.25 / Math.max(4, screenRadius);
    u.uAlpha = this.worldAlpha;
  }

  destroy(options) {
    meshes.delete(this);
    this.mesh.geometry = null;
    super.destroy({ ...options, children: true });
    this.shader.destroy?.();
  }
}

/**
 * Create a border display object. Uses the animated shader when available.
 * @returns {BorderMesh|PortraitBorder}
 */
export function createBorder() {
  if ( failed ) return new PortraitBorder();
  try {
    const border = new BorderMesh();
    if ( !verified && !verifyShader(border.shader) ) throw new Error("Border shader failed to compile or link");
    verified = true;
    return border;
  }
  catch(err) {
    failed = true;
    console.warn(`${MODULE_ID} | Animated borders unavailable, using static borders`, err);
    return new PortraitBorder();
  }
}

let verified = false;

/**
 * PIXI compiles shaders lazily and only logs failures, so force a compile once and check the link status.
 * @param {PIXI.Shader} shader
 * @returns {boolean}
 */
function verifyShader(shader) {
  const renderer = canvas?.app?.renderer;
  if ( !renderer?.gl ) return true;
  renderer.shader.bind(shader);
  const glProgram = shader.program.glPrograms[renderer.CONTEXT_UID];
  const gl = renderer.gl;
  return !!glProgram?.program && !!gl.getProgramParameter(glProgram.program, gl.LINK_STATUS);
}
