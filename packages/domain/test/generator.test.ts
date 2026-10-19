import { describe, expect, it } from 'vitest';
import {
  DEMO_REQUIREMENTS,
  DEMO_TERRAIN,
  builtArea,
  coverage,
  findUnreachableRooms,
  generateDesign,
  rectArea,
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

describe('generateDesign', () => {
  it('genera un modelo que pasa todas las validaciones', () => {
    const model = demo();
    const report = validateModel(model);
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('respeta el número de plantas, dormitorios y baños solicitados', () => {
    const model = demo();
    expect(model.building.levels).toHaveLength(2);
    const rooms = model.building.levels.flatMap((level) => level.rooms);
    expect(rooms.filter((room) => room.type === 'bedroom')).toHaveLength(3);
    expect(rooms.filter((room) => room.type === 'bathroom')).toHaveLength(2);
    expect(rooms.some((room) => room.type === 'garage')).toBe(true);
    expect(rooms.some((room) => room.type === 'terrace')).toBe(true);
  });

  it('distribuye los ambientes sin solaparse y dentro de la huella', () => {
    const model = demo();
    for (const level of model.building.levels) {
      for (const room of level.rooms) {
        const fp = model.building.footprint;
        expect(room.rect.x).toBeGreaterThanOrEqual(fp.x - 0.05);
        expect(room.rect.y).toBeGreaterThanOrEqual(fp.y - 0.05);
        expect(room.rect.x + room.rect.w).toBeLessThanOrEqual(fp.x + fp.w + 0.05);
        expect(room.rect.y + room.rect.h).toBeLessThanOrEqual(fp.y + fp.h + 0.05);
      }
      const area = level.rooms.reduce((acc, room) => acc + rectArea(room.rect), 0);
      expect(Math.abs(area - rectArea(model.building.footprint))).toBeLessThan(1);
    }
  });

  it('no invade los retiros del terreno ni supera la ocupación permitida', () => {
    const model = demo();
    expect(model.building.footprint.x).toBeGreaterThanOrEqual(DEMO_TERRAIN.setbacks.left - 0.01);
    expect(model.building.footprint.y).toBeGreaterThanOrEqual(DEMO_TERRAIN.setbacks.front - 0.01);
    expect(coverage(model)).toBeLessThanOrEqual(0.75);
    expect(builtArea(model)).toBeGreaterThan(40);
  });

  it('genera muros con vanos y una puerta de acceso', () => {
    const model = demo();
    const walls = model.building.levels.flatMap((level) => level.walls);
    expect(walls.length).toBeGreaterThan(10);
    const openings = walls.flatMap((wall) => wall.openings);
    expect(openings.some((opening) => opening.kind === 'door')).toBe(true);
    expect(openings.some((opening) => opening.kind === 'window')).toBe(true);
    const entrance = walls.some(
      (wall) =>
        wall.kind === 'external' &&
        wall.openings.some((opening) => opening.kind === 'door' && opening.height >= 1.9),
    );
    expect(entrance).toBe(true);
  });

  it('garantiza que todos los ambientes sean accesibles', () => {
    const model = demo();
    expect(findUnreachableRooms(model.building.levels)).toEqual([]);
  });

  it('alinea la escalera entre plantas', () => {
    const model = demo();
    const ground = model.building.levels[0].rooms.find((room) => room.type === 'stairs');
    const upper = model.building.levels[1].rooms.find((room) => room.type === 'stairs');
    expect(ground).toBeDefined();
    expect(upper).toBeDefined();
    expect(upper?.rect.x).toBeCloseTo(ground?.rect.x ?? -1, 2);
    expect(upper?.rect.y).toBeCloseTo(ground?.rect.y ?? -1, 2);
  });

  it('amuebla los ambientes sin sacar muebles de su recinto', () => {
    const model = demo();
    const rooms = model.building.levels.flatMap((level) => level.rooms);
    const furnished = rooms.filter((room) => room.furniture.length > 0);
    expect(furnished.length).toBeGreaterThan(4);
    for (const room of rooms) {
      for (const item of room.furniture) {
        expect(item.x).toBeGreaterThanOrEqual(room.rect.x - 0.1);
        expect(item.y).toBeGreaterThanOrEqual(room.rect.y - 0.1);
        expect(item.x).toBeLessThanOrEqual(room.rect.x + room.rect.w + 0.1);
        expect(item.y).toBeLessThanOrEqual(room.rect.y + room.rect.h + 0.1);
      }
    }
  });

  it('es determinista: dos ejecuciones producen la misma geometría', () => {
    const a = demo();
    const b = demo();
    expect(a.building).toEqual(b.building);
    expect(a.meta.warnings).toEqual(b.meta.warnings);
  });

  it('respeta el área edificable cuando el programa es muy grande', () => {
    const model = generateDesign({
      projectId: 'PRJ-BIG',
      requirements: { ...DEMO_REQUIREMENTS, bedrooms: 6, bathrooms: 4, parkingSpaces: 3 },
      terrain: { ...DEMO_TERRAIN, width: 8, depth: 14 },
    });
    expect(rectArea(model.building.footprint)).toBeLessThanOrEqual(
      8 * 14 - 8 * 2 - 14 * 0.5 + 1,
    );
    const report = validateModel(model);
    expect(report.errors).toEqual([]);
    expect(model.meta.warnings.length).toBeGreaterThanOrEqual(0);
  });
});
