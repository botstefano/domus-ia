import { ROOM_DEFAULTS } from './catalog';
import { EPS, rectArea, rectRight, rectTop, sharedEdge } from './geometry';
import type {
  CostReport,
  DesignModel,
  Issue,
  Level,
  Room,
  ValidationReport,
} from './types';
import { getWallLength, validateOpenings } from './walls';

export interface ValidationOptions {
  /** Cobertura máxima permitida sobre el terreno (0-1). */
  maxCoverage?: number;
  /** Estimación de costos para contrastar con el presupuesto del cliente. */
  cost?: CostReport;
  /** Altura máxima de la edificación en metros. */
  maxHeight?: number;
}

const DAYLIGHT_REQUIRED: Record<string, boolean> = {
  bedroom: true,
  living: true,
  dining: true,
  kitchen: true,
  study: true,
};

function issue(
  code: string,
  severity: Issue['severity'],
  message: string,
  elementIds?: string[],
  data?: Record<string, unknown>,
): Issue {
  return { code, severity, message, elementIds, data };
}

/**
 * Verificación geométrica y funcional del modelo. Es la puerta que debe pasar
 * toda operación antes de persistirse.
 */
export function validateModel(model: DesignModel, options: ValidationOptions = {}): ValidationReport {
  const issues: Issue[] = [];
  const { terrain, building } = model;
  const maxCoverage = options.maxCoverage ?? 0.75;
  const maxHeight = options.maxHeight ?? 9.5;

  /* ------------------------------- Terreno -------------------------------- */
  if (terrain.width <= 0 || terrain.depth <= 0) {
    issues.push(issue('TERRAIN_INVALID', 'error', 'Las dimensiones del terreno deben ser positivas.'));
  }

  const footprintArea = rectArea(building.footprint);
  const terrainTotal = terrain.width * terrain.depth;
  const buildableW = terrain.width - terrain.setbacks.left - terrain.setbacks.right;
  const buildableD = terrain.depth - terrain.setbacks.front - terrain.setbacks.back;

  if (buildableW <= 0 || buildableD <= 0) {
    issues.push(
      issue('SETBACK_INVALID', 'error', 'Los retiros configurados no dejan área edificable en el terreno.'),
    );
  }

  const centeredInside =
    building.footprint.x >= terrain.setbacks.left - 0.01 &&
    building.footprint.y >= terrain.setbacks.front - 0.01 &&
    rectRight(building.footprint) <= terrain.setbacks.left + buildableW + 0.01 &&
    rectTop(building.footprint) <= terrain.setbacks.front + buildableD + 0.01;
  if (!centeredInside) {
    issues.push(
      issue(
        'FOOTPRINT_OUT_OF_SETBACK',
        'error',
        'La huella de la vivienda invade los retiros del terreno.',
        undefined,
        { footprint: building.footprint },
      ),
    );
  }

  const coverage = terrainTotal > 0 ? footprintArea / terrainTotal : 0;
  if (coverage > maxCoverage + 1e-6) {
    issues.push(
      issue(
        'COVERAGE_EXCEEDED',
        'warning',
        `La ocupación del suelo (${(coverage * 100).toFixed(1)}%) supera el máximo recomendado (${(
          maxCoverage * 100
        ).toFixed(0)}%).`,
        undefined,
        { coverage, maxCoverage },
      ),
    );
  }

  if (building.levels.length === 0) {
    issues.push(issue('NO_LEVELS', 'error', 'La vivienda no tiene plantas definidas.'));
  }

  /* ----------------------------- Alturas ---------------------------------- */
  const totalHeight = building.levels.reduce((acc, level) => acc + level.height, 0);
  if (totalHeight > maxHeight + 1e-6) {
    issues.push(
      issue(
        'HEIGHT_EXCEEDED',
        'warning',
        `La altura total (${totalHeight.toFixed(2)} m) supera el máximo recomendado (${maxHeight} m).`,
        undefined,
        { totalHeight, maxHeight },
      ),
    );
  }

  /* ---------------------------- Por planta -------------------------------- */
  for (const level of building.levels) {
    const seen = new Set<string>();
    for (const room of level.rooms) {
      if (seen.has(room.id)) {
        issues.push(issue('ROOM_DUPLICATE_ID', 'error', `Identificador duplicado: ${room.id}.`, [room.id]));
      }
      seen.add(room.id);

      const area = rectArea(room.rect);
      const defaults = ROOM_DEFAULTS[room.type];
      if (area <= EPS) {
        issues.push(
          issue('ROOM_EMPTY', 'error', `El ambiente ${room.name} no tiene superficie.`, [room.id]),
        );
      } else if (defaults && area < defaults.minArea * 0.85) {
        issues.push(
          issue(
            'ROOM_TOO_SMALL',
            'warning',
            `${room.name} tiene ${area.toFixed(1)} m2 y el mínimo recomendado es ${defaults.minArea} m2.`,
            [room.id],
            { area, minArea: defaults.minArea },
          ),
        );
      }

      if (area > EPS && area < 1.5) {
        issues.push(
          issue(
            'ROOM_UNUSABLE',
            'error',
            `${room.name} tiene ${area.toFixed(2)} m2 y no es un ambiente habitable.`,
            [room.id],
          ),
        );
      }

      const inside =
        room.rect.x >= building.footprint.x - 0.02 &&
        room.rect.y >= building.footprint.y - 0.02 &&
        rectRight(room.rect) <= rectRight(building.footprint) + 0.02 &&
        rectTop(room.rect) <= rectTop(building.footprint) + 0.02;
      if (!inside) {
        issues.push(
          issue('ROOM_OUT_OF_FOOTPRINT', 'error', `${room.name} excede la huella de la vivienda.`, [room.id]),
        );
      }

      for (const other of level.rooms) {
        if (other.id <= room.id) continue;
        // Tolerancia de 3 cm por dimensión: absorbe el redondeo de la geometría y
        // evita reportar solapamientos inexistentes en la práctica.
        const overlapW =
          Math.min(rectRight(room.rect), rectRight(other.rect)) -
          Math.max(room.rect.x, other.rect.x);
        const overlapH =
          Math.min(rectTop(room.rect), rectTop(other.rect)) -
          Math.max(room.rect.y, other.rect.y);
        if (overlapW > 0.03 && overlapH > 0.03) {
          issues.push(
            issue(
              'ROOM_OVERLAP',
              'error',
              `${room.name} se superpone con ${other.name}.`,
              [room.id, other.id],
            ),
          );
        }
      }
    }

    /* ------------------------------- Muros -------------------------------- */
    for (const wall of level.walls) {
      if (getWallLength(wall) < 0.2) {
        issues.push(issue('WALL_DEGENERATE', 'error', `El muro ${wall.id} no tiene longitud.`, [wall.id]));
      }
      for (const point of [wall.from, wall.to]) {
        const inside =
          point.x >= building.footprint.x - 0.02 &&
          point.y >= building.footprint.y - 0.02 &&
          point.x <= rectRight(building.footprint) + 0.02 &&
          point.y <= rectTop(building.footprint) + 0.02;
        if (!inside) {
          issues.push(
            issue('WALL_OUT_OF_FOOTPRINT', 'error', `El muro ${wall.id} sale de la huella edificada.`, [wall.id]),
          );
        }
      }
    }
    for (const problem of validateOpenings(level.walls)) {
      issues.push(issue('OPENING_INVALID', 'error', problem));
    }

    /* -------------------------- Funcionalidad ------------------------------ */
    for (const room of level.rooms) {
      const roomWalls = level.walls.filter((w) => w.roomIds.includes(room.id));
      const hasWindow = roomWalls.some((w) =>
        w.openings.some((o) => o.kind === 'window'),
      );
      if (DAYLIGHT_REQUIRED[room.type] && !hasWindow) {
        issues.push(
          issue(
            'ROOM_NO_DAYLIGHT',
            'warning',
            `${room.name} no tiene iluminación natural directa (sin ventanas en fachada).`,
            [room.id],
          ),
        );
      }
    }
  }

  /* ---------------------- Conectividad y accesibilidad --------------------- */
  const unreachable = findUnreachableRooms(building.levels);
  for (const room of unreachable) {
    issues.push(
      issue(
        'ROOM_UNREACHABLE',
        'error',
        `No se puede acceder a ${room.name}: no tiene puertas ni comunicación con el resto de la vivienda.`,
        [room.id],
      ),
    );
  }

  const ground = building.levels[0];
  const hasEntrance = ground?.walls.some(
    (w) => w.kind === 'external' && w.openings.some((o) => o.kind === 'door' && o.height >= 1.9),
  );
  if (ground && !hasEntrance) {
    issues.push(
      issue('NO_ENTRANCE', 'warning', 'La vivienda no tiene una puerta de acceso desde el exterior.'),
    );
  }

  /* --------------------------- Escaleras alineadas ------------------------- */
  if (building.levels.length > 1) {
    const base = building.levels[0].rooms.find((r) => r.type === 'stairs');
    if (!base) {
      issues.push(
        issue('NO_STAIRS', 'error', 'Una vivienda de varios niveles requiere una escalera en planta baja.'),
      );
    } else {
      for (let i = 1; i < building.levels.length; i += 1) {
        const stairs = building.levels[i].rooms.find((r) => r.type === 'stairs');
        if (!stairs) {
          issues.push(
            issue('NO_STAIRS_LEVEL', 'error', `La ${building.levels[i].name} no tiene escalera.`, [base.id]),
          );
        } else if (
          Math.abs(stairs.rect.x - base.rect.x) > 0.2 ||
          Math.abs(stairs.rect.y - base.rect.y) > 0.2
        ) {
          issues.push(
            issue(
              'STAIRS_MISALIGNED',
              'warning',
              'La escalera no está alineada entre plantas, lo que puede imposibilitar el recorrido vertical.',
              [base.id, stairs.id],
            ),
          );
        }
      }
    }
  }

  /* ------------------------------ Presupuesto ------------------------------ */
  if (options.cost && !options.cost.withinBudget) {
    issues.push(
      issue(
        'BUDGET_EXCEEDED',
        'warning',
        `La estimación (${options.cost.total.toFixed(0)} USD) supera el presupuesto declarado (${options.cost.budget.toFixed(
          0,
        )} USD).`,
        undefined,
        { total: options.cost.total, budget: options.cost.budget },
      ),
    );
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return {
    ok: errors.length === 0,
    issues,
    errors,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Accesibilidad: grafo donde los ambientes son nodos y los muros con puerta son
 * aristas. Las terrazas se consideran accesibles si comparten borde con un
 * ambiente accesible. Las escaleras conectan plantas.
 */
export function findUnreachableRooms(levels: Level[]): Room[] {
  const allRooms = levels.flatMap((l) => l.rooms);
  const roomIndex = new Map(allRooms.map((r) => [r.id, r]));
  const adjacency = new Map<string, Set<string>>();
  for (const room of allRooms) adjacency.set(room.id, new Set());

  for (const level of levels) {
    for (const wall of level.walls) {
      if (wall.roomIds.length !== 2) continue;
      const hasDoor = wall.openings.some((o) => o.kind === 'door');
      const [a, b] = wall.roomIds.map((id) => roomIndex.get(id));
      if (!a || !b) continue;
      const terrace = a.type === 'terrace' || b.type === 'terrace';
      if (hasDoor || terrace) {
        adjacency.get(a.id)?.add(b.id);
        adjacency.get(b.id)?.add(a.id);
      }
    }
    // Vecindad adicional para terrazas (no requieren puerta).
    for (const room of level.rooms) {
      if (room.type !== 'terrace') continue;
      for (const other of level.rooms) {
        if (other.id === room.id) continue;
        if (sharedEdge(room.rect, other.rect)) {
          adjacency.get(room.id)?.add(other.id);
          adjacency.get(other.id)?.add(room.id);
        }
      }
    }
  }

  for (let i = 1; i < levels.length; i += 1) {
    const a = levels[i - 1].rooms.find((r) => r.type === 'stairs');
    const b = levels[i].rooms.find((r) => r.type === 'stairs');
    if (a && b) {
      adjacency.get(a.id)?.add(b.id);
      adjacency.get(b.id)?.add(a.id);
    }
  }

  const ground = levels[0];
  const entrance =
    ground?.rooms.find((r) => r.type === 'hall') ??
    ground?.rooms.find((r) => r.type === 'living') ??
    ground?.rooms[0];
  if (!entrance) return [];

  const visited = new Set<string>([entrance.id]);
  const queue = [entrance.id];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }

  return allRooms.filter((room) => !visited.has(room.id));
}

/** Lanza una excepción si el modelo tiene errores de validación. */
export class ModelValidationError extends Error {
  constructor(public readonly report: ValidationReport) {
    super(report.errors.map((e) => e.message).join(' | '));
    this.name = 'ModelValidationError';
  }
}

export function assertValid(model: DesignModel, options: ValidationOptions = {}): ValidationReport {
  const report = validateModel(model, options);
  if (!report.ok) throw new ModelValidationError(report);
  return report;
}
