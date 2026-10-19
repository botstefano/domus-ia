import {
  FURNITURE_CATALOG,
  MATERIAL_INDEX,
  ROOM_DEFAULTS,
  STYLE_PROFILES,
  materialsByCategory,
} from './catalog';
import { estimateCost } from './cost';
import { clamp, rectArea, rectRight, rectTop, round } from './geometry';
import { nextFreeId } from './ids';
import type {
  ApplyResult,
  DesignModel,
  FurnitureType,
  Level,
  Operation,
  Room,
  RoomType,
  ValidationReport,
} from './types';
import { validateModel } from './validation';
import { addDoorToWall, pruneFurniture, roomWalls, synchronizeWalls } from './wallsync';
import { furnishRoom } from './furnish';

export interface ApplyOptions {
  maxCoverage?: number;
  /** Si es false, no se descartan operaciones inválidas: se lanza la primera. */
  keepValidPrefix?: boolean;
}

export class OperationError extends Error {
  constructor(
    message: string,
    public readonly operation?: Operation,
  ) {
    super(message);
    this.name = 'OperationError';
  }
}

type IdGen = (prefix: string) => string;

function makeIdGen(model: DesignModel): IdGen {
  const taken = new Set<string>();
  for (const level of model.building.levels) {
    for (const room of level.rooms) {
      taken.add(room.id);
      for (const item of room.furniture) taken.add(item.id);
    }
    for (const wall of level.walls) {
      taken.add(wall.id);
      for (const opening of wall.openings) taken.add(opening.id);
    }
  }
  return (prefix: string) => {
    const id = nextFreeId(taken, prefix);
    taken.add(id);
    return id;
  };
}

function modelIds(model: DesignModel): Set<string> {
  const ids = new Set<string>();
  for (const level of model.building.levels) {
    for (const room of level.rooms) {
      ids.add(room.id);
      for (const item of room.furniture) ids.add(item.id);
    }
    for (const wall of level.walls) {
      ids.add(wall.id);
      for (const opening of wall.openings) ids.add(opening.id);
    }
  }
  return ids;
}

/**
 * Abre una puerta en cada tabique de una planta recién creada. Sin esto, la
 * planta quedaría dividida en zonas sin comunicación entre sí.
 */
function ensureLevelDoors(level: Level, idGen: IdGen): void {
  const existing = new Set<string>();
  for (const wall of level.walls) for (const opening of wall.openings) existing.add(opening.id);
  const roomById = new Map(level.rooms.map((room) => [room.id, room]));
  for (const wall of level.walls) {
    if (wall.kind !== 'internal' || wall.roomIds.length !== 2) continue;
    if (wall.openings.some((opening) => opening.kind === 'door')) continue;
    const types = new Set(wall.roomIds.map((id) => roomById.get(id)?.type));
    if (types.has('kitchen') && types.has('bathroom')) continue;
    const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
    if (length < 1.0) continue;
    addDoorToWall(wall, existing, types.has('bathroom') ? 0.8 : 0.9);
  }
  void idGen;
}

function findRoom(model: DesignModel, roomId: string): { level: Level; room: Room } {
  for (const level of model.building.levels) {
    const room = level.rooms.find((r) => r.id === roomId);
    if (room) return { level, room };
  }
  throw new OperationError(`No existe el ambiente ${roomId}.`);
}

function floorForType(type: RoomType, styleFloor: string): string {
  switch (type) {
    case 'bathroom':
    case 'kitchen':
      return 'floor.porcelain.matte';
    case 'garage':
    case 'terrace':
      return 'floor.concrete.polished';
    case 'laundry':
      return 'floor.vinyl.grey';
    default:
      return styleFloor;
  }
}

function uniqueRoomName(level: Level, type: RoomType): string {
  const base = ROOM_DEFAULTS[type].label;
  const count = level.rooms.filter((r) => r.type === type).length;
  if (type === 'bedroom' || type === 'bathroom') {
    return count === 0 ? base : `${base} ${count + 1}`;
  }
  return count === 0 ? base : `${base} ${count + 1}`;
}

/* -------------------------------------------------------------------------- */
/*                     Redimensionado paramétrico de ambientes                 */
/* -------------------------------------------------------------------------- */

interface AxisPlan {
  axis: 'x' | 'y';
  sign: 1 | -1;
  delta: number;
  neighbors: Room[];
}

function sideNeighbors(level: Level, room: Room, axis: 'x' | 'y', sign: 1 | -1): Room[] | null {
  const eps = 0.03;
  const list = level.rooms.filter((candidate) => {
    if (candidate.id === room.id) return false;
    if (axis === 'x') {
      const edge = sign === 1 ? rectRight(room.rect) : room.rect.x;
      const otherEdge = sign === 1 ? candidate.rect.x : rectRight(candidate.rect);
      if (Math.abs(edge - otherEdge) > eps) return false;
      return (
        candidate.rect.y >= room.rect.y - eps &&
        rectTop(candidate.rect) <= rectTop(room.rect) + eps
      );
    }
    const edge = sign === 1 ? rectTop(room.rect) : room.rect.y;
    const otherEdge = sign === 1 ? candidate.rect.y : rectTop(candidate.rect);
    if (Math.abs(edge - otherEdge) > eps) return false;
    return (
      candidate.rect.x >= room.rect.x - eps &&
      rectRight(candidate.rect) <= rectRight(room.rect) + eps
    );
  });
  if (list.length === 0) return null;
  const span =
    axis === 'x'
      ? list.reduce((acc, r) => acc + r.rect.h, 0)
      : list.reduce((acc, r) => acc + r.rect.w, 0);
  const target = axis === 'x' ? room.rect.h : room.rect.w;
  if (Math.abs(span - target) > 0.06) {
    // Cobertura parcial del borde: no es posible mover el tabique sin romper la planta.
    return null;
  }
  return list;
}

function planAxis(level: Level, room: Room, axis: 'x' | 'y', sign: 1 | -1, delta: number): AxisPlan | null {
  const neighbors = sideNeighbors(level, room, axis, sign);
  if (!neighbors) return null;
  if (delta > 0) {
    const dimension = axis === 'x' ? room.rect.h : room.rect.w;
    let maxShift = Infinity;
    for (const neighbor of neighbors) {
      const neighborDimension = axis === 'x' ? neighbor.rect.h : neighbor.rect.w;
      const neighborArea = rectArea(neighbor.rect);
      const minArea = ROOM_DEFAULTS[neighbor.type]?.minArea ?? 1.5;
      const slack = Math.max(0, neighborArea - minArea);
      maxShift = Math.min(maxShift, slack / Math.max(neighborDimension, 0.1));
    }
    if (maxShift <= 0.01) return null;
    const requestedShift = delta / Math.max(dimension, 0.1);
    return { axis, sign, delta: Math.min(delta, maxShift * dimension), neighbors };
  }
  const minArea = ROOM_DEFAULTS[room.type]?.minArea ?? 1.5;
  const maxShrink = Math.max(0, rectArea(room.rect) - minArea);
  if (maxShrink <= 0.01) return null;
  return { axis, sign, delta: -Math.min(-delta, maxShrink), neighbors };
}

function applyResizePlan(room: Room, plan: AxisPlan): void {
  const { axis, sign, delta, neighbors } = plan;
  if (axis === 'x') {
    const shift = delta / Math.max(room.rect.h, 0.1);
    if (sign === 1) {
      room.rect.w = round(room.rect.w + shift, 3);
      for (const neighbor of neighbors) {
        neighbor.rect.x = round(neighbor.rect.x + shift, 3);
        neighbor.rect.w = round(neighbor.rect.w - shift, 3);
      }
    } else {
      room.rect.x = round(room.rect.x - shift, 3);
      room.rect.w = round(room.rect.w + shift, 3);
      for (const neighbor of neighbors) {
        neighbor.rect.w = round(neighbor.rect.w - shift, 3);
      }
    }
    return;
  }
  const shift = delta / Math.max(room.rect.w, 0.1);
  if (sign === 1) {
    room.rect.h = round(room.rect.h + shift, 3);
    for (const neighbor of neighbors) {
      neighbor.rect.y = round(neighbor.rect.y + shift, 3);
      neighbor.rect.h = round(neighbor.rect.h - shift, 3);
    }
  } else {
    room.rect.y = round(room.rect.y - shift, 3);
    room.rect.h = round(room.rect.h + shift, 3);
    for (const neighbor of neighbors) {
      neighbor.rect.h = round(neighbor.rect.h - shift, 3);
    }
  }
}

function resizeRoom(model: DesignModel, roomId: string, targetArea: number): string[] {
  const { level, room } = findRoom(model, roomId);
  if (room.locked) throw new OperationError(`El ambiente ${room.name} está bloqueado.`);
  const warnings: string[] = [];
  const currentArea = rectArea(room.rect);
  const minArea = ROOM_DEFAULTS[room.type]?.minArea ?? 1.5;
  const target = Math.max(minArea, targetArea);
  const delta = target - currentArea;

  if (Math.abs(delta) < 0.1) {
    return [`${room.name} ya tiene ${currentArea.toFixed(1)} m2.`];
  }

  const directions: Array<{ axis: 'x' | 'y'; sign: 1 | -1 }> = [
    { axis: 'x', sign: 1 },
    { axis: 'y', sign: 1 },
    { axis: 'x', sign: -1 },
    { axis: 'y', sign: -1 },
  ];

  // Estrategia de avance: se acumula superficie desde varias direcciones hasta
  // alcanzar el objetivo o agotar el espacio que los vecinos pueden ceder.
  let remaining = delta;
  let moved = false;

  for (let iteration = 0; iteration < 4 && Math.abs(remaining) > 0.05; iteration += 1) {
    const plans: AxisPlan[] = [];
    for (const direction of directions) {
      const plan = planAxis(level, room, direction.axis, direction.sign, remaining);
      if (plan && Math.abs(plan.delta) > 0.05) plans.push(plan);
    }
    if (plans.length === 0) break;
    plans.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    applyResizePlan(room, plans[0]);
    remaining -= plans[0].delta;
    moved = true;
  }

  if (!moved) {
    throw new OperationError(
      `No es posible cambiar ${room.name} de ${currentArea.toFixed(1)} m2 a ${target.toFixed(
        1,
      )} m2 sin romper la distribución: ningún ambiente vecino puede ceder espacio en toda la longitud del tabique.`,
    );
  }

  synchronizeWalls(level, model.building.footprint, { reservedIds: modelIds(model) });
  pruneFurniture(level);

  if (Math.abs(remaining) > 0.2) {
    warnings.push(
      `Solo fue posible ${delta > 0 ? 'ampliar' : 'reducir'} ${room.name} hasta ${round(
        rectArea(room.rect),
        1,
      )} m2 (objetivo ${target.toFixed(
        1,
      )} m2): los ambientes vecinos alcanzaron su superficie mínima o el límite del terreno.`,
    );
  }

  return warnings;
}

/* -------------------------------------------------------------------------- */
/*                              Otras operaciones                             */
/* -------------------------------------------------------------------------- */

function splitRoom(
  model: DesignModel,
  level: Level,
  donor: Room,
  type: RoomType,
  newArea: number,
  idGen: IdGen,
): Room {
  const recommended = ROOM_DEFAULTS[type]?.minArea ?? 2;
  const hardMin = Math.max(1.5, recommended * 0.65);
  const donorMin = ROOM_DEFAULTS[donor.type]?.minArea ?? 2;
  const donorArea = rectArea(donor.rect);
  const area = clamp(newArea, hardMin, Math.max(hardMin, donorArea - donorMin));
  if (donorArea - area < donorMin - 0.05) {
    throw new OperationError(
      `No hay superficie suficiente en ${donor.name} (${donorArea.toFixed(
        1,
      )} m2) para crear un ambiente de al menos ${hardMin.toFixed(1)} m2.`,
    );
  }

  const profile = STYLE_PROFILES[model.requirements.style] ?? STYLE_PROFILES.modern;
  const wide = donor.rect.w >= donor.rect.h;
  let rect: Room['rect'];
  if (wide) {
    const width = round(area / donor.rect.h, 3);
    rect = {
      x: round(rectRight(donor.rect) - width, 3),
      y: donor.rect.y,
      w: width,
      h: donor.rect.h,
    };
    donor.rect.w = round(donor.rect.w - width, 3);
  } else {
    const height = round(area / donor.rect.w, 3);
    rect = {
      x: donor.rect.x,
      y: round(rectTop(donor.rect) - height, 3),
      w: donor.rect.w,
      h: height,
    };
    donor.rect.h = round(donor.rect.h - height, 3);
  }

  const room: Room = {
    id: idGen('ROOM'),
    name: uniqueRoomName(level, type),
    type,
    level: level.index,
    rect,
    height: donor.height,
    interiorColor: donor.interiorColor,
    floorMaterialId: floorForType(type, profile.floorMaterialId),
    wallMaterialId: donor.wallMaterialId,
    furniture: [],
    locked: false,
  };
  level.rooms.push(room);
  return room;
}

function ensureRoomAccess(level: Level, room: Room, idGen: IdGen): void {
  const walls = roomWalls(level, room.id);
  if (walls.some((w) => w.openings.some((o) => o.kind === 'door'))) return;
  const candidates = walls
    .filter((w) => w.kind === 'internal' && w.roomIds.length === 2)
    .sort(
      (a, b) =>
        Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y) -
        Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y),
    );
  const existing = new Set<string>();
  for (const wall of level.walls) for (const opening of wall.openings) existing.add(opening.id);
  for (const wall of candidates) {
    if (addDoorToWall(wall, existing, 0.9)) return;
  }
}

function addRoom(model: DesignModel, op: Extract<Operation, { op: 'add_room' }>): string[] {
  const level = model.building.levels.find((l) => l.index === op.level) ?? model.building.levels[0];
  if (!level) throw new OperationError('La vivienda no tiene plantas.');
  const idGen = makeIdGen(model);

  const preferred: RoomType[] =
    op.type === 'bedroom'
      ? ['bedroom', 'study', 'living']
      : op.type === 'bathroom'
        ? ['bedroom', 'hall', 'living']
        : ['living', 'dining', 'study', 'bedroom'];

  let donor: Room | undefined;
  for (const type of preferred) {
    const candidates = level.rooms
      .filter((r) => r.type === type && !r.locked && r.type !== 'stairs' && r.type !== 'bathroom')
      .sort((a, b) => rectArea(b.rect) - rectArea(a.rect));
    donor = candidates[0];
    if (donor) break;
  }
  if (!donor) {
    throw new OperationError(
      'No hay un ambiente amplio que pueda dividirse para crear el nuevo espacio. Se sugiere ampliar la huella o el número de plantas.',
    );
  }

  const donorMin = ROOM_DEFAULTS[donor.type]?.minArea ?? 2;
  const newMin = ROOM_DEFAULTS[op.type]?.minArea ?? 2;
  const softMin = Math.max(1.8, newMin * 0.7);
  const maxNewArea = rectArea(donor.rect) - donorMin;
  if (maxNewArea < softMin) {
    throw new OperationError(
      `No hay superficie suficiente en ${donor.name} (${rectArea(donor.rect).toFixed(
        1,
      )} m2) para crear un ambiente nuevo conservando el actual; se sugiere ampliar la huella del proyecto.`,
    );
  }
  const warnings: string[] = [];
  const target = round(Math.max(softMin, Math.min(op.targetArea, maxNewArea * 0.95)), 1);
  if (target < newMin - 0.05) {
    warnings.push(
      `${donor.name} solo permite un ambiente nuevo de ${target.toFixed(
        1,
      )} m2, por debajo del mínimo recomendado (${newMin} m2); requiere revisión profesional.`,
    );
  } else if (target < op.targetArea - 0.1) {
    warnings.push(
      `${donor.name} solo permite un ambiente nuevo de ${target.toFixed(
        1,
      )} m2 sin quedar por debajo de su superficie mínima.`,
    );
  }

  const room = splitRoom(model, level, donor, op.type, target, idGen);
  if (op.name) room.name = op.name;

  synchronizeWalls(level, model.building.footprint, { reservedIds: modelIds(model) });
  ensureRoomAccess(level, room, idGen);
  ensureRoomAccess(level, donor, idGen);

  room.furniture = furnishRoom(room, model.requirements, idGen);

  return [
    `Se creó ${room.name} (${rectArea(room.rect).toFixed(1)} m2) a partir de ${donor.name}.`,
    ...warnings,
  ];
}

function removeRoom(model: DesignModel, roomId: string): string[] {
  const { level, room } = findRoom(model, roomId);
  if (room.locked) throw new OperationError(`${room.name} está bloqueado y no puede eliminarse.`);

  // La superficie liberada se reparte entre los ambientes que cubren por
  // completo uno de los lados del ambiente eliminado, de modo que la planta
  // siga siendo una teselación sin huecos.
  const directions: Array<{ axis: 'x' | 'y'; sign: 1 | -1 }> = [
    { axis: 'x', sign: 1 },
    { axis: 'x', sign: -1 },
    { axis: 'y', sign: 1 },
    { axis: 'y', sign: -1 },
  ];

  for (const direction of directions) {
    const neighbors = sideNeighbors(level, room, direction.axis, direction.sign);
    if (!neighbors || neighbors.length === 0) continue;

    for (const neighbor of neighbors) {
      if (direction.axis === 'x') {
        if (direction.sign === 1) {
          neighbor.rect.x = room.rect.x;
          neighbor.rect.w = round(neighbor.rect.w + room.rect.w, 3);
        } else {
          neighbor.rect.w = round(neighbor.rect.w + room.rect.w, 3);
        }
      } else if (direction.sign === 1) {
        neighbor.rect.y = room.rect.y;
        neighbor.rect.h = round(neighbor.rect.h + room.rect.h, 3);
      } else {
        neighbor.rect.h = round(neighbor.rect.h + room.rect.h, 3);
      }
      // El ambiente cambia de forma: su mobiliario se replantea.
      neighbor.furniture = [];
    }

    level.rooms = level.rooms.filter((candidate) => candidate.id !== room.id);
    synchronizeWalls(level, model.building.footprint, { reservedIds: modelIds(model) });
    const names = neighbors.map((neighbor) => neighbor.name).join(', ');
    return [`Se eliminó ${room.name} y su superficie se integró a ${names}.`];
  }

  throw new OperationError(
    `No es posible eliminar ${room.name} sin dejar un vacío en la planta: ningún grupo de ambientes vecinos cubre por completo uno de sus lados.`,
  );
}

function addWindow(model: DesignModel, op: Extract<Operation, { op: 'add_window' }>): string[] {
  const { level, room } = findRoom(model, op.roomId);
  const walls = roomWalls(level, room.id)
    .filter((w) => w.kind === 'external' && w.roomIds.length === 1)
    .sort(
      (a, b) =>
        Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y) -
        Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y),
    );
  if (walls.length === 0) {
    throw new OperationError(`${room.name} no tiene muro exterior disponible para una ventana.`);
  }
  const wall = walls[0];
  const idGen = makeIdGen(model);
  const id = idGen('OPEN');
  const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
  const width = Math.min(op.width ?? 1.6, length - 0.35);
  if (width < 0.6) throw new OperationError('El muro disponible es demasiado corto para una ventana.');
  const height = Math.min(op.height ?? 1.4, wall.height - 0.2);
  const sill = clamp(op.sill ?? 0.95, 0, wall.height - height);
  const doors = wall.openings.filter((o) => o.kind === 'door');
  const occupiedLeft = doors.reduce((acc, d) => Math.min(acc, d.offset), length);
  const occupiedRight = doors.reduce((acc, d) => Math.max(acc, d.offset + d.width), 0);
  let offset = Math.max(0.15, (length - width) / 2);
  if (doors.length > 0 && occupiedLeft < length / 2) {
    offset = clamp(offset, occupiedRight + 0.25, length - width - 0.15);
  }
  wall.openings.push({
    id,
    kind: 'window',
    wallId: wall.id,
    offset: round(offset, 2),
    width: round(width, 2),
    height: round(height, 2),
    sill: round(sill, 2),
  });
  return [`Se agregó una ventana en ${room.name} (${width.toFixed(2)} m).`];
}

function floorToCeiling(model: DesignModel, op: Extract<Operation, { op: 'windows_floor_to_ceiling' }>): string[] {
  const affected: Room[] = [];
  if (op.scope === 'all') {
    for (const level of model.building.levels) affected.push(...level.rooms);
  } else if (op.scope === 'level') {
    const level = model.building.levels.find((l) => l.index === op.level);
    if (!level) throw new OperationError(`No existe la planta ${op.level}.`);
    affected.push(...level.rooms);
  } else {
    if (!op.roomId) throw new OperationError('Se requiere roomId para el alcance "room".');
    affected.push(findRoom(model, op.roomId).room);
  }

  let changed = 0;
  for (const level of model.building.levels) {
    const roomsHere = new Set(affected.filter((r) => r.level === level.index).map((r) => r.id));
    for (const wall of level.walls) {
      if (!wall.roomIds.some((id) => roomsHere.has(id))) continue;
      if (wall.kind === 'railing') continue;
      const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
      for (const opening of wall.openings) {
        if (opening.kind !== 'window') continue;
        opening.sill = 0.05;
        opening.height = round(wall.height - 0.35, 2);
        opening.width = round(Math.min(Math.max(opening.width, 1.8), length - 0.3), 2);
        opening.offset = round(clamp(opening.offset, 0.1, Math.max(0.1, length - opening.width - 0.1)), 2);
        changed += 1;
      }
    }
  }
  if (changed === 0) {
    throw new OperationError('Los ambientes indicados no tienen ventanas que convertir en ventanales.');
  }
  return [`Se convirtieron ${changed} ventana(s) en ventanales de piso a techo.`];
}

function addDoor(model: DesignModel, op: Extract<Operation, { op: 'add_door' }>): string[] {
  const { level, room } = findRoom(model, op.roomId);
  const idGen = makeIdGen(model);
  const existing = new Set<string>();
  for (const wall of level.walls) for (const opening of wall.openings) existing.add(opening.id);

  let candidates = roomWalls(level, room.id).filter((w) => w.kind === 'internal' && w.roomIds.length === 2);
  if (op.toRoomId) {
    candidates = candidates.filter((w) => w.roomIds.includes(op.toRoomId as string));
  }
  candidates.sort(
    (a, b) =>
      Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y) -
      Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y),
  );
  for (const wall of candidates) {
    if (wall.openings.some((o) => o.kind === 'door')) continue;
    if (addDoorToWall(wall, existing)) {
      return [`Se agregó una puerta en ${room.name}.`];
    }
  }
  throw new OperationError(`No hay un tabique libre donde abrir una puerta en ${room.name}.`);
}

function moveDoor(model: DesignModel, op: Extract<Operation, { op: 'move_door' }>): string[] {
  for (const level of model.building.levels) {
    for (const wall of level.walls) {
      const opening = wall.openings.find((o) => o.id === op.doorId);
      if (!opening) continue;
      const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
      const others = wall.openings.filter((o) => o.id !== opening.id);
      let offset = clamp(opening.offset + op.delta, 0.1, Math.max(0.1, length - opening.width - 0.1));
      const collide = others.some(
        (o) => offset < o.offset + o.width + 0.15 && offset + opening.width + 0.15 > o.offset,
      );
      if (collide) {
        const leftMost = others.filter((o) => o.offset < opening.offset).sort((a, b) => b.offset - a.offset)[0];
        const rightMost = others
          .filter((o) => o.offset > opening.offset)
          .sort((a, b) => a.offset - b.offset)[0];
        offset = clamp(
          opening.offset + op.delta,
          leftMost ? leftMost.offset + leftMost.width + 0.15 : 0.1,
          rightMost ? rightMost.offset - opening.width - 0.15 : length - opening.width - 0.1,
        );
      }
      if (Math.abs(offset - opening.offset) < 0.01) {
        throw new OperationError('La puerta no puede moverse más en esa dirección.');
      }
      opening.offset = round(offset, 2);
      return [`Se movió la puerta ${op.delta > 0 ? 'hacia la derecha' : 'hacia la izquierda'} ${Math.abs(
        op.delta,
      )} m.`];
    }
  }
  throw new OperationError(`No existe la puerta ${op.doorId}.`);
}

function setRoomFloor(model: DesignModel, roomId: string, materialId: string): string[] {
  const material = MATERIAL_INDEX[materialId];
  if (!material || material.category !== 'floor') {
    throw new OperationError(`El material ${materialId} no es un acabado de piso válido.`);
  }
  const { room } = findRoom(model, roomId);
  room.floorMaterialId = materialId;
  return [`${room.name}: piso actualizado a ${material.name}.`];
}

const HEX = /^#[0-9a-f]{6}$/i;

function setRoomColor(model: DesignModel, roomId: string, color: string): string[] {
  if (!HEX.test(color)) throw new OperationError(`Color inválido: ${color}.`);
  const { room } = findRoom(model, roomId);
  room.interiorColor = color;
  return [`${room.name}: muros pintados ${color}.`];
}

function addFurniture(model: DesignModel, roomId: string, type: FurnitureType): string[] {
  const { room } = findRoom(model, roomId);
  const spec = FURNITURE_CATALOG[type];
  if (!spec) throw new OperationError(`Mueble desconocido: ${type}.`);
  if (spec.unique && room.furniture.some((f) => f.type === type)) {
    throw new OperationError(`${room.name} ya tiene ${spec.label}.`);
  }
  const rotated = room.rect.h > room.rect.w;
  const width = rotated ? spec.depth : spec.width;
  const depth = rotated ? spec.width : spec.depth;
  if (width + 0.2 > room.rect.w || depth + 0.2 > room.rect.h) {
    throw new OperationError(`${spec.label} no cabe en ${room.name}.`);
  }
  const idGen = makeIdGen(model);
  room.furniture.push({
    id: idGen('FURN'),
    type,
    roomId: room.id,
    x: round(room.rect.x + room.rect.w / 2, 2),
    y: round(room.rect.y + room.rect.h / 2, 2),
    rotation: rotated ? 90 : 0,
    width: spec.width,
    depth: spec.depth,
    height: spec.height,
  });
  return [`Se agregó ${spec.label} en ${room.name}.`];
}

function applyStyle(model: DesignModel, style: DesignModel['requirements']['style']): string[] {
  const profile = STYLE_PROFILES[style];
  if (!profile) throw new OperationError(`Estilo desconocido: ${style}.`);
  model.requirements.style = style;
  model.building.facadeMaterialId = profile.facadeMaterialId;
  model.building.facadeColor = profile.facadeColor;
  model.building.roof.type = profile.roofType;
  model.building.roof.materialId = profile.roofMaterialId;
  for (const level of model.building.levels) {
    for (const room of level.rooms) {
      room.interiorColor = profile.wallColor;
      room.floorMaterialId = floorForType(room.type, profile.floorMaterialId);
    }
    for (const wall of level.walls) {
      wall.color = profile.wallColor;
    }
  }
  return [`Estilo arquitectónico actualizado a ${profile.label}: se ajustaron acabados y colores.`];
}

function reduceBudget(model: DesignModel, percent: number): string[] {
  const warnings: string[] = [];
  const cheapest = (category: 'floor' | 'facade' | 'roof') =>
    materialsByCategory(category).slice().sort((a, b) => a.unitCost - b.unitCost)[0];
  const floor = cheapest('floor');
  const facade = cheapest('facade');
  const roof = cheapest('roof');
  for (const level of model.building.levels) {
    for (const room of level.rooms) {
      if (room.floorMaterialId !== 'floor.concrete.polished') {
        room.floorMaterialId = floor.id;
      }
    }
  }
  model.building.facadeMaterialId = facade.id;
  model.building.roof.materialId = roof.id;
  for (const level of model.building.levels) {
    for (const room of level.rooms) {
      room.furniture = room.furniture.filter((f) => !['bathtub', 'kitchen_island'].includes(f.type));
    }
  }
  const cost = estimateCost(model);
  if (!cost.withinBudget) {
    warnings.push(
      `Aun con materiales económicos la estimación (${cost.total.toFixed(
        0,
      )} USD) supera el presupuesto (${cost.budget.toFixed(
        0,
      )} USD). Se sugiere reducir el programa (${(percent * 100).toFixed(0)}% solicitado) o el área construida.`,
    );
  }
  return [`Se seleccionaron los materiales de menor costo del catálogo; nueva estimación: ${cost.total.toFixed(0)} USD.`, ...warnings];
}

function addLevel(model: DesignModel): string[] {
  const top = model.building.levels[model.building.levels.length - 1];
  if (!top) throw new OperationError('La vivienda no tiene plantas.');
  if (model.building.levels.length >= 3) throw new OperationError('El MVP admite hasta tres plantas.');
  const idGen = makeIdGen(model);
  const index = top.index + 1;
  const height = top.height;
  const rooms: Room[] = top.rooms.map((room) => ({
    ...room,
    id: idGen('ROOM'),
    level: index,
    furniture: room.furniture.map((item) => ({
      ...item,
      id: idGen('FURN'),
      roomId: '',
    })),
    locked: false,
  }));
  for (const room of rooms) {
    for (const item of room.furniture) item.roomId = room.id;
  }
  const level: Level = {
    index,
    name: `Planta ${index}`,
    height,
    rooms,
    walls: [],
  };
  model.building.levels.push(level);
  model.requirements.levels = model.building.levels.length;
  synchronizeWalls(level, model.building.footprint, { reservedIds: modelIds(model) });
  ensureLevelDoors(level, idGen);
  for (const room of level.rooms) ensureRoomAccess(level, room, idGen);

  // Escalera: el nuevo nivel debe tener circulación vertical alineada.
  const stairsBelow = top.rooms.find((r) => r.type === 'stairs');
  if (stairsBelow && !level.rooms.some((r) => r.type === 'stairs')) {
    const donor = level.rooms
      .filter((r) => !['bathroom', 'garage'].includes(r.type))
      .sort((a, b) => rectArea(b.rect) - rectArea(a.rect))[0];
    if (donor) {
      donor.type = 'stairs';
      donor.name = 'Escalera';
      donor.furniture = [];
    }
  }
  synchronizeWalls(level, model.building.footprint, { reservedIds: modelIds(model) });
  return [`Se agregó la ${level.name} duplicando la planta inferior como base editable.`];
}

/* -------------------------------------------------------------------------- */
/*                                 Aplicación                                 */
/* -------------------------------------------------------------------------- */

/** Aplica una operación sobre el modelo (mutándolo). Lanza OperationError si no es viable. */
export function applyOperation(model: DesignModel, op: Operation): string[] {
  switch (op.op) {
    case 'resize_room':
      return resizeRoom(model, op.roomId, op.targetArea);
    case 'add_room':
      return addRoom(model, op);
    case 'remove_room':
      return removeRoom(model, op.roomId);
    case 'add_window':
      return addWindow(model, op);
    case 'windows_floor_to_ceiling':
      return floorToCeiling(model, op);
    case 'add_door':
      return addDoor(model, op);
    case 'move_door':
      return moveDoor(model, op);
    case 'set_room_floor':
      return setRoomFloor(model, op.roomId, op.materialId);
    case 'set_room_color':
      return setRoomColor(model, op.roomId, op.color);
    case 'set_facade_color':
      if (!HEX.test(op.color)) throw new OperationError(`Color inválido: ${op.color}.`);
      model.building.facadeColor = op.color;
      return [`Fachada pintada ${op.color}.`];
    case 'set_facade_material': {
      const material = MATERIAL_INDEX[op.materialId];
      if (!material || material.category !== 'facade') {
        throw new OperationError(`El material ${op.materialId} no es un acabado de fachada.`);
      }
      model.building.facadeMaterialId = op.materialId;
      return [`Fachada revestida con ${material.name}.`];
    }
    case 'set_roof_material': {
      const material = MATERIAL_INDEX[op.materialId];
      if (!material || material.category !== 'roof') {
        throw new OperationError(`El material ${op.materialId} no es una cubierta válida.`);
      }
      model.building.roof.materialId = op.materialId;
      return [`Cubierta actualizada a ${material.name}.`];
    }
    case 'set_style':
      return applyStyle(model, op.style);
    case 'add_furniture':
      return addFurniture(model, op.roomId, op.type);
    case 'remove_furniture': {
      const { room } = findRoom(model, op.roomId);
      const before = room.furniture.length;
      room.furniture = room.furniture.filter((f) => f.type !== op.type);
      if (room.furniture.length === before) throw new OperationError(`No hay ${op.type} en ${room.name}.`);
      return [`Se retiraron ${before - room.furniture.length} mueble(s) de ${room.name}.`];
    }
    case 'add_level':
      return addLevel(model);
    case 'reduce_budget':
      return reduceBudget(model, op.percent);
    default:
      throw new OperationError('Operación no soportada.');
  }
}

/**
 * Aplica una secuencia de operaciones de forma transaccional: cada operación se
 * ejecuta sobre una copia, se valida y solo entonces se consolida. Una operación
 * que rompe la geometría o deja ambientes inaccesibles se rechaza sin afectar
 * las anteriores.
 */
export function applyOperations(
  model: DesignModel,
  operations: Operation[],
  options: ApplyOptions = {},
): ApplyResult {
  let working = structuredClone(model);
  const applied: Operation[] = [];
  const rejected: Array<{ operation: Operation; reason: string }> = [];
  const warnings: string[] = [];

  for (const operation of operations) {
    const candidate = structuredClone(working);
    try {
      const opWarnings = applyOperation(candidate, operation);
      const report = validateModel(candidate, {
        maxCoverage: options.maxCoverage,
        cost: estimateCost(candidate),
      });
      if (!report.ok) {
        const reason = report.errors[0]?.message ?? 'La operación produce un modelo inválido.';
        rejected.push({ operation, reason });
        if (options.keepValidPrefix === false) {
          throw new OperationError(reason, operation);
        }
        continue;
      }
      working = candidate;
      applied.push(operation);
      warnings.push(...opWarnings);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      rejected.push({ operation, reason });
      if (options.keepValidPrefix === false) {
        throw new OperationError(reason, operation);
      }
    }
  }

  const report: ValidationReport = validateModel(working, {
    maxCoverage: options.maxCoverage,
    cost: estimateCost(working),
  });

  return { model: working, report, applied, rejected, warnings };
}
