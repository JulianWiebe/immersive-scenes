/**
 * Small animation helpers on top of Foundry's CanvasAnimation.
 */
import { reducedMotion } from "../settings.mjs";

const CanvasAnimation = () => foundry.canvas.animation.CanvasAnimation;

/**
 * Tween attributes of a display object. Resolves immediately (applying the end values) when
 * reduced motion is active or the duration is 0.
 * @param {PIXI.DisplayObject} object
 * @param {Record<string, number>} to            Attribute → target value (dot paths allowed, e.g. "scale.x")
 * @param {object} [options]
 * @param {number} [options.duration=400]
 * @param {string|Function} [options.easing="easeInOutCosine"]
 * @param {string|symbol} [options.name]
 * @returns {Promise<boolean>}
 */
export function tween(object, to, { duration = 400, easing = "easeInOutCosine", name } = {}) {
  const attributes = Object.entries(to).map(([path, value]) => {
    const parts = path.split(".");
    const attribute = parts.pop();
    const parent = parts.reduce((o, k) => o?.[k], object);
    return { parent, attribute, to: value };
  }).filter(a => a.parent);
  if ( !duration || reducedMotion() || object.destroyed ) {
    for ( const a of attributes ) a.parent[a.attribute] = a.to;
    return Promise.resolve(true);
  }
  return CanvasAnimation().animate(attributes, { context: object, duration, easing, name });
}

/** Stop a named animation. */
export function stopTween(name) {
  if ( name ) CanvasAnimation().terminateAnimation(name);
}
