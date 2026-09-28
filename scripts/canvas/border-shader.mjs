/**
 * GLSL for animated portrait borders. The quad spans [-1, 1] in UV space scaled by (1 + pad), so
 * the portrait edge sits at distance 1 and glow effects can extend beyond it.
 */

export const STYLE_IDS = { none: 0, solid: 1, double: 2, gradient: 3, spin: 4, pulse: 5, rainbow: 6, flame: 7 };
export const SHAPE_IDS = { circle: 0, rounded: 1, square: 2 };

export const VERTEX = `
precision highp float;
attribute vec2 aVertexPosition;
attribute vec2 aUvs;
uniform mat3 translationMatrix;
uniform mat3 projectionMatrix;
varying vec2 vUv;
void main() {
  vUv = aUvs * 2.0 - 1.0;
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
}`;

export const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uStyle;
uniform float uShape;
uniform float uTime;
uniform float uWidth;
uniform float uPad;
uniform float uAA;
uniform float uAlpha;

const float PI = 3.14159265;

float sdShape(vec2 p) {
  if ( uShape < 0.5 ) return length(p) - 1.0;
  float c = uShape < 1.5 ? 0.25 : 0.0;
  vec2 q = abs(p) - vec2(1.0 - c);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - c;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

vec3 cycle3(float t) {
  t = fract(t) * 3.0;
  if ( t < 1.0 ) return mix(uColor1, uColor2, t);
  if ( t < 2.0 ) return mix(uColor2, uColor3, t - 1.0);
  return mix(uColor3, uColor1, t - 2.0);
}

void main() {
  vec2 p = vUv * (1.0 + uPad);
  float sd = sdShape(p);
  float w = uWidth;
  // Ring coverage: inside the shape (sd <= 0) and within the border width
  float ring = smoothstep(uAA, -uAA, sd) * smoothstep(-w - uAA, -w + uAA, sd);
  float angle = atan(p.y, p.x) / (2.0 * PI) + 0.5;
  float depth = clamp(-sd / w, 0.0, 1.0); // 0 at outer edge, 1 at inner edge
  vec3 color = uColor1;
  float alpha = ring;

  if ( uStyle < 1.5 ) {
    color = uColor1;
  }
  else if ( uStyle < 2.5 ) {
    // Double: thick outer band, gap, thin inner band
    float outer = step(depth, 0.5);
    float inner = step(0.68, depth);
    color = outer > 0.5 ? uColor1 : uColor2;
    alpha = ring * max(outer, inner);
  }
  else if ( uStyle < 3.5 ) {
    color = cycle3(((p.x + p.y) * 0.25 + 0.5) * 0.66);
  }
  else if ( uStyle < 4.5 ) {
    color = cycle3(angle - uTime * 0.25);
  }
  else if ( uStyle < 5.5 ) {
    float beat = 0.5 + 0.5 * sin(uTime * 3.0);
    color = mix(uColor1, uColor2, beat * (1.0 - depth));
    float glow = exp(-max(sd, 0.0) / (w * 1.5)) * step(0.0, sd) * (0.35 + 0.65 * beat);
    alpha = max(ring, glow * 0.85);
    if ( sd > 0.0 ) color = uColor2;
  }
  else if ( uStyle < 6.5 ) {
    color = hsv2rgb(vec3(fract(angle + uTime * 0.2), 0.75, 1.0));
  }
  else {
    // Flame: flickering tongues rising outward from the ring
    float n = noise(vec2(angle * 18.0, uTime * 2.2 - sd * 6.0));
    float n2 = noise(vec2(angle * 36.0 + 7.0, uTime * 3.1 - sd * 11.0));
    float heat = n * 0.65 + n2 * 0.35;
    float reach = w * (0.6 + 2.2 * heat);
    float tongue = step(0.0, sd) * smoothstep(reach, reach * 0.3, sd);
    alpha = max(ring, tongue * 0.9);
    float t = clamp(sd / (w * 2.8) + (1.0 - heat) * 0.35, 0.0, 1.0);
    color = sd <= 0.0 ? mix(uColor1, uColor2, heat) : mix(uColor2, uColor3, t);
  }

  alpha *= uAlpha;
  gl_FragColor = vec4(color * alpha, alpha);
}`;
