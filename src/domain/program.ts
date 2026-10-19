import { ROOM_DEFAULTS, STYLE_PROFILES } from './catalog';
import { clamp, fitRectInRect, rectArea } from './geometry';
import type { Rect, Requirements, RoomType, Terrain } from './types';

export type BudgetTier = 'economic' | 'standard' | 'premium';

export interface ProgramItem {
  type: RoomType;
  name: string;
  area: number;
  level: number;
  optional: boolean;
}

export interface ProgramPlan {
  items: ProgramItem[];
  footprint: Rect;
  buildable: Rect;
  tier: BudgetTier;
  requiredArea: number;
  buildableArea: number;
  warnings: string[];
}

/** Área edificable: terreno menos retiros laterales y frontales. */
export function buildableRect(terrain: Terrain): Rect {
  const w = Math.max(1, terrain.width - terrain.setbacks.left - terrain.setbacks.right);
  const d = Math.max(1, terrain.depth - terrain.setbacks.front - terrain.setbacks.back);
  return { x: terrain.setbacks.left, y: terrain.setbacks.front, w, h: d };
}

export function budgetTierFor(budget: number, builtArea: number): BudgetTier {
  if (builtArea <= 0) return 'standard';
  const perSquareMeter = budget / builtArea;
  if (perSquareMeter < 520) return 'economic';
  if (perSquareMeter > 900) return 'premium';
  return 'standard';
}

function areaFor(type: RoomType, factor: number, tier: BudgetTier): number {
  const base = ROOM_DEFAULTS[type].preferredArea * factor;
  const min = ROOM_DEFAULTS[type].minArea;
  const tierFactor = tier === 'economic' ? 0.9 : tier === 'premium' ? 1.1 : 1;
  return Math.max(min, base * tierFactor);
}

function label(type: RoomType, index: number, total: number): string {
  const base = ROOM_DEFAULTS[type].label;
  if (type === 'bedroom') {
    return total > 1 ? `Dormitorio ${index}` : 'Dormitorio';
  }
  if (type === 'bathroom') {
    return total > 1 ? `Baño ${index}` : 'Baño';
  }
  return base;
}

/**
 * Construye el programa arquitectónico (qué ambientes, de qué superficie y en
 * qué nivel) a partir de los requisitos del cliente. Es determinista.
 */
export function buildProgram(req: Requirements, terrain: Terrain): ProgramPlan {
  const style = STYLE_PROFILES[req.style] ?? STYLE_PROFILES.modern;
  const levels = clamp(Math.round(req.levels), 1, 3);
  const warnings: string[] = [];
  const features = new Set(req.features);

  const buildable = buildableRect(terrain);
  const buildableArea = rectArea(buildable);

  // Estimación inicial para clasificar el presupuesto (USD/m2 construido).
  const roughArea =
    (ROOM_DEFAULTS.living.preferredArea +
      ROOM_DEFAULTS.dining.preferredArea +
      ROOM_DEFAULTS.kitchen.preferredArea +
      ROOM_DEFAULTS.bedroom.preferredArea * Math.max(req.bedrooms, 1) +
      ROOM_DEFAULTS.bathroom.preferredArea * Math.max(req.bathrooms, 1) +
      ROOM_DEFAULTS.garage.preferredArea * Math.max(req.parkingSpaces, 0)) *
    levels;
  const tier = budgetTierFor(req.budget, roughArea);

  const areaFactor = style.areaFactor;

  const items: ProgramItem[] = [];
  const push = (type: RoomType, area: number, level: number, optional = false, name?: string) => {
    items.push({ type, area: Math.round(area * 10) / 10, level, optional, name: name ?? '' });
  };

  const bedrooms = clamp(Math.round(req.bedrooms), 0, 8);
  const bathrooms = clamp(Math.round(req.bathrooms), 1, 6);
  const parking = clamp(Math.round(req.parkingSpaces), 0, 3);

  const bedroomsUpper = levels >= 2 ? Math.min(bedrooms, Math.max(1, bedrooms - 1)) : 0;
  const bedroomsGround = bedrooms - bedroomsUpper;

  const bathGround = levels >= 2 ? (bathrooms >= 3 ? 1 : 0) : bathrooms;
  const bathUpper = bathrooms - bathGround;

  /* ------------------------------ Planta baja ---------------------------- */
  push('hall', areaFor('hall', areaFactor, tier), 0);
  push('living', areaFor('living', areaFactor, tier), 0);
  push('dining', areaFor('dining', areaFactor, tier), 0);
  const kitchenArea = areaFor('kitchen', areaFactor, tier) + (features.has('island') ? 2.5 : 0);
  push('kitchen', kitchenArea, 0);
  if (parking > 0) {
    push('garage', 15 + (parking - 1) * 11, 0);
  }
  if (features.has('study')) {
    push('study', areaFor('study', areaFactor, tier), 0, true);
  }
  if (features.has('laundry')) {
    push('laundry', areaFor('laundry', areaFactor, tier), 0, true);
  }
  for (let i = 1; i <= bedroomsGround; i += 1) {
    push('bedroom', areaFor('bedroom', areaFactor, tier), 0);
  }
  for (let i = 1; i <= bathGround; i += 1) {
    push('bathroom', areaFor('bathroom', areaFactor, tier) * (i === 1 ? 1.15 : 1), 0);
  }

  /* ---------------------------- Planta alta ------------------------------ */
  if (levels >= 2) {
    for (let i = 1; i <= bedroomsUpper; i += 1) {
      const isMaster = i === 1;
      push('bedroom', areaFor('bedroom', areaFactor, tier) * (isMaster ? 1.22 : 1), 1);
    }
    for (let i = 1; i <= bathUpper; i += 1) {
      push('bathroom', areaFor('bathroom', areaFactor, tier), 1);
    }
    if (features.has('terrace')) {
      push('terrace', areaFor('terrace', areaFactor, tier), 1, true);
    }
  }
  if (levels === 1 && features.has('terrace')) {
    warnings.push(
      'La terraza se omite en una vivienda de un solo nivel; se sugiere habilitar un segundo nivel o sustituirla por un patio.',
    );
  }

  // Circulación vertical: la escalera ocupa la misma posición en todas las plantas.
  if (levels >= 2) {
    for (let l = 0; l < levels; l += 1) {
      push('stairs', areaFor('stairs', areaFactor, tier), l);
    }
  }

  // Nombres por tipo y nivel.
  const counters = new Map<string, number>();
  const totals = new Map<string, number>();
  for (const item of items) {
    const key = `${item.level}:${item.type}`;
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  for (const item of items) {
    const key = `${item.level}:${item.type}`;
    const index = (counters.get(key) ?? 0) + 1;
    counters.set(key, index);
    item.name = label(item.type, index, totals.get(key) ?? 1);
  }

  /* ------------------------------- Ajuste -------------------------------- */
  let requiredArea = 0;
  for (let l = 0; l < levels; l += 1) {
    const sum = items.filter((i) => i.level === l).reduce((acc, i) => acc + i.area, 0);
    requiredArea = Math.max(requiredArea, sum);
  }
  requiredArea = requiredArea * 1.05; // muros y ductos

  if (requiredArea > buildableArea) {
    const scale = buildableArea / requiredArea;
    warnings.push(
      `El programa solicitado (${requiredArea.toFixed(1)} m2) excede el área edificable (${buildableArea.toFixed(
        1,
      )} m2): se redujeron las superficies en ${((1 - scale) * 100).toFixed(0)}%.`,
    );
    for (const item of items) {
      const min = ROOM_DEFAULTS[item.type].minArea;
      item.area = Math.max(min, Math.round(item.area * scale * 10) / 10);
    }
    // Si aún no cabe, se eliminan ambientes opcionales del final.
    let sum = 0;
    for (let l = 0; l < levels; l += 1) {
      sum = Math.max(
        sum,
        items.filter((i) => i.level === l).reduce((acc, i) => acc + i.area, 0),
      );
    }
    if (sum * 1.05 > buildableArea) {
      for (let i = items.length - 1; i >= 0 && sum * 1.05 > buildableArea; i -= 1) {
        if (items[i].optional) {
          warnings.push(`Se omitió "${items[i].name}" para respetar el área edificable disponible.`);
          sum -= items[i].area;
          items.splice(i, 1);
        }
      }
    }
  }

  let footprintArea = 0;
  for (let l = 0; l < levels; l += 1) {
    const sum = items.filter((i) => i.level === l).reduce((acc, i) => acc + i.area, 0);
    footprintArea = Math.max(footprintArea, sum);
  }
  // 3% adicional para muros y ductos; se respeta el programa de áreas.
  footprintArea = Math.min(footprintArea * 1.03, buildableArea);

  const terrainAspect = clamp(terrain.width / terrain.depth, 0.75, 2.0);
  const footprint = fitRectInRect(footprintArea, buildable, terrainAspect);

  const familyArea = items
    .filter((i) => i.type !== 'garage' && i.type !== 'terrace')
    .reduce((acc, i) => acc + i.area, 0);
  if (req.familySize > 0 && familyArea / req.familySize < 12) {
    warnings.push(
      'La superficie habitable por integrante de la familia es menor a 12 m2; revise el programa o el presupuesto.',
    );
  }

  return { items, footprint, buildable, tier, requiredArea, buildableArea, warnings };
}
