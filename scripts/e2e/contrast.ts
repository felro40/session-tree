/**
 * Composited WCAG contrast for the e2e (card 6 fix r1, review r1 B2): what a colour really looks
 * like on screen, given its own alpha, every ancestor's `opacity` and the backgrounds behind it.
 *
 * Pure maths, unit-tested in tests/js/contrast.test.ts. The DOM side (scripts/e2e-rich.ts) reads
 * `getComputedStyle` along the element's ancestor chain and hands over one `Layer` per ancestor,
 * root first, the element itself last: its `background-color`, its `opacity` and whether its box
 * covers the probed point (a ghost card hangs below its card, so the card's fill is not behind it).
 *
 * Rendering model (exact for source-over with group opacity): a layer with opacity `o` renders its
 * subtree over the backdrop below it, and the result is mixed back as `o · group + (1 − o) · below`.
 */

export interface Rgba {
  /** 0–255 */
  r: number
  g: number
  b: number
  /** 0–1 */
  a: number
}

export interface Layer {
  background: Rgba
  opacity: number
  covers: boolean
}

export const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 }
export const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 }

const clamp = (value: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, value))

function encode(linear: number): number {
  const c = clamp(linear)

  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
}

function decode(channel: number): number {
  const c = channel / 255

  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function fromOklab(l: number, a: number, b: number, alpha: number): Rgba {
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3

  return {
    r: encode(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    g: encode(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    b: encode(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
    a: alpha
  }
}

/** A computed CSS colour: `rgb[a](…)`, `color(srgb …)`, `oklab(…)`, `oklch(…)`, `transparent`. */
export function parseColor(css: string): Rgba {
  const text = css.trim().toLowerCase()

  if (text === 'transparent' || text === 'none' || text === '') {
    return { r: 0, g: 0, b: 0, a: 0 }
  }

  const fn = /^([a-z]+)\((.*)\)$/.exec(text)

  if (!fn) {
    throw new Error(`unsupported colour ${css}`)
  }

  const [body, alphaPart] = fn[2].split('/').map(part => part.trim())
  const parts = body.replace(/,/g, ' ').split(/\s+/).filter(Boolean)
  const num = (value: string, percentOf = 1) => (value.endsWith('%') ? (Number.parseFloat(value) / 100) * percentOf : Number.parseFloat(value))
  let alpha = alphaPart === undefined ? 1 : num(alphaPart)

  switch (fn[1]) {
    case 'rgb':
    case 'rgba': {
      if (parts.length === 4) {
        alpha = num(parts[3])
      }

      return { r: num(parts[0], 255), g: num(parts[1], 255), b: num(parts[2], 255), a: clamp(alpha) }
    }

    case 'color': {
      if (parts[0] !== 'srgb') {
        throw new Error(`unsupported colour space ${css}`)
      }

      return { r: num(parts[1]) * 255, g: num(parts[2]) * 255, b: num(parts[3]) * 255, a: clamp(alpha) }
    }

    case 'oklab':
      return fromOklab(num(parts[0]), num(parts[1], 0.4), num(parts[2], 0.4), clamp(alpha))

    case 'oklch': {
      const l = num(parts[0])
      const c = num(parts[1], 0.4)
      const h = (Number.parseFloat(parts[2]) * Math.PI) / 180

      return fromOklab(l, c * Math.cos(h), c * Math.sin(h), clamp(alpha))
    }

    default:
      throw new Error(`unsupported colour ${css}`)
  }
}

/** `fg` source-over `bg` (straight alpha). */
export function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a + bg.a * (1 - fg.a)

  if (a === 0) {
    return { r: 0, g: 0, b: 0, a: 0 }
  }

  const channel = (f: number, b: number) => (f * fg.a + b * bg.a * (1 - fg.a)) / a

  return { r: channel(fg.r, bg.r), g: channel(fg.g, bg.g), b: channel(fg.b, bg.b), a }
}

/** The colour on screen at the probed point: `fg` (or nothing) inside the layer chain, over `base`. */
export function render(layers: Layer[], fg: null | Rgba, base: Rgba = WHITE): Rgba {
  const step = (index: number, below: Rgba): Rgba => {
    if (index === layers.length) {
      return fg ? over(fg, below) : below
    }

    const layer = layers[index]
    const group = step(index + 1, layer.covers ? over(layer.background, below) : below)

    return over({ ...group, a: group.a * clamp(layer.opacity) }, below)
  }

  return step(0, base)
}

export function luminance(color: Rgba): number {
  return 0.2126 * decode(color.r) + 0.7152 * decode(color.g) + 0.0722 * decode(color.b)
}

/** WCAG 2 contrast ratio of two opaque colours (1–21). */
export function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)

  return (hi + 0.05) / (lo + 0.05)
}

export type Kind = 'border' | 'stroke' | 'text'

/**
 * The element's contrast at the probed point. `text` / `stroke`: the colour against what is right
 * behind it (the chain without it). `border`: the lower of the border against the element's own
 * inside and against the outside (the chain without the element).
 */
export function compositedContrast(layers: Layer[], fg: Rgba, kind: Kind, base: Rgba = WHITE): { ratio: number; fg: Rgba; against: Rgba[] } {
  const shown = render(layers, fg, base)
  const against = kind === 'border' ? [render(layers, null, base), render(layers.slice(0, -1), null, base)] : [render(layers, null, base)]

  return { ratio: Math.min(...against.map(other => contrast(shown, other))), fg: shown, against }
}

export const rgbText = (c: Rgba) => `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`
