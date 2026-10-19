import { clamp, rectRight, rectTop, round, sharedEdge } from './geometry';
import { nextFreeId } from './ids';
import type { Level, Opening, Rect, Room, Wall } from './types';

interface Side {
  axis: 'x' | 'y';
  position: number;
  start: number;
  end: number;
}

const TOL = 0.06;

function sidesOf(rect: Rect): Side[] {
  return [
    { axis: 'y', position: rect.x, start: rect.y, end: rect.y + rect.h },
    { axis: 'y', position: rectRight(rect), start: rect.y, end: rect.y + rect.h },
    { axis: 'x', position: rect.y, start: rect.x, end: rectRight(rect) },
    { axis: 'x', position: rectTop(rect), start: rect.x, end: rectRight(rect) },
  ];
}

function onBoundary(side: Side, footprint: Rect): boolean {
  if (side.axis === 'y') {
    return (
      Math.abs(side.position - footprint.x) < 0.02 ||
      Math.abs(side.position - rectRight(footprint)) < 0.02
    );
  }
  return (
    Math.abs(side.position - footprint.y) < 0.02 ||
    Math.abs(side.position - rectTop(footprint)) < 0.02
  );
}

function wallSide(wall: Wall): Side {
  const vertical = Math.abs(wall.from.x - wall.to.x) < 1e-6;
  return vertical
    ? {
        axis: 'y',
        position: wall.from.x,
        start: Math.min(wall.from.y, wall.to.y),
        end: Math.max(wall.from.y, wall.to.y),
      }
    : {
        axis: 'x',
        position: wall.from.y,
        start: Math.min(wall.from.x, wall.to.x),
        end: Math.max(wall.from.x, wall.to.x),
      };
}

function setWallToSide(wall: Wall, side: Side): void {
  wall.from =
    side.axis === 'y'
      ? { x: round(side.position, 2), y: round(side.start, 2) }
      : { x: round(side.start, 2), y: round(side.position, 2) };
  wall.to =
    side.axis === 'y'
      ? { x: round(side.position, 2), y: round(side.end, 2) }
      : { x: round(side.end, 2), y: round(side.position, 2) };
}

function clampOpenings(wall: Wall, length: number, removeIds: Set<string>): void {
  const kept: Opening[] = [];
  for (const opening of wall.openings) {
    if (opening.width > length - 0.15) {
      removeIds.add(opening.id);
      continue;
    }
    opening.offset = round(clamp(opening.offset, 0.02, Math.max(0.02, length - opening.width - 0.02)), 2);
    opening.height = round(Math.min(opening.height, wall.height - 0.05), 2);
    opening.sill = round(Math.min(opening.sill, Math.max(0, wall.height - opening.height)), 2);
    kept.push(opening);
  }
  wall.openings = kept;
}

export interface SyncResult {
  removedOpenings: string[];
  removedWalls: string[];
}

/**
 * Reajusta los muros de una planta a la geometría actual de sus ambientes.
 *
 * Decisión de diseño: en lugar de regenerar toda la planta (lo que perdería
 * puertas, ventanas y acabados ya aprobados), se conserva la identidad de cada
 * muro y solo se corrigen sus extremos, se eliminan los muros que dejaron de
 * existir y se crean los que faltan. Los vanos se recortan o se descartan si el
 * nuevo muro ya no los admite.
 */
export interface SyncOptions {
  /** Identificadores ya usados en todo el modelo, para no generar colisiones. */
  reservedIds?: Iterable<string>;
  /** Altura a asignar según el tipo de muro. */
  heightFor?: (kind: Wall['kind']) => number;
}

export function synchronizeWalls(
  level: Level,
  footprint: Rect,
  options: SyncOptions = {},
): SyncResult {
  const heightForKind = options.heightFor ?? (() => level.height);
  const removedOpenings: string[] = [];
  const removedWalls: string[] = [];
  const rooms = new Map(level.rooms.map((r) => [r.id, r]));
  const removeOpeningIds = new Set<string>();

  /* ------------------------- 1. Corregir muros ---------------------------- */
  const survivors: Wall[] = [];
  const lengthOf = (wall: Wall) => Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
  for (const wall of level.walls) {
    if (wall.roomIds.length === 2) {
      const a = rooms.get(wall.roomIds[0]);
      const b = rooms.get(wall.roomIds[1]);
      const edge = a && b ? sharedEdge(a.rect, b.rect) : null;
      if (!edge) {
        removedWalls.push(wall.id);
        continue;
      }
      wall.kind = wall.kind === 'railing' ? 'railing' : 'internal';
      wall.height = heightForKind(wall.kind);
      setWallToSide(wall, {
        axis: edge.axis,
        position: edge.position,
        start: edge.start,
        end: edge.end,
      });
      if (lengthOf(wall) < 0.3) {
        removedWalls.push(wall.id);
        continue;
      }
      clampOpenings(wall, edge.length, removeOpeningIds);
      survivors.push(wall);
      continue;
    }

    const room = rooms.get(wall.roomIds[0]);
    if (!room) {
      removedWalls.push(wall.id);
      continue;
    }
    const sides = sidesOf(room.rect);
    const current = wallSide(wall);
    const match = sides.find(
      (side) => side.axis === current.axis && Math.abs(side.position - current.position) < TOL,
    );
    if (!match) {
      removedWalls.push(wall.id);
      continue;
    }
    const boundary = onBoundary(match, footprint);
    wall.kind = room.type === 'terrace' ? 'railing' : boundary ? 'external' : 'internal';
    wall.height = heightForKind(wall.kind);
    setWallToSide(wall, match);
    if (lengthOf(wall) < 0.3) {
      removedWalls.push(wall.id);
      continue;
    }
    clampOpenings(wall, match.end - match.start, removeOpeningIds);
    survivors.push(wall);
  }
  level.walls = survivors;

  /* ------------------------- 2. Crear muros faltantes ---------------------- */
  const takenIds = new Set<string>(level.walls.map((w) => w.id));
  if (options.reservedIds) {
    for (const id of options.reservedIds) takenIds.add(id);
  }
  const newId = () => {
    const id = nextFreeId(takenIds, 'WALL');
    takenIds.add(id);
    return id;
  };

  const findExternal = (roomId: string, side: Side) =>
    level.walls.find((w) => {
      if (w.roomIds.length !== 1 || w.roomIds[0] !== roomId) return false;
      const ws = wallSide(w);
      return ws.axis === side.axis && Math.abs(ws.position - side.position) < TOL;
    });

  for (const room of level.rooms) {
    for (const side of sidesOf(room.rect)) {
      const boundary = onBoundary(side, footprint);
      const existing = findExternal(room.id, side);
      if (!boundary) {
        if (existing && existing.kind === 'external') {
          existing.kind = 'internal';
          existing.height = heightForKind('internal');
        }
        continue;
      }
      if (existing) continue;
      if (side.end - side.start < 0.3) continue;
      const kind: Wall['kind'] = room.type === 'terrace' ? 'railing' : 'external';
      const wall: Wall = {
        id: newId(),
        level: level.index,
        from: { x: 0, y: 0 },
        to: { x: 0, y: 0 },
        thickness: kind === 'railing' ? 0.08 : 0.2,
        height: heightForKind(kind),
        kind,
        roomIds: [room.id],
        openings: [],
      };
      setWallToSide(wall, side);
      level.walls.push(wall);
    }
  }

  for (let i = 0; i < level.rooms.length; i += 1) {
    for (let j = i + 1; j < level.rooms.length; j += 1) {
      const a = level.rooms[i];
      const b = level.rooms[j];
      const edge = sharedEdge(a.rect, b.rect);
      if (!edge) continue;
      const exists = level.walls.some(
        (w) =>
          w.roomIds.length === 2 &&
          w.roomIds.includes(a.id) &&
          w.roomIds.includes(b.id),
      );
      if (exists) continue;
      if (edge.length < 0.3) continue;
      const railing = a.type === 'terrace' || b.type === 'terrace';
      const wall: Wall = {
        id: newId(),
        level: level.index,
        from: { x: 0, y: 0 },
        to: { x: 0, y: 0 },
        thickness: railing ? 0.08 : 0.12,
        height: heightForKind(railing ? 'railing' : 'internal'),
        kind: railing ? 'railing' : 'internal',
        roomIds: [a.id, b.id],
        openings: [],
      };
      setWallToSide(wall, {
        axis: edge.axis,
        position: edge.position,
        start: edge.start,
        end: edge.end,
      });
      level.walls.push(wall);
    }
  }

  removedOpenings.push(...removeOpeningIds);

  // Aseguramos que ninguna puerta interior quede fuera de su muro.
  for (const wall of level.walls) {
    const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
    clampOpenings(wall, length, new Set());
  }

  return { removedOpenings, removedWalls };
}

/** Elimina muebles que quedaron fuera de su ambiente tras un cambio de geometría. */
export function pruneFurniture(level: Level): string[] {
  const removed: string[] = [];
  for (const room of level.rooms) {
    const r = room.rect;
    room.furniture = room.furniture.filter((item) => {
      const inside =
        item.x >= r.x - 0.05 &&
        item.y >= r.y - 0.05 &&
        item.x <= rectRight(r) + 0.05 &&
        item.y <= rectTop(r) + 0.05;
      if (!inside) removed.push(item.id);
      return inside;
    });
  }
  return removed;
}

/** Añade una puerta centrada en el muro indicado (si cabe). */
export function addDoorToWall(wall: Wall, existingIds: Set<string>, width = 0.9): Opening | null {
  const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
  const w = Math.min(width, length - 0.25);
  if (w < 0.6) return null;
  const id = nextFreeId(existingIds, 'OPEN');
  existingIds.add(id);
  const opening: Opening = {
    id,
    kind: 'door',
    wallId: wall.id,
    offset: round(Math.max(0.02, (length - w) / 2), 2),
    width: round(w, 2),
    height: Math.min(2.1, wall.height - 0.1),
    sill: 0,
  };
  wall.openings.push(opening);
  return opening;
}

export function roomWalls(level: Level, roomId: string): Wall[] {
  return level.walls.filter((w) => w.roomIds.includes(roomId));
}

export function roomsSharingWall(level: Level, room: Room): Room[] {
  const neighbors = new Set<string>();
  for (const wall of level.walls) {
    if (wall.roomIds.length === 2 && wall.roomIds.includes(room.id)) {
      for (const id of wall.roomIds) if (id !== room.id) neighbors.add(id);
    }
  }
  return level.rooms.filter((r) => neighbors.has(r.id));
}
