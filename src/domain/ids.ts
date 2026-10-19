/** Generación determinista de identificadores legibles. */

/** Generador de identificadores libres (prefijo -> id único). */
export type IdGen = (prefix: string) => string;

export class IdSeq {
  private counters = new Map<string, number>();

  constructor(private readonly start = 1) {}

  next(prefix: string): string {
    const current = this.counters.get(prefix) ?? this.start - 1;
    const value = current + 1;
    this.counters.set(prefix, value);
    return `${prefix}-${String(value).padStart(3, '0')}`;
  }
}

const NUMERIC_SUFFIX = /^([A-Z]+)-(\d+)$/;

/** Devuelve el siguiente identificador libre para un prefijo, sin colisiones. */
export function nextFreeId(existingIds: Iterable<string>, prefix: string): string {
  let max = 0;
  for (const id of existingIds) {
    const match = NUMERIC_SUFFIX.exec(id);
    if (match && match[1] === prefix) {
      max = Math.max(max, Number(match[2]));
    }
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

export function collectIds(model: {
  building: { levels: Array<{ rooms: Array<{ id: string; furniture: Array<{ id: string }> }>; walls: Array<{ id: string; openings: Array<{ id: string }> }> }> };
}): string[] {
  const ids: string[] = [];
  for (const level of model.building.levels) {
    for (const room of level.rooms) {
      ids.push(room.id);
      for (const item of room.furniture) ids.push(item.id);
    }
    for (const wall of level.walls) {
      ids.push(wall.id);
      for (const opening of wall.openings) ids.push(opening.id);
    }
  }
  return ids;
}

export function nameSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
