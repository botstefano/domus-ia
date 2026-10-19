import type { Rect, Vec2 } from './types';

export const EPS = 1e-6;

export function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function rectArea(r: Rect): number {
  return Math.max(0, r.w) * Math.max(0, r.h);
}

export function rectCenter(r: Rect): Vec2 {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function rectRight(r: Rect): number {
  return r.x + r.w;
}

export function rectTop(r: Rect): number {
  return r.y + r.h;
}

export function inflate(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d };
}

export function rectContains(outer: Rect, inner: Rect, tol = 1e-4): boolean {
  return (
    inner.x >= outer.x - tol &&
    inner.y >= outer.y - tol &&
    rectRight(inner) <= rectRight(outer) + tol &&
    rectTop(inner) <= rectTop(outer) + tol
  );
}

/** Área de intersección entre dos rectángulos (0 si no se tocan). */
export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(rectRight(a), rectRight(b)) - Math.max(a.x, b.x);
  const h = Math.min(rectTop(a), rectTop(b)) - Math.max(a.y, b.y);
  if (w <= EPS || h <= EPS) return 0;
  return w * h;
}

export interface SharedEdge {
  /** `'y'`: borde vertical (x constante). `'x'`: borde horizontal (y constante). */
  axis: 'x' | 'y';
  /** Coordenada constante del borde compartido. */
  position: number;
  /** Intervalo del borde compartido a lo largo del eje del muro. */
  start: number;
  end: number;
  length: number;
}

/**
 * Devuelve el borde compartido entre dos rectángulos que se tocan, o null.
 * Dos ambientes que comparten un borde pueden comunicarse mediante una puerta.
 */
export function sharedEdge(a: Rect, b: Rect): SharedEdge | null {
  // Tolerancia de 1 cm: absorbe el redondeo a centímetros de la geometría.
  const tol = 0.01;
  // borde vertical: a está a la izquierda de b
  if (Math.abs(rectRight(a) - b.x) < tol || Math.abs(rectRight(b) - a.x) < tol) {
    const position = Math.abs(rectRight(a) - b.x) < tol ? rectRight(a) : a.x;
    const start = Math.max(a.y, b.y);
    const end = Math.min(rectTop(a), rectTop(b));
    if (end - start > tol) {
      return { axis: 'y', position, start, end, length: end - start };
    }
  }
  // borde horizontal: a está debajo de b
  if (Math.abs(rectTop(a) - b.y) < tol || Math.abs(rectTop(b) - a.y) < tol) {
    const position = Math.abs(rectTop(a) - b.y) < tol ? rectTop(a) : a.y;
    const start = Math.max(a.x, b.x);
    const end = Math.min(rectRight(a), rectRight(b));
    if (end - start > tol) {
      return { axis: 'x', position, start, end, length: end - start };
    }
  }
  return null;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function wallLength(from: Vec2, to: Vec2): number {
  return distance(from, to);
}

export function lerp(from: Vec2, to: Vec2, t: number): Vec2 {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/** Rectángulo de área `area` con la proporción más cercana a `aspect` dentro de `outer`. */
export function fitRectInRect(area: number, outer: Rect, aspect = 1.4): Rect {
  let w = Math.sqrt(area * aspect);
  let h = area / w;
  if (w > outer.w) {
    w = outer.w;
    h = area / w;
  }
  if (h > outer.h) {
    h = outer.h;
    w = area / h;
  }
  return {
    x: outer.x + (outer.w - w) / 2,
    y: outer.y + (outer.h - h) / 2,
    w: round(w),
    h: round(h),
  };
}

/**
 * Distribución tipo "squarified treemap": reparte `values` (áreas) dentro de
 * `container` generando rectángulos que no se solapan y cubren el contenedor.
 * Es determinista y se usa como base de la propuesta de planta.
 */
export function squarify(container: Rect, values: number[]): Rect[] {
  const result: Rect[] = new Array(values.length);
  const containerArea = Math.max(0, container.w) * Math.max(0, container.h);
  const totalValue = values.reduce((acc, value) => acc + Math.max(value, 0.5), 0);
  // Las superficies se normalizan para cubrir exactamente el contenedor: el
  // programa de áreas actúa como proporción dentro de la huella disponible.
  const factor = totalValue > 0 && containerArea > 0 ? containerArea / totalValue : 1;
  const items = values
    .map((value, index) => ({ value: Math.max(value, 0.5) * factor, index }))
    .sort((a, b) => b.value - a.value);

  let free: Rect = { ...container };
  let cursor = 0;

  while (cursor < items.length) {
    const side = Math.min(free.w, free.h);
    const row: typeof items = [];
    let rowSum = 0;
    let bestRatio = Infinity;

    for (let i = cursor; i < items.length; i += 1) {
      const candidate = [...row, items[i]];
      const sum = rowSum + items[i].value;
      const ratio = worstAspectRatio(candidate.map((c) => c.value), sum, side);
      if (row.length === 0 || ratio <= bestRatio) {
        row.push(items[i]);
        rowSum = sum;
        bestRatio = ratio;
      } else {
        break;
      }
    }

    const vertical = free.w > free.h;
    if (vertical) {
      const stripWidth = rowSum / free.h;
      let y = free.y;
      for (const item of row) {
        const h = item.value / stripWidth;
        result[item.index] = {
          x: round(free.x),
          y: round(y),
          w: round(stripWidth),
          h: round(h),
        };
        y += h;
      }
      free = { x: free.x + stripWidth, y: free.y, w: free.w - stripWidth, h: free.h };
    } else {
      const stripHeight = rowSum / free.w;
      let x = free.x;
      for (const item of row) {
        const w = item.value / stripHeight;
        result[item.index] = {
          x: round(x),
          y: round(free.y),
          w: round(w),
          h: round(stripHeight),
        };
        x += w;
      }
      free = { x: free.x, y: free.y + stripHeight, w: free.w, h: free.h - stripHeight };
    }

    cursor += row.length;
  }

  return result.map((r) => r ?? { x: container.x, y: container.y, w: 0, h: 0 });
}

function worstAspectRatio(row: number[], sum: number, side: number): number {
  if (sum <= 0 || side <= 0) return Infinity;
  const max = Math.max(...row);
  const min = Math.min(...row);
  const sideSquared = side * side;
  const sumSquared = sum * sum;
  return Math.max((sideSquared * max) / sumSquared, sumSquared / (sideSquared * min));
}

/** Reparte `total` proporcionalmente a los pesos, garantizando que la suma cuadre. */
export function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, w) => acc + Math.max(w, 0), 0);
  if (sum <= 0) return weights.map(() => total / Math.max(weights.length, 1));
  const raw = weights.map((w) => (Math.max(w, 0) / sum) * total);
  const rounded = raw.map((v) => round(v, 4));
  const diff = round(total - rounded.reduce((acc, v) => acc + v, 0), 4);
  if (rounded.length > 0) rounded[0] = round(rounded[0] + diff, 4);
  return rounded;
}

export function boundingRect(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => rectRight(r)));
  const top = Math.max(...rects.map((r) => rectTop(r)));
  return { x, y, w: right - x, h: top - y };
}

/** Punto medio del borde compartido, útil para ubicar puertas. */
export function sharedEdgeMidpoint(edge: SharedEdge): Vec2 {
  const middle = (edge.start + edge.end) / 2;
  return edge.axis === 'y'
    ? { x: edge.position, y: middle }
    : { x: middle, y: edge.position };
}
