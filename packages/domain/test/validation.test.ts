import { describe, expect, it } from 'vitest';
import {
  DEMO_REQUIREMENTS,
  DEMO_TERRAIN,
  applyOperations,
  estimateCost,
  generateDesign,
  rectArea,
  summarizeRooms,
  validateModel,
} from '../src';
import type { DesignModel } from '../src';

function demo(): DesignModel {
  return generateDesign({
    projectId: 'PRJ-DEMO',
    requirements: DEMO_REQUIREMENTS,
    terrain: DEMO_TERRAIN,
  });
}

describe('validateModel', () => {
  it('detecta ambientes superpuestos', () => {
    const model = demo();
    const level = model.building.levels[0];
    level.rooms[1].rect = { ...level.rooms[0].rect };
    const report = validateModel(model);
    expect(report.ok).toBe(false);
    expect(report.errors.some((issue) => issue.code === 'ROOM_OVERLAP')).toBe(true);
  });

  it('detecta ambientes fuera de la huella', () => {
    const model = demo();
    const level = model.building.levels[0];
    level.rooms[0].rect = {
      ...level.rooms[0].rect,
      x: level.rooms[0].rect.x - 5,
    };
    const report = validateModel(model);
    expect(report.errors.some((issue) => issue.code === 'ROOM_OUT_OF_FOOTPRINT')).toBe(true);
  });

  it('detecta un vano que excede su muro', () => {
    const model = demo();
    const wall = model.building.levels[0].walls[0];
    wall.openings.push({
      id: 'OPEN-TEST',
      kind: 'window',
      wallId: wall.id,
      offset: 100,
      width: 2,
      height: 1.2,
      sill: 0.9,
    });
    const report = validateModel(model);
    expect(report.errors.some((issue) => issue.code === 'OPENING_INVALID')).toBe(true);
  });

  it('advierte cuando la estimación supera el presupuesto', () => {
    const model = demo();
    model.requirements.budget = 1000;
    const report = validateModel(model, { cost: estimateCost(model) });
    expect(report.ok).toBe(true);
    expect(report.warnings.some((issue) => issue.code === 'BUDGET_EXCEEDED')).toBe(true);
  });

  it('advierte sobre ambientes sin iluminación natural', () => {
    const model = demo();
    const living = model.building.levels[0].rooms.find((room) => room.type === 'living');
    for (const wall of model.building.levels[0].walls) {
      if (!living || !wall.roomIds.includes(living.id)) continue;
      wall.openings = wall.openings.filter((opening) => opening.kind !== 'window');
    }
    const report = validateModel(model);
    expect(report.warnings.some((issue) => issue.code === 'ROOM_NO_DAYLIGHT')).toBe(true);
  });

  it('no reporta errores en un modelo generado y modificado válidamente', () => {
    const model = demo();
    const kitchen = model.building.levels[0].rooms.find((room) => room.type === 'kitchen')!;
    const result = applyOperations(model, [
      { op: 'resize_room', roomId: kitchen.id, targetArea: 14 },
      { op: 'add_furniture', roomId: kitchen.id, type: 'kitchen_island' },
      { op: 'set_facade_color', color: '#f2f0ea' },
    ]);
    expect(result.report.ok).toBe(true);
    expect(result.applied).toHaveLength(3);
  });
});

describe('summarizeRooms', () => {
  it('produce el cuadro de áreas con porcentajes coherentes', () => {
    const rows = summarizeRooms(demo());
    expect(rows.length).toBeGreaterThan(8);
    const total = rows.reduce((acc, row) => acc + row.area, 0);
    const percentage = rows.reduce((acc, row) => acc + row.percentage, 0);
    expect(total).toBeGreaterThan(50);
    expect(percentage).toBeGreaterThan(99);
    expect(percentage).toBeLessThan(101);
    expect(rows.every((row) => row.area >= rectArea({ x: 0, y: 0, w: 0, h: 0 }))).toBe(true);
  });
});
