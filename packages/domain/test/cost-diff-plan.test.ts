import { describe, expect, it } from 'vitest';
import {
  DEMO_REQUIREMENTS,
  DEMO_TERRAIN,
  applyOperations,
  diffModels,
  estimateCost,
  generateDesign,
  renderPlanSvg,
  summarizeRooms,
} from '../src';
import type { DesignModel } from '../src';

function demo(): DesignModel {
  return generateDesign({
    projectId: 'PRJ-DEMO',
    requirements: DEMO_REQUIREMENTS,
    terrain: DEMO_TERRAIN,
  });
}

describe('estimateCost', () => {
  it('genera partidas con importes positivos y total coherente', () => {
    const cost = estimateCost(demo());
    expect(cost.lines.length).toBeGreaterThan(5);
    for (const line of cost.lines) {
      expect(line.quantity).toBeGreaterThan(0);
      expect(line.total).toBeGreaterThanOrEqual(0);
    }
    const sum = cost.lines.reduce((acc, line) => acc + line.total, 0);
    expect(sum).toBeCloseTo(cost.subtotal, 0);
    expect(cost.total).toBeCloseTo(cost.subtotal + cost.contingency, 0);
    expect(cost.total).toBeGreaterThan(20000);
    expect(cost.withinBudget).toBe(true);
    expect(cost.currency).toBe('USD');
  });

  it('marca la estimación fuera de presupuesto cuando corresponde', () => {
    const model = demo();
    model.requirements.budget = 50000;
    const cost = estimateCost(model);
    expect(cost.withinBudget).toBe(false);
  });

  it('baja el costo al aplicar materiales económicos', () => {
    const model = demo();
    const before = estimateCost(model).total;
    const result = applyOperations(model, [{ op: 'reduce_budget', percent: 0.2 }]);
    const after = estimateCost(result.model).total;
    expect(after).toBeLessThan(before);
  });
});

describe('diffModels', () => {
  it('detecta cambios de acabados sin marcar cambio estructural', () => {
    const model = demo();
    const kitchen = model.building.levels[0].rooms.find((room) => room.type === 'kitchen')!;
    const result = applyOperations(model, [
      { op: 'set_room_floor', roomId: kitchen.id, materialId: 'floor.marble.carrara' },
    ]);
    const diff = diffModels(model, result.model);
    expect(diff.changes.some((change) => change.kind === 'room_floor')).toBe(true);
    expect(diff.sameStructure).toBe(true);
    expect(diff.summary.length).toBeGreaterThan(0);
  });

  it('identifica la ampliación de un ambiente', () => {
    const model = demo();
    const kitchen = model.building.levels[0].rooms.find((room) => room.type === 'kitchen')!;
    const result = applyOperations(model, [
      { op: 'resize_room', roomId: kitchen.id, targetArea: 14 },
    ]);
    const diff = diffModels(model, result.model);
    const resized = diff.changes.find((change) => change.kind === 'room_resized');
    expect(resized).toBeDefined();
    expect(diff.sameStructure).toBe(false);
  });

  it('no reporta cambios entre el mismo modelo', () => {
    const model = demo();
    const diff = diffModels(model, structuredClone(model));
    expect(diff.changes).toEqual([]);
    expect(diff.summary).toEqual([]);
  });
});

describe('renderPlanSvg', () => {
  it('genera un SVG con los ambientes y sus superficies', () => {
    const model = demo();
    const svg = renderPlanSvg(model, 0, { includeFurniture: true, includeTitle: true });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Cocina');
    expect(svg).toContain('m²');
    expect(svg).toContain('Planta baja');
    expect(svg.length).toBeGreaterThan(4000);
  });

  it('dibuja las dos plantas de la vivienda', () => {
    const model = demo();
    const ground = renderPlanSvg(model, 0);
    const upper = renderPlanSvg(model, 1);
    expect(ground).not.toEqual(upper);
    expect(upper).toContain('Planta 1');
  });

  it('devuelve un SVG vacío para una planta inexistente', () => {
    const svg = renderPlanSvg(demo(), 7);
    expect(svg).toContain('<svg');
    expect(svg.length).toBeLessThan(200);
  });
});

describe('resumen del proyecto', () => {
  it('el cuadro de áreas coincide con la suma de plantas', () => {
    const model = demo();
    const rows = summarizeRooms(model);
    const total = rows.reduce((acc, row) => acc + row.area, 0);
    const byLevel = model.building.levels.reduce(
      (acc, level) => acc + level.rooms.reduce((sum, room) => sum + room.rect.w * room.rect.h, 0),
      0,
    );
    expect(total).toBeCloseTo(byLevel, 0);
  });
});
