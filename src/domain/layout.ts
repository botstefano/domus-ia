import { rectArea, rectCenter, rectRight, rectTop, sharedEdge, squarify } from './geometry';
import type { ProgramItem } from './program';
import type { Rect, RoomType } from './types';

export interface Placement {
  item: ProgramItem;
  rect: Rect;
}

export interface LevelLayout {
  level: number;
  placements: Placement[];
}

/**
 * Matriz de afinidad funcional (puntaje simétrico).
 * Positivo: conviene que los ambientes compartan tabique. Negativo: conviene evitarlo.
 */
const AFFINITY: Array<[RoomType, RoomType, number]> = [
  ['kitchen', 'dining', 3.0],
  ['living', 'dining', 2.4],
  ['hall', 'living', 2.0],
  ['hall', 'stairs', 2.2],
  ['garage', 'hall', 1.6],
  ['bedroom', 'bathroom', 2.0],
  ['bedroom', 'bedroom', 1.0],
  ['hall', 'bathroom', 0.6],
  ['laundry', 'kitchen', 1.2],
  ['terrace', 'living', 1.2],
  ['terrace', 'bedroom', 0.4],
  ['study', 'living', 0.6],
  ['kitchen', 'bedroom', -3.0],
  ['kitchen', 'bathroom', -2.4],
  ['garage', 'bedroom', -3.0],
  ['garage', 'living', -0.8],
  ['bathroom', 'living', -1.6],
  ['bathroom', 'dining', -1.6],
  ['living', 'bedroom', -0.6],
];

function affinity(a: RoomType, b: RoomType): number {
  for (const [x, y, weight] of AFFINITY) {
    if ((x === a && y === b) || (x === b && y === a)) return weight;
  }
  return 0;
}

/** Preferencias de posición dentro de la huella (frente = Y menor, hacia la calle). */
function positionalScore(type: RoomType, rect: Rect, footprint: Rect): number {
  const center = rectCenter(rect);
  const isFront = center.y < footprint.y + footprint.h * 0.5;
  switch (type) {
    case 'hall':
      return isFront ? 1.2 : -0.5;
    case 'living':
      return isFront ? 0.8 : -0.2;
    case 'garage':
      return isFront ? 0.9 : -0.7;
    case 'kitchen':
      return isFront ? -0.3 : 0.7;
    case 'dining':
      return 0.3;
    case 'bedroom':
      return isFront ? -0.35 : 0.5;
    case 'bathroom':
      return isFront ? -0.1 : 0.2;
    case 'terrace':
      return isFront ? -0.2 : 0.6;
    case 'stairs':
      return 0.1;
    default:
      return 0;
  }
}

function adjacencyPairs(placements: Placement[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      if (sharedEdge(placements[i].rect, placements[j].rect)) pairs.push([i, j]);
    }
  }
  return pairs;
}

function scoreAssignment(
  placements: Placement[],
  footprint: Rect,
  adjacency: Array<[number, number]>,
): number {
  let score = 0;
  for (const [i, j] of adjacency) {
    score += affinity(placements[i].item.type, placements[j].item.type);
  }
  for (const placement of placements) {
    score += positionalScore(placement.item.type, placement.rect, footprint);
  }
  return score;
}

/**
 * Optimización local determinista: intercambia ambientes entre rectángulos
 * mientras mejore la afinidad funcional.
 *
 * Restricciones:
 *  - solo se intercambian rectángulos de superficie comparable, para respetar
 *    el programa de áreas;
 *  - los elementos marcados como fijos (por ejemplo la escalera, que debe
 *    quedar alineada entre plantas) no se mueven.
 */
function improveAssignment(
  placements: Placement[],
  footprint: Rect,
  frozen: Set<number> = new Set(),
  maxSwaps = 80,
): Placement[] {
  const adjacency = adjacencyPairs(placements);
  let swaps = 0;
  let improved = true;

  while (improved && swaps < maxSwaps) {
    improved = false;
    const current = scoreAssignment(placements, footprint, adjacency);
    for (let i = 0; i < placements.length && !improved; i += 1) {
      if (frozen.has(i)) continue;
      for (let j = i + 1; j < placements.length; j += 1) {
        if (frozen.has(j)) continue;
        if (placements[i].item.type === placements[j].item.type) continue;
        if (Math.abs(rectArea(placements[i].rect) - rectArea(placements[j].rect)) > 1.2) continue;
        const swapped = placements.map((placement) => ({ item: placement.item, rect: placement.rect }));
        [swapped[i].item, swapped[j].item] = [swapped[j].item, swapped[i].item];
        const next = scoreAssignment(swapped, footprint, adjacency);
        if (next > current + 1e-9) {
          placements = swapped;
          improved = true;
          swaps += 1;
          break;
        }
      }
    }
  }
  return placements;
}

/**
 * Equilibra las superficies: intercambia ambientes entre rectángulos mientras
 * disminuya la desviación respecto del programa de áreas. Evita que una banda
 * concentre un ambiente desproporcionado y otro quede diminuto.
 */
function balanceAreas(placements: Placement[], frozen: Set<number> = new Set()): Placement[] {
  const deviation = (list: Placement[]) =>
    list.reduce((acc, placement) => acc + Math.abs(rectArea(placement.rect) - placement.item.area), 0);

  let current = placements.slice();
  let currentDeviation = deviation(current);
  for (let iteration = 0; iteration < 60; iteration += 1) {
    let bestGain = 1e-4;
    let bestI = -1;
    let bestJ = -1;
    for (let i = 0; i < current.length; i += 1) {
      if (frozen.has(i)) continue;
      for (let j = i + 1; j < current.length; j += 1) {
        if (frozen.has(j)) continue;
        if (current[i].item.type === current[j].item.type) continue;
        const swapped = current.map((placement) => ({ item: placement.item, rect: placement.rect }));
        [swapped[i].item, swapped[j].item] = [swapped[j].item, swapped[i].item];
        const gain = currentDeviation - deviation(swapped);
        if (gain > bestGain) {
          bestGain = gain;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestI < 0) break;
    const next = current.map((placement) => ({ item: placement.item, rect: placement.rect }));
    [next[bestI].item, next[bestJ].item] = [next[bestJ].item, next[bestI].item];
    current = next;
    currentDeviation -= bestGain;
  }
  return current;
}

/** Distribución simple sobre toda la huella. */
function layoutPlain(items: ProgramItem[], footprint: Rect): Placement[] {
  const sorted = items.slice().sort((a, b) => b.area - a.area);
  const rects = squarify(footprint, sorted.map((item) => item.area));
  const placements = sorted.map((item, index) => ({ item, rect: rects[index] }));
  return improveAssignment(balanceAreas(placements), footprint);
}

/**
 * Descompone la huella en rectángulos que rodean un bloque reservado
 * (la escalera), de modo que el resto de la planta se distribuya sin invadirla.
 */
export function decomposeAroundBlock(footprint: Rect, block: Rect): Rect[] {
  const eps = 0.03;
  const regions: Rect[] = [];
  const bottomHeight = block.y - footprint.y;
  const topHeight = rectTop(footprint) - (block.y + block.h);
  if (bottomHeight > eps) {
    regions.push({ x: footprint.x, y: footprint.y, w: footprint.w, h: bottomHeight });
  }
  if (topHeight > eps) {
    regions.push({
      x: footprint.x,
      y: block.y + block.h,
      w: footprint.w,
      h: topHeight,
    });
  }
  const leftWidth = block.x - footprint.x;
  if (leftWidth > eps) {
    regions.push({ x: footprint.x, y: block.y, w: leftWidth, h: block.h });
  }
  const rightWidth = rectRight(footprint) - (block.x + block.w);
  if (rightWidth > eps) {
    regions.push({ x: block.x + block.w, y: block.y, w: rightWidth, h: block.h });
  }
  return regions;
}

/**
 * Distribución de una planta conservando un bloque fijo (la escalera).
 * El resto de los ambientes se reparte por bandas alrededor del bloque.
 */
function layoutWithReserved(
  items: ProgramItem[],
  footprint: Rect,
  reservedItem: ProgramItem,
  reservedRect: Rect,
): Placement[] {
  const regions = decomposeAroundBlock(footprint, reservedRect).sort(
    (a, b) => rectArea(b) - rectArea(a),
  );
  const rest = items
    .filter((item) => item.type !== 'stairs')
    .slice()
    .sort((a, b) => b.area - a.area);

  const placements: Placement[] = [{ item: reservedItem, rect: reservedRect }];

  // Reparto proporcional: cada ambiente se asigna a la banda que está
  // relativamente más vacía, para que ninguna banda quede sin ambientes.
  const groups: ProgramItem[][] = regions.map(() => []);
  const used = regions.map(() => 0);
  for (const item of rest) {
    let best = 0;
    let bestRatio = Infinity;
    regions.forEach((region, index) => {
      const ratio = used[index] / Math.max(rectArea(region), 0.2);
      if (ratio < bestRatio - 1e-9) {
        bestRatio = ratio;
        best = index;
      }
    });
    groups[best].push(item);
    used[best] += item.area;
  }

  regions.forEach((region, index) => {
    const group = groups[index];
    if (group.length === 0) return;
    const rects = squarify(region, group.map((item) => item.area));
    group.forEach((item, position) => {
      placements.push({ item, rect: rects[position] });
    });
  });

  return improveAssignment(balanceAreas(placements, new Set([0])), footprint, new Set([0]));
}

/**
 * Genera la distribución de ambientes por planta.
 *
 * La escalera se calcula en la primera planta y se reserva como bloque fijo en
 * las plantas superiores, garantizando la continuidad vertical del recorrido.
 */
export function layoutLevels(
  levelItems: Map<number, ProgramItem[]>,
  footprint: Rect,
): LevelLayout[] {
  const layouts: LevelLayout[] = [];
  const levels = [...levelItems.keys()].sort((a, b) => a - b);
  let stairsItem: ProgramItem | null = null;
  let stairsRect: Rect | null = null;

  for (const level of levels) {
    const items = levelItems.get(level) ?? [];
    if (items.length === 0) {
      layouts.push({ level, placements: [] });
      continue;
    }
    const hasStairs = items.some((item) => item.type === 'stairs');
    if (stairsItem && stairsRect && hasStairs) {
      layouts.push({
        level,
        placements: layoutWithReserved(items, footprint, { ...stairsItem, level }, stairsRect),
      });
      continue;
    }
    const placements = layoutPlain(items, footprint);
    const stairs = placements.find((placement) => placement.item.type === 'stairs');
    if (stairs) {
      stairsItem = stairs.item;
      stairsRect = stairs.rect;
    }
    layouts.push({ level, placements });
  }

  return layouts;
}

/** Área útil total de una planta a partir de sus colocaciones. */
export function layoutArea(placements: Placement[]): number {
  return placements.reduce((acc, placement) => acc + rectArea(placement.rect), 0);
}

/** Comprueba que la distribución cubre la huella sin solapamientos. */
export function validateTiling(placements: Placement[], footprint: Rect, tol = 0.05): string[] {
  const problems: string[] = [];
  for (let i = 0; i < placements.length; i += 1) {
    const r = placements[i].rect;
    const inside =
      r.x >= footprint.x - tol &&
      r.y >= footprint.y - tol &&
      rectRight(r) <= rectRight(footprint) + tol &&
      rectTop(r) <= rectTop(footprint) + tol;
    if (!inside) problems.push(`${placements[i].item.name} excede la huella de la vivienda`);
    for (let j = i + 1; j < placements.length; j += 1) {
      const s = placements[j].rect;
      const overlapW = Math.min(rectRight(r), rectRight(s)) - Math.max(r.x, s.x);
      const overlapH = Math.min(rectTop(r), rectTop(s)) - Math.max(r.y, s.y);
      if (overlapW > tol && overlapH > tol) {
        problems.push(`${placements[i].item.name} se superpone con ${placements[j].item.name}`);
      }
    }
  }
  const area = layoutArea(placements);
  const footprintArea = footprint.w * footprint.h;
  if (Math.abs(area - footprintArea) > Math.max(1, footprintArea * 0.04)) {
    problems.push(
      `La distribución cubre ${area.toFixed(1)} m2 de una huella de ${footprintArea.toFixed(1)} m2`,
    );
  }
  return problems;
}
