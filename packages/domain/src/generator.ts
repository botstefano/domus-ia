import { ROOM_DEFAULTS, STYLE_PROFILES } from './catalog';
import { furnishRoom } from './furnish';
import { rectArea, rectRight, rectTop, round } from './geometry';
import { IdSeq } from './ids';
import { layoutLevels } from './layout';
import { buildProgram, type ProgramItem } from './program';
import type {
  Building,
  DesignModel,
  Level,
  Requirements,
  Room,
  RoomType,
  SiteLayout,
  Terrain,
} from './types';
import { addOpenings, deriveWalls } from './walls';

export interface GenerateInput {
  projectId: string;
  requirements: Requirements;
  terrain: Terrain;
  version?: number;
  seed?: number;
  modelId?: string;
}

function floorFor(type: RoomType, styleFloor: string): string {
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

function levelHeightFor(level: number): number {
  return level === 0 ? 2.9 : 2.8;
}

/**
 * Genera un modelo arquitectónico completo y determinista a partir de los
 * requisitos y el terreno. Es la única puerta de entrada del motor geométrico
 * para crear una vivienda desde cero.
 */
export function generateDesign(input: GenerateInput): DesignModel {
  const { projectId, requirements, terrain } = input;
  const seq = new IdSeq();
  const nextId = (prefix: string) => seq.next(prefix);
  const profile = STYLE_PROFILES[requirements.style] ?? STYLE_PROFILES.modern;
  const plan = buildProgram(requirements, terrain);

  const byLevel = new Map<number, ProgramItem[]>();
  for (const item of plan.items) {
    const list = byLevel.get(item.level) ?? [];
    list.push(item);
    byLevel.set(item.level, list);
  }

  const layouts = layoutLevels(byLevel, plan.footprint);
  const levels: Level[] = [];
  const warnings = [...plan.warnings];

  for (const layout of layouts) {
    const height = levelHeightFor(layout.level);
    const rooms: Room[] = layout.placements.map((placement) => {
      const type = placement.item.type;
      const room: Room = {
        id: seq.next('ROOM'),
        name: placement.item.name,
        type,
        level: layout.level,
        rect: {
          x: round(placement.rect.x, 2),
          y: round(placement.rect.y, 2),
          w: round(placement.rect.w, 2),
          h: round(placement.rect.h, 2),
        },
        height: Math.min(ROOM_DEFAULTS[type].height, height),
        interiorColor: profile.wallColor,
        floorMaterialId: floorFor(type, profile.floorMaterialId),
        wallMaterialId: 'wall.paint.white',
        furniture: [],
        locked: false,
      };
      return room;
    });

    for (const room of rooms) {
      if (room.type === 'stairs') continue;
      room.furniture = furnishRoom(room, requirements, nextId);
    }

    const walls = deriveWalls(rooms, plan.footprint, nextId, height);
    addOpenings(rooms, walls, nextId, {
      style: requirements.style,
      levelHeight: height,
      floorToCeiling: profile.floorToCeilingWindows,
    });

    levels.push({
      index: layout.level,
      name: layout.level === 0 ? 'Planta baja' : `Planta ${layout.level}`,
      height,
      rooms,
      walls,
    });
  }

  const building: Building = {
    footprint: {
      x: round(plan.footprint.x, 2),
      y: round(plan.footprint.y, 2),
      w: round(plan.footprint.w, 2),
      h: round(plan.footprint.h, 2),
    },
    levels,
    roof: {
      type: profile.roofType,
      pitch: profile.roofType === 'gabled' ? 25 : 3,
      materialId: profile.roofMaterialId,
      overhang: 0.5,
    },
    facadeMaterialId: profile.facadeMaterialId,
    facadeColor: profile.facadeColor,
  };

  const site = buildSite(requirements, terrain, building, plan.footprint);

  if (building.levels.length > 1) {
    const stairsGround = building.levels[0].rooms.find((r) => r.type === 'stairs');
    for (let i = 1; i < building.levels.length; i += 1) {
      const stairs = building.levels[i].rooms.find((r) => r.type === 'stairs');
      if (stairsGround && stairs) {
        const same =
          Math.abs(stairs.rect.x - stairsGround.rect.x) < 0.05 &&
          Math.abs(stairs.rect.y - stairsGround.rect.y) < 0.05;
        if (!same) {
          warnings.push(
            'La escalera no quedó alineada verticalmente; revise la circulación entre plantas.',
          );
        }
      }
    }
  }

  const builtArea = levels.reduce(
    (acc, level) => acc + level.rooms.reduce((sum, r) => sum + rectArea(r.rect), 0),
    0,
  );
  if (builtArea <= 0) {
    warnings.push('No se pudo generar superficie construida con los requisitos indicados.');
  }

  return {
    id: input.modelId ?? 'MODEL-001',
    projectId,
    version: input.version ?? 1,
    createdAt: new Date().toISOString(),
    terrain,
    requirements,
    building,
    site,
    meta: {
      generator: 'domus-parametric-engine/1.0',
      seed: input.seed ?? 1,
      style: requirements.style,
      units: 'm',
      warnings,
    },
  };
}

function buildSite(
  requirements: Requirements,
  terrain: Terrain,
  building: Building,
  footprint: { x: number; y: number; w: number; h: number },
): SiteLayout {
  const site: SiteLayout = {};
  const rearStart = round(rectTop(footprint), 2);
  const rearDepth = round(terrain.depth - terrain.setbacks.back - rearStart, 2);

  if (requirements.features.includes('garden') && rearDepth > 1.5) {
    site.garden = {
      x: terrain.setbacks.left,
      y: rearStart,
      w: round(terrain.width - terrain.setbacks.left - terrain.setbacks.right, 2),
      h: rearDepth,
    };
  }

  const garage = building.levels[0]?.rooms.find((r) => r.type === 'garage');
  if (garage && footprint.y - terrain.setbacks.front > 0.5) {
    site.driveway = {
      x: round(garage.rect.x, 2),
      y: terrain.setbacks.front,
      w: round(Math.min(garage.rect.w, 4.2), 2),
      h: round(footprint.y - terrain.setbacks.front, 2),
    };
  }

  return site;
}

/** Área construida total del modelo (m2). */
export function builtArea(model: DesignModel): number {
  return model.building.levels.reduce(
    (acc, level) => acc + level.rooms.reduce((sum, room) => sum + rectArea(room.rect), 0),
    0,
  );
}

/** Área del terreno (m2). */
export function terrainArea(terrain: Terrain): number {
  return terrain.width * terrain.depth;
}

/** Área libre del terreno (m2). */
export function freeArea(model: DesignModel): number {
  return Math.max(0, terrainArea(model.terrain) - rectArea(model.building.footprint));
}

/** Huella ocupada respecto del terreno (0-1). */
export function coverage(model: DesignModel): number {
  const total = terrainArea(model.terrain);
  if (total <= 0) return 0;
  return rectArea(model.building.footprint) / total;
}

export function footprintBounds(footprint: { x: number; y: number; w: number; h: number }) {
  return {
    x0: footprint.x,
    y0: footprint.y,
    x1: rectRight(footprint),
    y1: rectTop(footprint),
  };
}
