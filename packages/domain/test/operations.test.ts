import { describe, expect, it } from 'vitest';
import {
  DEMO_REQUIREMENTS,
  DEMO_TERRAIN,
  applyOperations,
  diffModels,
  estimateCost,
  generateDesign,
  rectArea,
  validateModel,
} from '../src';
import type { DesignModel, Room } from '../src';

function demo(): DesignModel {
  return generateDesign({
    projectId: 'PRJ-DEMO',
    requirements: DEMO_REQUIREMENTS,
    terrain: DEMO_TERRAIN,
  });
}

function findRoom(model: DesignModel, type: Room['type']): Room {
  const room = model.building.levels.flatMap((level) => level.rooms).find((r) => r.type === type);
  if (!room) throw new Error(`No se encontró el ambiente ${type}`);
  return room;
}

describe('applyOperations', () => {
  it('amplía la cocina conservando el resto de los ambientes', () => {
    const model = demo();
    const kitchen = findRoom(model, 'kitchen');
    const otherRoomCount = model.building.levels.flatMap((l) => l.rooms).length;
    const livingArea = rectArea(findRoom(model, 'living').rect);

    const result = applyOperations(model, [
      { op: 'resize_room', roomId: kitchen.id, targetArea: 16 },
    ]);

    expect(result.applied).toHaveLength(1);
    expect(result.rejected).toEqual([]);
    expect(result.report.ok).toBe(true);

    const updated = findRoom(result.model, 'kitchen');
    expect(rectArea(updated.rect)).toBeCloseTo(16, 0);
    expect(result.model.building.levels.flatMap((l) => l.rooms)).toHaveLength(otherRoomCount);
    expect(rectArea(findRoom(result.model, 'living').rect)).toBeCloseTo(livingArea, 1);
    expect(updated.id).toBe(kitchen.id);
  });

  it('rechaza una operación que rompería la geometría y conserva el modelo', () => {
    const model = demo();
    const kitchen = findRoom(model, 'kitchen');
    const result = applyOperations(model, [
      { op: 'resize_room', roomId: kitchen.id, targetArea: 500 },
    ]);
    // Puede aplicarse parcialmente o rechazarse, pero nunca dejar un modelo inválido.
    expect(result.report.ok).toBe(true);
    for (const room of result.model.building.levels.flatMap((l) => l.rooms)) {
      expect(rectArea(room.rect)).toBeGreaterThan(0);
    }
    expect(rectArea(findRoom(result.model, 'kitchen').rect)).toBeLessThan(500);
  });

  it('mantiene la transaccionalidad: una operación inválida no afecta a las válidas', () => {
    const model = demo();
    const kitchen = findRoom(model, 'kitchen');
    const result = applyOperations(model, [
      { op: 'set_room_color', roomId: kitchen.id, color: '#123456' },
      { op: 'resize_room', roomId: 'ROOM-NO-EXISTE', targetArea: 20 },
      { op: 'set_facade_color', color: '#ffffff' },
    ]);
    // La operación sobre un ambiente inexistente se rechaza y no impide el resto.
    expect(result.applied).toHaveLength(2);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toContain('ROOM-NO-EXISTE');
    const rooms = result.model.building.levels.flatMap((l) => l.rooms);
    expect(rooms.find((r) => r.id === kitchen.id)?.interiorColor).toBe('#123456');
    expect(result.model.building.facadeColor).toBe('#ffffff');
  });

  it('crea un ambiente nuevo dividiendo un espacio existente', () => {
    const model = demo();
    const before = model.building.levels[1].rooms.length;
    const result = applyOperations(model, [
      { op: 'add_room', type: 'bedroom', level: 1, targetArea: 9 },
    ]);
    expect(result.applied).toHaveLength(1);
    expect(result.model.building.levels[1].rooms.length).toBe(before + 1);
    expect(result.report.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('elimina un ambiente y reasigna su superficie', () => {
    const model = demo();
    const laundry = model.building.levels[0].rooms.find((room) => room.type === 'laundry');
    expect(laundry).toBeDefined();
    const beforeArea = rectArea(model.building.footprint);
    const result = applyOperations(model, [{ op: 'remove_room', roomId: laundry!.id }]);
    expect(result.applied).toHaveLength(1);
    expect(result.model.building.levels[0].rooms.some((room) => room.type === 'laundry')).toBe(false);
    const afterArea = result.model.building.levels[0].rooms.reduce(
      (acc, room) => acc + rectArea(room.rect),
      0,
    );
    expect(afterArea).toBeCloseTo(beforeArea, 0);
    expect(result.report.ok).toBe(true);
  });

  it('convierte las ventanas en ventanales de piso a techo', () => {
    const model = demo();
    const result = applyOperations(model, [{ op: 'windows_floor_to_ceiling', scope: 'all' }]);
    expect(result.applied).toHaveLength(1);
    const windows = result.model.building.levels
      .flatMap((level) => level.walls)
      .flatMap((wall) => wall.openings)
      .filter((opening) => opening.kind === 'window');
    expect(windows.length).toBeGreaterThan(0);
    for (const window of windows) {
      expect(window.sill).toBeLessThanOrEqual(0.1);
      expect(window.height).toBeGreaterThan(1.8);
    }
    expect(result.report.ok).toBe(true);
  });

  it('cambia el estilo y actualiza acabados y fachada', () => {
    const model = demo();
    const result = applyOperations(model, [{ op: 'set_style', style: 'minimalist' }]);
    expect(result.applied).toHaveLength(1);
    expect(result.model.requirements.style).toBe('minimalist');
    expect(result.model.building.facadeMaterialId).toBe('facade.paint.white');
    expect(result.model.building.roof.type).toBe('flat');
  });

  it('reduce el presupuesto seleccionando materiales económicos', () => {
    const model = demo();
    const before = estimateCost(model).total;
    const result = applyOperations(model, [{ op: 'reduce_budget', percent: 0.15 }]);
    expect(result.applied).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThan(0);
    const after = estimateCost(result.model).total;
    expect(after).toBeLessThan(before);
  });

  it('agrega mobiliario y permite consultar el mobiliario del ambiente', () => {
    const model = demo();
    const kitchen = findRoom(model, 'kitchen');
    const result = applyOperations(model, [
      { op: 'add_furniture', roomId: kitchen.id, type: 'kitchen_island' },
    ]);
    expect(result.applied).toHaveLength(1);
    const updated = findRoom(result.model, 'kitchen');
    expect(updated.furniture.some((item) => item.type === 'kitchen_island')).toBe(true);
  });

  it('mueve una puerta sin sacarla de su muro', () => {
    const model = demo();
    const door = model.building.levels
      .flatMap((level) => level.walls)
      .flatMap((wall) => wall.openings.map((opening) => ({ wall, opening })))
      .find(({ wall, opening }) => opening.kind === 'door' && wall.kind === 'external');
    expect(door).toBeDefined();
    const result = applyOperations(model, [
      { op: 'move_door', doorId: door!.opening.id, delta: -0.5 },
    ]);
    expect(result.applied).toHaveLength(1);
    expect(result.report.ok).toBe(true);
    const moved = result.model.building.levels
      .flatMap((level) => level.walls)
      .flatMap((wall) => wall.openings)
      .find((opening) => opening.id === door!.opening.id);
    expect(moved!.offset).toBeCloseTo(Math.max(0.1, door!.opening.offset - 0.5), 1);
  });

  it('agrega una planta completa y mantiene la accesibilidad', () => {
    const model = demo();
    const result = applyOperations(model, [{ op: 'add_level' }]);
    expect(result.applied).toHaveLength(1);
    expect(result.model.building.levels).toHaveLength(3);
    expect(result.report.ok).toBe(true);
  });

  it('deja rastro de los cambios en el diff', () => {
    const model = demo();
    const kitchen = findRoom(model, 'kitchen');
    const result = applyOperations(model, [
      { op: 'resize_room', roomId: kitchen.id, targetArea: 14 },
      { op: 'set_room_floor', roomId: kitchen.id, materialId: 'floor.marble.carrara' },
    ]);
    const diff = diffModels(model, result.model);
    expect(diff.changes.some((change) => change.kind === 'room_resized')).toBe(true);
    expect(diff.changes.some((change) => change.kind === 'room_floor')).toBe(true);
    expect(diff.sameStructure).toBe(false);
  });

  it('rechaza colores inválidos y materiales de categoría incorrecta', () => {
    const model = demo();
    const kitchen = findRoom(model, 'kitchen');
    const result = applyOperations(model, [
      { op: 'set_room_color', roomId: kitchen.id, color: 'azul' },
      { op: 'set_room_floor', roomId: kitchen.id, materialId: 'facade.brick.cladding' },
    ]);
    expect(result.applied).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
  });
});
