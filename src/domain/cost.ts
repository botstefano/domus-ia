import { FURNITURE_CATALOG, MATERIAL_INDEX } from './catalog';
import { rectArea } from './geometry';
import type { CostLine, CostReport, DesignModel } from './types';
import { getWallLength } from './walls';

export interface CostOptions {
  /** Porcentaje de contingencia (0-1). */
  contingency?: number;
  /** Porcentaje de honorarios profesionales (0-1). */
  fees?: number;
  /** Costo referencial de estructura, instalaciones y mano de obra (USD/m2). */
  structuralRate?: number;
  /** Moneda de referencia; el catálogo está en USD. */
  currency?: 'USD';
}

function materialCost(id: string, fallback = 0): number {
  return MATERIAL_INDEX[id]?.unitCost ?? fallback;
}

/**
 * Estimación paramétrica de costos a partir de la geometría y del catálogo de
 * materiales. Es una estimación preliminar, no un presupuesto contractual.
 */
export function estimateCost(model: DesignModel, options: CostOptions = {}): CostReport {
  const contingencyRate = options.contingency ?? 0.08;
  const feesRate = options.fees ?? 0.08;
  const lines: CostLine[] = [];

  const push = (line: CostLine) => {
    if (line.quantity <= 0) return;
    lines.push(line);
  };

  /* --------------------------------- Pisos -------------------------------- */
  const floorGroups = new Map<string, number>();
  for (const level of model.building.levels) {
    for (const room of level.rooms) {
      const area = rectArea(room.rect);
      floorGroups.set(room.floorMaterialId, (floorGroups.get(room.floorMaterialId) ?? 0) + area);
    }
  }
  for (const [materialId, area] of floorGroups) {
    const material = MATERIAL_INDEX[materialId];
    push({
      category: 'pisos',
      description: `Piso ${material?.name ?? materialId}`,
      quantity: Math.round(area * 10) / 10,
      unit: 'm2',
      unitCost: materialCost(materialId),
      total: Math.round(area * materialCost(materialId)),
    });
  }

  /* --------------------------------- Muros -------------------------------- */
  let interiorWallArea = 0;
  let exteriorWallArea = 0;
  let openingsArea = 0;
  const openingsCount = { door: 0, window: 0 };

  for (const level of model.building.levels) {
    for (const wall of level.walls) {
      const gross = getWallLength(wall) * wall.height;
      const openingArea = wall.openings.reduce((acc, o) => acc + o.width * o.height, 0);
      openingsArea += openingArea;
      for (const opening of wall.openings) {
        openingsCount[opening.kind] += 1;
      }
      if (wall.kind === 'internal') interiorWallArea += Math.max(0, gross - openingArea);
      else if (wall.kind === 'external') exteriorWallArea += Math.max(0, gross - openingArea);
    }
  }

  push({
    category: 'muros',
    description: 'Tabiques interiores (pintura + muro)',
    quantity: Math.round(interiorWallArea * 10) / 10,
    unit: 'm2',
    unitCost: materialCost('wall.paint.white', 8),
    total: Math.round(interiorWallArea * materialCost('wall.paint.white', 8)),
  });

  push({
    category: 'fachada',
    description: `Fachada ${MATERIAL_INDEX[model.building.facadeMaterialId]?.name ?? ''}`,
    quantity: Math.round(exteriorWallArea * 10) / 10,
    unit: 'm2',
    unitCost: materialCost(model.building.facadeMaterialId, 12),
    total: Math.round(exteriorWallArea * materialCost(model.building.facadeMaterialId, 12)),
  });

  /* -------------------------------- Cubierta ------------------------------- */
  const roofArea = rectArea(model.building.footprint) * (model.building.roof.type === 'gabled' ? 1.12 : 1);
  push({
    category: 'cubierta',
    description: `Cubierta ${MATERIAL_INDEX[model.building.roof.materialId]?.name ?? ''}`,
    quantity: Math.round(roofArea * 10) / 10,
    unit: 'm2',
    unitCost: materialCost(model.building.roof.materialId, 55),
    total: Math.round(roofArea * materialCost(model.building.roof.materialId, 55)),
  });

  /* ---------------------------------- Vanos -------------------------------- */
  const doorCost = materialCost('opening.door.wood', 320);
  push({
    category: 'vanos',
    description: 'Puertas interiores y de acceso',
    quantity: openingsCount.door,
    unit: 'unidad',
    unitCost: doorCost,
    total: openingsCount.door * doorCost,
  });

  let windowTotal = 0;
  let windowCount = 0;
  for (const level of model.building.levels) {
    for (const wall of level.walls) {
      for (const opening of wall.openings) {
        if (opening.kind !== 'window') continue;
        const unit = opening.sill <= 0.2 ? materialCost('opening.window.floor_to_ceiling', 950) : materialCost('opening.window.aluminum', 260);
        windowCount += 1;
        windowTotal += unit;
      }
    }
  }
  push({
    category: 'vanos',
    description: 'Ventanas y ventanales',
    quantity: windowCount,
    unit: 'unidad',
    unitCost: windowCount > 0 ? Math.round(windowTotal / windowCount) : 0,
    total: windowTotal,
  });

  /* ------------------------------- Mobiliario ------------------------------ */
  const furnitureCost = new Map<string, { count: number; total: number }>();
  for (const level of model.building.levels) {
    for (const room of level.rooms) {
      for (const item of room.furniture) {
        const spec = FURNITURE_CATALOG[item.type];
        if (!spec) continue;
        const current = furnitureCost.get(item.type) ?? { count: 0, total: 0 };
        current.count += 1;
        current.total += spec.cost;
        furnitureCost.set(item.type, current);
      }
    }
  }
  for (const [type, value] of furnitureCost) {
    const spec = FURNITURE_CATALOG[type as keyof typeof FURNITURE_CATALOG];
    push({
      category: 'mobiliario',
      description: `${spec?.label ?? type} (${value.count})`,
      quantity: value.count,
      unit: 'unidad',
      unitCost: Math.round(value.total / value.count),
      total: value.total,
    });
  }

  /* ---------------- Estructura, instalaciones y mano de obra --------------- */
  const builtSurface = model.building.levels.reduce(
    (acc, level) => acc + level.rooms.reduce((sum, room) => sum + rectArea(room.rect), 0),
    0,
  );
  const structuralRate = options.structuralRate ?? 320;
  push({
    category: 'estructura',
    description: 'Estructura, instalaciones sanitarias y eléctricas, mano de obra',
    quantity: Math.round(builtSurface),
    unit: 'm2',
    unitCost: structuralRate,
    total: Math.round(builtSurface * structuralRate),
  });

  const subtotal = lines.reduce((acc, line) => acc + line.total, 0);
  const fees = Math.round(subtotal * feesRate);
  push({
    category: 'honorarios',
    description: `Honorarios profesionales (${(feesRate * 100).toFixed(0)}%)`,
    quantity: 1,
    unit: 'global',
    unitCost: fees,
    total: fees,
  });

  const base = subtotal + fees;
  const contingency = Math.round(base * contingencyRate);
  const total = base + contingency;

  return {
    currency: 'USD',
    lines,
    subtotal: base,
    contingency,
    total,
    budget: model.requirements.budget,
    withinBudget: total <= model.requirements.budget,
  };
}
