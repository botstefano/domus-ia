import { ROOM_DEFAULTS, STYLE_PROFILES } from './catalog';
import { rectArea, rectRight, rectTop, round } from './geometry';
import type { DesignModel, Level, Room, RoomType } from './types';
import { getWallLength } from './walls';

const ROOM_FILL: Record<RoomType, string> = {
  hall: '#f4ecd8',
  living: '#f7e2c2',
  dining: '#f8e7c9',
  kitchen: '#dde9f0',
  bedroom: '#e9e2f4',
  bathroom: '#d6ecf0',
  garage: '#dcdcdc',
  terrace: '#cfe8c9',
  stairs: '#ececec',
  laundry: '#e3eef2',
  study: '#e6efe0',
  storage: '#eeeeee',
};

export interface PlanSvgOptions {
  width?: number;
  padding?: number;
  includeFurniture?: boolean;
  includeDimensions?: boolean;
  includeTitle?: boolean;
  background?: string;
}

/**
 * Genera la planta arquitectónica preliminar en SVG a partir de la geometría del
 * modelo (no a partir de imágenes generadas por IA).
 */
export function renderPlanSvg(
  model: DesignModel,
  level: 0 | number,
  options: PlanSvgOptions = {},
): string {
  const levelData: Level | undefined = model.building.levels.find((l) => l.index === level);
  if (!levelData) return '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';

  const width = options.width ?? 1100;
  const padding = options.padding ?? 48;
  const terrain = model.terrain;
  const scale = (width - padding * 2) / Math.max(terrain.width, 1);
  const height = Math.round(terrain.depth * scale + padding * 2 + (options.includeTitle ? 44 : 0));

  const px = (x: number) => round(padding + x * scale, 2);
  const py = (y: number) => round(padding + (terrain.depth - y) * scale, 2);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Inter, Arial, sans-serif">`,
  );
  parts.push(`<rect width="${width}" height="${height}" fill="${options.background ?? '#ffffff'}"/>`);

  if (options.includeTitle) {
    parts.push(
      `<text x="${padding}" y="32" font-size="18" font-weight="600" fill="#1f2937">${escapeXml(
        levelData.name,
      )} — ${escapeXml(STYLE_PROFILES[model.requirements.style]?.label ?? '')}</text>`,
    );
  }

  // Terreno
  parts.push(
    `<rect x="${px(0)}" y="${py(terrain.depth)}" width="${round(terrain.width * scale, 2)}" height="${round(
      terrain.depth * scale,
      2,
    )}" fill="#f6f7f4" stroke="#b9c0b4" stroke-width="1.5"/>`,
  );

  if (model.site.garden) {
    const g = model.site.garden;
    parts.push(
      `<rect x="${px(g.x)}" y="${py(g.y + g.h)}" width="${round(g.w * scale, 2)}" height="${round(
        g.h * scale,
        2,
      )}" fill="#e4f0dc" stroke="#a8c79a" stroke-dasharray="4 3"/>`,
    );
    parts.push(
      `<text x="${px(g.x + 0.4)}" y="${py(g.y + g.h - 0.4)}" font-size="11" fill="#6b8f5a">Jardín</text>`,
    );
  }
  if (model.site.driveway) {
    const d = model.site.driveway;
    parts.push(
      `<rect x="${px(d.x)}" y="${py(d.y + d.h)}" width="${round(d.w * scale, 2)}" height="${round(
        d.h * scale,
        2,
      )}" fill="#eceae5" stroke="#c9c4ba" stroke-dasharray="4 3"/>`,
    );
  }

  // Ambientes
  for (const room of levelData.rooms) {
    const r = room.rect;
    const area = rectArea(r);
    parts.push(
      `<rect x="${px(r.x)}" y="${py(r.y + r.h)}" width="${round(r.w * scale, 2)}" height="${round(
        r.h * scale,
        2,
      )}" fill="${ROOM_FILL[room.type] ?? '#f4f4f4'}" fill-opacity="0.9" stroke="none"/>`,
    );
    const cx = px(r.x + r.w / 2);
    const cy = py(r.y + r.h / 2);
    parts.push(
      `<text x="${cx}" y="${cy - 3}" font-size="${Math.max(9, Math.min(13, r.w * scale * 0.16))}" text-anchor="middle" fill="#2b2b2b" font-weight="600">${escapeXml(
        room.name,
      )}</text>`,
    );
    parts.push(
      `<text x="${cx}" y="${cy + 12}" font-size="10" text-anchor="middle" fill="#5c5c5c">${area.toFixed(
        1,
      )} m²</text>`,
    );
    if (options.includeDimensions !== false) {
      parts.push(
        `<text x="${cx}" y="${cy + 25}" font-size="9" text-anchor="middle" fill="#8a8a8a">${r.w.toFixed(
          2,
        )} × ${r.h.toFixed(2)} m</text>`,
      );
    }
  }

  // Muebles
  if (options.includeFurniture) {
    for (const room of levelData.rooms) {
      for (const item of room.furniture) {
        const rotated = Math.abs(item.rotation % 180) === 90;
        const w = (rotated ? item.depth : item.width) * scale;
        const d = (rotated ? item.width : item.depth) * scale;
        parts.push(
          `<rect x="${round(px(item.x) - w / 2, 2)}" y="${round(py(item.y) - d / 2, 2)}" width="${round(
            w,
            2,
          )}" height="${round(d, 2)}" fill="#ffffff" fill-opacity="0.55" stroke="#b3a894" stroke-width="0.8" rx="2"/>`,
        );
      }
    }
  }

  // Muros
  for (const wall of levelData.walls) {
    const strokeWidth = Math.max(1.5, wall.thickness * scale);
    const dash = wall.kind === 'railing' ? ' stroke-dasharray="6 4"' : '';
    const color = wall.kind === 'external' ? '#2f2f2f' : wall.kind === 'internal' ? '#5f5f5f' : '#8d8d8d';
    parts.push(
      `<line x1="${px(wall.from.x)}" y1="${py(wall.from.y)}" x2="${px(wall.to.x)}" y2="${py(
        wall.to.y,
      )}" stroke="${color}" stroke-width="${round(strokeWidth, 2)}" stroke-linecap="square"${dash}/>`,
    );
  }

  // Vanos
  for (const wall of levelData.walls) {
    const length = getWallLength(wall);
    if (length <= 0) continue;
    const ux = (wall.to.x - wall.from.x) / length;
    const uy = (wall.to.y - wall.from.y) / length;
    for (const opening of wall.openings) {
      const x1 = wall.from.x + ux * opening.offset;
      const y1 = wall.from.y + uy * opening.offset;
      const x2 = wall.from.x + ux * (opening.offset + opening.width);
      const y2 = wall.from.y + uy * (opening.offset + opening.width);
      const stroke = opening.kind === 'door' ? '#ffffff' : '#9cc7d9';
      parts.push(
        `<line x1="${px(x1)}" y1="${py(y1)}" x2="${px(x2)}" y2="${py(
          y2,
        )}" stroke="${stroke}" stroke-width="${round(Math.max(2, wall.thickness * scale), 2)}"/>`,
      );
      if (opening.kind === 'window') {
        parts.push(
          `<line x1="${px(x1)}" y1="${py(y1)}" x2="${px(x2)}" y2="${py(
            y2,
          )}" stroke="#3f7f96" stroke-width="1" stroke-dasharray="2 2"/>`,
        );
      }
    }
  }

  // Cota general de la vivienda
  const fp = model.building.footprint;
  const cotaY = py(fp.y) + 26;
  parts.push(
    `<line x1="${px(fp.x)}" y1="${cotaY}" x2="${px(fp.x + fp.w)}" y2="${cotaY}" stroke="#7b8794" stroke-width="1"/>`,
  );
  parts.push(
    `<text x="${px(fp.x + fp.w / 2)}" y="${cotaY + 13}" font-size="10" text-anchor="middle" fill="#5f6b76">${fp.w.toFixed(
      2,
    )} m</text>`,
  );
  const cotaX = px(fp.x + fp.w) + 18;
  parts.push(
    `<line x1="${cotaX}" y1="${py(fp.y)}" x2="${cotaX}" y2="${py(fp.y + fp.h)}" stroke="#7b8794" stroke-width="1"/>`,
  );
  parts.push(
    `<text x="${cotaX + 5}" y="${py(fp.y + fp.h / 2)}" font-size="10" fill="#5f6b76">${fp.h.toFixed(
      2,
    )} m</text>`,
  );

  // Leyenda de superficies
  const builtArea = levelData.rooms.reduce((acc, room) => acc + rectArea(room.rect), 0);
  parts.push(
    `<text x="${padding}" y="${height - 12}" font-size="10" fill="#6b7280">Planta ${level} · Superficie ${builtArea.toFixed(
      1,
    )} m² · Escala gráfica 1:${Math.round(100 / scale)} (referencial) · Documento preliminar</text>`,
  );

  parts.push('</svg>');
  return parts.join('\n');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface RoomSummary {
  id: string;
  name: string;
  type: RoomType;
  level: number;
  area: number;
  width: number;
  depth: number;
  percentage: number;
  furniture: number;
  doors: number;
  windows: number;
  minArea: number;
}

/** Cuadro de áreas y elementos por ambiente (usado en fichas y presupuestos). */
export function summarizeRooms(model: DesignModel): RoomSummary[] {
  const total = model.building.levels.reduce(
    (acc, level) => acc + level.rooms.reduce((sum, room) => sum + rectArea(room.rect), 0),
    0,
  );
  const summaries: RoomSummary[] = [];
  for (const level of model.building.levels) {
    for (const room of level.rooms) {
      const area = rectArea(room.rect);
      const walls = level.walls.filter((w) => w.roomIds.includes(room.id));
      summaries.push({
        id: room.id,
        name: room.name,
        type: room.type,
        level: level.index,
        area: round(area, 2),
        width: room.rect.w,
        depth: room.rect.h,
        percentage: total > 0 ? round((area / total) * 100, 1) : 0,
        furniture: room.furniture.length,
        doors: walls.reduce((acc, w) => acc + w.openings.filter((o) => o.kind === 'door').length, 0),
        windows: walls.reduce((acc, w) => acc + w.openings.filter((o) => o.kind === 'window').length, 0),
        minArea: ROOM_DEFAULTS[room.type]?.minArea ?? 0,
      });
    }
  }
  return summaries;
}

/** Área de un ambiente concreo (helper usado por el comparador de versiones). */
export function roomArea(room: Room): number {
  return rectArea(room.rect);
}

/** Envolvente de la huella en formato {x0,y0,x1,y1}. */
export function footprintBox(model: DesignModel) {
  const fp = model.building.footprint;
  return { x0: fp.x, y0: fp.y, x1: rectRight(fp), y1: rectTop(fp) };
}
