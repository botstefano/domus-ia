import { ROOM_DEFAULTS } from './catalog';
import { clamp, rectRight, rectTop, round, sharedEdge } from './geometry';
import type { IdGen } from './ids';
import type { Opening, Rect, Room, StyleId, Wall } from './types';
import { STYLE_PROFILES } from './catalog';

const TOL = 1e-3;

export interface WallOptions {
  facadeMaterialId: string;
  facadeColor: string;
  levelHeight: number;
  floorToCeiling: boolean;
}

function wallLength(wall: Wall): number {
  return Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
}

export function getWallLength(wall: Wall): number {
  return wallLength(wall);
}

/** Muros de una planta: 4 lados exteriores por ambiente + tabiques entre vecinos. */
export function deriveWalls(rooms: Room[], footprint: Rect, nextId: IdGen, height: number): Wall[] {
  const walls: Wall[] = [];
  const right = rectRight(footprint);
  const top = rectTop(footprint);

  const addWall = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    kind: Wall['kind'],
    roomIds: string[],
    level: number,
  ): Wall | null => {
    if (Math.hypot(to.x - from.x, to.y - from.y) < 0.25) return null;
    const wall: Wall = {
      id: nextId('WALL'),
      level,
      from: { x: round(from.x), y: round(from.y) },
      to: { x: round(to.x), y: round(to.y) },
      thickness: kind === 'external' ? 0.2 : kind === 'internal' ? 0.12 : 0.08,
      height: kind === 'railing' ? 1.0 : height,
      kind,
      roomIds,
      openings: [],
    };
    walls.push(wall);
    return wall;
  };

  for (const room of rooms) {
    const r = room.rect;
    const isRailing = room.type === 'terrace';
    const kind: Wall['kind'] = isRailing ? 'railing' : 'external';

    if (Math.abs(r.x - footprint.x) < TOL) {
      addWall({ x: r.x, y: r.y }, { x: r.x, y: r.y + r.h }, kind, [room.id], room.level);
    }
    if (Math.abs(rectRight(r) - right) < TOL) {
      addWall({ x: rectRight(r), y: r.y }, { x: rectRight(r), y: r.y + r.h }, kind, [room.id], room.level);
    }
    if (Math.abs(r.y - footprint.y) < TOL) {
      addWall({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, kind, [room.id], room.level);
    }
    if (Math.abs(rectTop(r) - top) < TOL) {
      addWall({ x: r.x, y: rectTop(r) }, { x: r.x + r.w, y: rectTop(r) }, kind, [room.id], room.level);
    }
  }

  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      const a = rooms[i];
      const b = rooms[j];
      const edge = sharedEdge(a.rect, b.rect);
      if (!edge) continue;
      const railing = a.type === 'terrace' || b.type === 'terrace';
      const from =
        edge.axis === 'y'
          ? { x: edge.position, y: edge.start }
          : { x: edge.start, y: edge.position };
      const to =
        edge.axis === 'y'
          ? { x: edge.position, y: edge.end }
          : { x: edge.end, y: edge.position };
      addWall(from, to, railing ? 'railing' : 'internal', [a.id, b.id], a.level);
    }
  }

  return walls;
}

function freeIntervals(
  length: number,
  occupied: Array<[number, number]>,
  margin = 0.35,
): Array<[number, number]> {
  const blocked = occupied
    .map(([a, b]) => [Math.max(0, a - margin), Math.min(length, b + margin)] as [number, number])
    .sort((x, y) => x[0] - y[0]);
  const free: Array<[number, number]> = [];
  let cursor = 0.25;
  const end = length - 0.25;
  for (const [a, b] of blocked) {
    if (a > cursor) free.push([cursor, Math.min(a, end)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < end) free.push([cursor, end]);
  return free.filter(([a, b]) => b - a >= 0.8);
}

function addOpening(
  wall: Wall,
  nextId: IdGen,
  kind: Opening['kind'],
  width: number,
  height: number,
  sill: number,
  preferred?: [number, number],
): Opening | null {
  const length = wallLength(wall);
  const w = Math.min(width, length - 0.3);
  if (w < 0.6) return null;
  const occupied: Array<[number, number]> = wall.openings
    .filter((o) => o.kind === 'door')
    .map((o) => [o.offset, o.offset + o.width]);
  const intervals = freeIntervals(length, occupied);
  if (intervals.length === 0) return null;
  let interval = intervals[0];
  if (kind === 'window') {
    interval = intervals.reduce((best, cur) => (cur[1] - cur[0] > best[1] - best[0] ? cur : best), intervals[0]);
  }
  const roomForWidth = Math.max(0, interval[1] - interval[0]);
  const finalWidth = Math.min(w, roomForWidth);
  if (finalWidth < 0.6) return null;
  const desiredOffset = preferred ? preferred[0] : interval[0] + (roomForWidth - finalWidth) / 2;
  const offset = clamp(desiredOffset, interval[0], interval[1] - finalWidth);
  const opening: Opening = {
    id: nextId('OPEN'),
    kind,
    wallId: wall.id,
    offset: round(offset, 2),
    width: round(finalWidth, 2),
    height: round(Math.min(height, wall.height - 0.1), 2),
    sill: round(Math.min(sill, Math.max(0, wall.height - height)), 2),
  };
  wall.openings.push(opening);
  return opening;
}

export interface OpeningOptions {
  style: StyleId;
  levelHeight: number;
  floorToCeiling: boolean;
}

/**
 * Garantiza que todos los ambientes sean accesibles desde el hall. Si un
 * ambiente quedó aislado, abre una puerta en el muro que lo separa de un
 * ambiente ya accesible (o, en último caso, un acceso desde el exterior).
 */
export function ensureConnectivity(rooms: Room[], walls: Wall[], nextId: IdGen): void {
  const start = rooms.find((room) => room.type === 'hall') ?? rooms[0];
  if (!start) return;

  for (let pass = 0; pass < 5; pass += 1) {
    const reachable = new Set<string>([start.id]);
    const queue: string[] = [start.id];
    const doors = walls.filter(
      (wall) => wall.roomIds.length === 2 && wall.openings.some((opening) => opening.kind === 'door'),
    );
    while (queue.length > 0) {
      const current = queue.shift() as string;
      for (const wall of doors) {
        if (!wall.roomIds.includes(current)) continue;
        const other = wall.roomIds.find((id) => id !== current);
        if (other && !reachable.has(other)) {
          reachable.add(other);
          queue.push(other);
        }
      }
      // Las terrazas se consideran accesibles si comparten borde con un ambiente accesible.
      for (const wall of walls) {
        if (wall.roomIds.length !== 2 || !wall.roomIds.includes(current)) continue;
        const other = wall.roomIds.find((id) => id !== current);
        if (!other) continue;
        const otherRoom = rooms.find((room) => room.id === other);
        if (otherRoom?.type === 'terrace' && !reachable.has(other)) {
          reachable.add(other);
          queue.push(other);
        }
      }
    }

    const missing = rooms.filter((room) => !reachable.has(room.id));
    if (missing.length === 0) return;

    for (const room of missing) {
      const candidates = walls
        .filter(
          (wall) =>
            wall.roomIds.includes(room.id) &&
            wall.roomIds.length === 2 &&
            wall.roomIds.some((id) => reachable.has(id)),
        )
        .sort((a, b) => wallLength(b) - wallLength(a));
      let added = false;
      for (const wall of candidates) {
        if (addOpening(wall, nextId, 'door', 0.8, 2.1, 0)) {
          added = true;
          break;
        }
      }
      if (added) continue;
      const external = walls
        .filter(
          (wall) => wall.kind === 'external' && wall.roomIds.length === 1 && wall.roomIds[0] === room.id,
        )
        .sort((a, b) => wallLength(b) - wallLength(a));
      for (const wall of external) {
        if (addOpening(wall, nextId, 'door', 0.9, 2.1, 0)) break;
      }
    }
  }
}

/**
 * Añade puertas y ventanas: puerta de acceso, puerta de cochera, puertas entre
 * ambientes conectados y ventanas en muros exteriores según el estilo.
 */
export function addOpenings(rooms: Room[], walls: Wall[], nextId: IdGen, opts: OpeningOptions): Wall[] {
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  /* --------------------------- Puertas interiores -------------------------- */
  for (const wall of walls) {
    if (wall.roomIds.length < 2) continue;
    const [a, b] = wall.roomIds.map((id) => roomById.get(id));
    if (!a || !b) continue;
    const types = new Set([a.type, b.type]);
    const isRailing = wall.kind === 'railing';
    // Las terrazas se comunican con el interior mediante puertas correderas.
    if (isRailing && !types.has('terrace')) continue;
    if (wall.kind === 'internal' && types.has('kitchen') && types.has('bathroom')) continue;
    const length = wallLength(wall);
    if (length < 1.0) continue;
    const width = isRailing ? Math.min(1.8, length - 0.4) : types.has('bathroom') || types.has('storage') ? 0.8 : 0.9;
    addOpening(wall, nextId, 'door', width, isRailing ? 2.2 : 2.1, 0);
  }

  /* ------------------------------- Accesos -------------------------------- */
  const entranceCandidates = walls
    .filter((w) => w.kind === 'external' && w.roomIds.some((id) => roomById.get(id)?.type === 'hall'))
    .sort((x, y) => wallLength(y) - wallLength(x));
  if (entranceCandidates.length > 0) {
    addOpening(entranceCandidates[0], nextId, 'door', 1.0, 2.2, 0);
  }

  const garageCandidates = walls
    .filter((w) => w.kind === 'external' && w.roomIds.some((id) => roomById.get(id)?.type === 'garage'))
    .sort((x, y) => wallLength(y) - wallLength(x));
  if (garageCandidates.length > 0) {
    const wall = garageCandidates[0];
    addOpening(wall, nextId, 'door', Math.min(3.6, wallLength(wall) - 0.4), 2.4, 0);
  }

  /* ------------------------------- Ventanas -------------------------------- */
  for (const room of rooms) {
    if (room.type === 'terrace' || room.type === 'stairs') continue;
    const defaults = ROOM_DEFAULTS[room.type];
    const ratio = defaults.windowRatio;
    const targetWidth = clamp(room.rect.w * room.rect.h * ratio * 0.55, 0, 5.5);
    if (targetWidth < 0.8 || defaults.maxWindows === 0) continue;

    const candidates = walls
      .filter((w) => w.kind === 'external' && w.roomIds.length === 1 && w.roomIds[0] === room.id)
      .sort((x, y) => wallLength(y) - wallLength(x))
      .slice(0, defaults.maxWindows);

    let remaining = targetWidth;
    for (const wall of candidates) {
      if (remaining < 0.8) break;
      const length = wallLength(wall);
      if (length < 1.4) continue;
      const height = opts.floorToCeiling
        ? Math.max(1.8, wall.height - 0.4)
        : room.type === 'bathroom'
          ? 0.65
          : 1.35;
      const sill = opts.floorToCeiling ? 0.05 : room.type === 'bathroom' ? 1.5 : 0.95;
      const width = Math.min(remaining, opts.floorToCeiling ? 3.4 : 2.6, length - 0.8);
      if (width < 0.8) continue;
      const opening = addOpening(wall, nextId, 'window', width, height, sill);
      if (opening) remaining -= opening.width;
    }
  }

  /* --------------------- Garantía de acceso a cada ambiente ----------------- */
  for (const room of rooms) {
    const incident = walls.filter((w) => w.roomIds.includes(room.id));
    if (incident.some((w) => w.openings.some((o) => o.kind === 'door'))) continue;
    const internal = incident
      .filter((w) => w.kind !== 'external' && w.roomIds.length === 2)
      .sort((x, y) => wallLength(y) - wallLength(x));
    let added = false;
    for (const wall of internal) {
      if (addOpening(wall, nextId, 'door', 0.9, 2.1, 0)) {
        added = true;
        break;
      }
    }
    if (added) continue;
    const external = incident
      .filter((w) => w.kind === 'external' && w.roomIds.length === 1)
      .sort((x, y) => wallLength(y) - wallLength(x));
    for (const wall of external) {
      if (addOpening(wall, nextId, 'door', 0.9, 2.1, 0)) break;
    }
  }

  ensureConnectivity(rooms, walls, nextId);

  return walls;
}

/** Comprueba que ningún vano exceda su muro. */
export function validateOpenings(walls: Wall[]): string[] {
  const problems: string[] = [];
  for (const wall of walls) {
    const length = wallLength(wall);
    for (const opening of wall.openings) {
      if (opening.offset < -1e-6 || opening.offset + opening.width > length + 1e-6) {
        problems.push(`${opening.id} excede el muro ${wall.id}`);
      }
      if (opening.sill + opening.height > wall.height + 1e-6) {
        problems.push(`${opening.id} supera la altura del muro ${wall.id}`);
      }
    }
  }
  return problems;
}

export function profileFor(style: StyleId) {
  return STYLE_PROFILES[style] ?? STYLE_PROFILES.modern;
}
