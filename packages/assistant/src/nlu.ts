import {
  MATERIALS,
  ROOM_DEFAULTS,
  type DesignModel,
  type FurnitureType,
  type Operation,
  type Requirements,
  type Room,
  type RoomType,
  type StyleId,
  type Terrain,
} from '@domus/domain';
import type { InterpretationContext, ParsedIntent } from './types';

/* -------------------------------------------------------------------------- */
/*                                 Utilidades                                 */
/* -------------------------------------------------------------------------- */

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  veinte: 20,
};

const NUMBER_PATTERN =
  '(\\d+(?:[.,]\\d+)?|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|veinte)';

/** Normaliza el texto: minúsculas, sin tildes, sin signos redundantes. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[×✕]/g, 'x')
    .replace(/²/g, '2')
    .replace(/[“”„]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseNumber(token: string | undefined, fallback = NaN): number {
  if (!token) return fallback;
  const cleaned = token.replace(',', '.');
  if (/^\d/.test(cleaned)) {
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : fallback;
  }
  return NUMBER_WORDS[token] ?? fallback;
}

function match(text: string, pattern: RegExp): RegExpExecArray | null {
  return pattern.exec(text);
}

/* --------------------------- Léxico de ambientes --------------------------- */

const ROOM_LEXICON: Array<{ type: RoomType; words: string[] }> = [
  { type: 'kitchen', words: ['cocina'] },
  { type: 'dining', words: ['comedor'] },
  { type: 'living', words: ['sala', 'salon', 'estar'] },
  { type: 'bedroom', words: ['dormitorio', 'habitacion', 'cuarto', 'recamara'] },
  { type: 'bathroom', words: ['bano', 'banos', 'aseo', 'servicio higienico'] },
  { type: 'garage', words: ['cochera', 'garaje', 'estacionamiento'] },
  { type: 'terrace', words: ['terraza'] },
  { type: 'study', words: ['estudio', 'escritorio'] },
  { type: 'laundry', words: ['lavanderia'] },
  { type: 'hall', words: ['hall', 'recibidor', 'entrada'] },
  { type: 'stairs', words: ['escalera'] },
  { type: 'storage', words: ['deposito', 'almacen'] },
];

/** Devuelve el tipo de ambiente mencionado y su posición en el texto. */
export function detectRoomType(text: string): { type: RoomType; index: number } | null {
  let best: { type: RoomType; index: number } | null = null;
  for (const entry of ROOM_LEXICON) {
    for (const word of entry.words) {
      const pattern = new RegExp(`\\b${word}\\b`);
      const found = pattern.exec(text);
      if (found && (best === null || found.index < best.index)) {
        best = { type: entry.type, index: found.index };
      }
    }
  }
  return best;
}

/* ------------------------------ Estilos y colores -------------------------- */

const STYLE_WORDS: Array<[RegExp, StyleId]> = [
  [/minimalista/, 'minimalist'],
  [/mediterran/, 'mediterranean'],
  [/industrial/, 'industrial'],
  [/nordic|escandinav/, 'nordic'],
  [/clasic|tradicional/, 'classic'],
  [/modern/, 'modern'],
];

const COLOR_WORDS: Array<[RegExp, string]> = [
  [/blanc/, '#f3f1ec'],
  [/gris/, '#d5d5d2'],
  [/beige|arena|marfil/, '#e4d8c3'],
  [/negro|oscuro/, '#33352f'],
  [/azul/, '#b8cfe0'],
  [/verde/, '#c9d8c0'],
  [/madera|marron|cafe/, '#b98b5e'],
];

const FLOOR_WORDS: Array<[RegExp, string]> = [
  [/porcelanato|porcelanic/, 'floor.porcelain.matte'],
  [/ceramic/, 'floor.ceramic.standard'],
  [/marmol/, 'floor.marble.carrara'],
  [/madera|laminado|parquet/, 'floor.laminate.oak'],
  [/vinilic|vinilo/, 'floor.vinyl.grey'],
  [/concreto|cemento/, 'floor.concrete.polished'],
];

const FACADE_WORDS: Array<[RegExp, string]> = [
  [/piedra|travertino/, 'facade.stone.travertine'],
  [/ladrillo/, 'facade.brick.cladding'],
  [/madera|celosia/, 'facade.wood.slats'],
  [/vidrio|cristal/, 'facade.glass.curtain'],
  [/estuco/, 'facade.stucco.sand'],
];

const ROOF_WORDS: Array<[RegExp, string]> = [
  [/teja|terracota/, 'roof.tile.terracotta'],
  [/metal|zinc|acero/, 'roof.metal.deck'],
  [/losa|concreto/, 'roof.slab.concrete'],
];

const FURNITURE_WORDS: Array<[RegExp, FurnitureType]> = [
  [/isla (central|de cocina)|isla/, 'kitchen_island'],
  [/tina|banera/, 'bathtub'],
  [/sofa|living|sillon/, 'sofa'],
  [/mesa de comedor/, 'dining_table'],
  [/escritorio/, 'desk'],
  [/closet|ropero|armario/, 'wardrobe'],
  [/lavadora/, 'washing_machine'],
];

function colorFrom(text: string): string | null {
  for (const [pattern, color] of COLOR_WORDS) {
    if (pattern.test(text)) return color;
  }
  return null;
}

function firstMatch<T>(table: Array<[RegExp, T]>, text: string): T | null {
  for (const [pattern, value] of table) {
    if (pattern.test(text)) return value;
  }
  return null;
}

function styleFrom(text: string): StyleId | null {
  return firstMatch(STYLE_WORDS, text);
}

/* --------------------------- Resolución de ambientes ----------------------- */

export function roomsOfType(model: DesignModel, type: RoomType): Room[] {
  return model.building.levels.flatMap((level) => level.rooms.filter((room) => room.type === type));
}

export function resolveRoom(model: DesignModel, type: RoomType): Room | null {
  const candidates = roomsOfType(model, type).filter((room) => !room.locked);
  if (candidates.length === 0) return null;
  return candidates.slice().sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h)[0];
}

function levelFrom(text: string, fallback: number): number {
  if (/primer piso|planta baja|primer nivel|nivel 1\b|piso 1\b/.test(text)) return 0;
  if (/segundo piso|planta alta|segundo nivel|nivel 2\b|piso 2\b/.test(text)) return 1;
  if (/tercer piso|tercer nivel|nivel 3\b|piso 3\b/.test(text)) return 2;
  return fallback;
}

/* -------------------------------------------------------------------------- */
/*                        Extracción de requisitos (generar)                  */
/* -------------------------------------------------------------------------- */

function extractTerrain(text: string): Partial<Terrain> | null {
  const dimensions = match(text, new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:m\\b|mts\\b|metros\\b)?\\s*(?:x|por)\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:m\\b|mts\\b|metros\\b)?`));
  if (dimensions) {
    const width = Number(dimensions[1].replace(',', '.'));
    const depth = Number(dimensions[2].replace(',', '.'));
    if (width > 2 && depth > 2) {
      return {
        width,
        depth,
        setbacks: { front: 2, back: 2, left: 1.5, right: 1.5 },
        orientation: 'south',
        slope: 0,
      };
    }
  }
  const area = match(text, /(\d+(?:[.,]\d+)?)\s*(?:m2|metros cuadrados|metro cuadrado)/);
  if (area) {
    const total = Number(area[1].replace(',', '.'));
    if (total > 20) {
      const width = Math.round(Math.sqrt(total * 0.5) * 10) / 10;
      const depth = Math.round((total / width) * 10) / 10;
      return {
        width,
        depth,
        setbacks: { front: 2, back: 2, left: 1.5, right: 1.5 },
        orientation: 'south',
        slope: 0,
      };
    }
  }
  return null;
}

function extractBudget(text: string): number | null {
  const explicit = match(
    text,
    /presupuesto\s*(?:de|hasta|aproximado de|:)?\s*(?:s\/|\$|usd)?\s*(\d+(?:[.,]\d+)?)\s*(mil|k)?/,
  );
  if (explicit) {
    const base = Number(explicit[1].replace(',', '.'));
    const multiplier = explicit[2] ? 1000 : 1;
    const value = base * multiplier;
    if (value >= 10000) return value;
  }
  const money = match(text, /(?:s\/|\$|usd)\s*(\d{2,3}(?:[.,]\d{3})+|\d{4,})/);
  if (money) {
    const value = Number(money[1].replace(/[.,]/g, ''));
    if (value >= 10000) return value;
  }
  if (/economico|ajustado|bajo presupuesto|limitado/.test(text)) return 150000;
  if (/lujo|premium|exclusiv/.test(text)) return 380000;
  return null;
}

function extractFeatures(text: string): Requirements['features'] {
  const features: Requirements['features'] = [];
  if (/jardin/.test(text)) features.push('garden');
  if (/terraza/.test(text)) features.push('terrace');
  if (/cocina abierta/.test(text)) features.push('openKitchen');
  if (/isla (central|de cocina)/.test(text)) features.push('island');
  if (/lavanderia/.test(text)) features.push('laundry');
  if (/estudio/.test(text)) features.push('study');
  if (/chimenea/.test(text)) features.push('fireplace');
  if (/piscina/.test(text)) features.push('pool');
  return features;
}

function buildGenerateIntent(text: string): ParsedIntent {
  const requirements: Partial<Requirements> = {};
  const notes: string[] = [];
  const clarifications: string[] = [];

  const levelsMatch = match(text, /(un solo piso|un piso|una planta|1 piso|dos pisos|tres pisos|(\d+|un|dos|tres) (?:pisos|plantas|niveles))/);
  if (levelsMatch) {
    if (/un solo piso|un piso|una planta|1 piso/.test(levelsMatch[0])) requirements.levels = 1;
    else {
      const token = /dos/.test(levelsMatch[0]) ? 2 : /tres/.test(levelsMatch[0]) ? 3 : parseNumber(levelsMatch[2], 1);
      requirements.levels = Math.max(1, Math.min(3, token));
    }
  }

  const bedrooms = match(text, new RegExp(`${NUMBER_PATTERN}\\s*(?:dormitorios?|habitaciones?|cuartos?|recamaras?)`));
  if (bedrooms) requirements.bedrooms = parseNumber(bedrooms[1], 1);

  const bathrooms = match(text, new RegExp(`${NUMBER_PATTERN}\\s*(?:banos?|aseos?)`));
  if (bathrooms) requirements.bathrooms = parseNumber(bathrooms[1], 1);

  const parking = match(text, new RegExp(`(?:cochera|garaje|estacionamiento)\\s*(?:para|con|de)?\\s*${NUMBER_PATTERN}\\s*(?:vehiculos?|autos?|coches?|carros?)?`));
  if (parking) requirements.parkingSpaces = parseNumber(parking[1], 1);
  else if (/cochera|garaje|estacionamiento/.test(text)) requirements.parkingSpaces = 1;

  const family = match(text, /familia de (\d+) (?:personas|integrantes|miembros)/);
  if (family) requirements.familySize = Number(family[1]);

  const style = styleFrom(text);
  if (style) requirements.style = style;

  const budget = extractBudget(text);
  if (budget) requirements.budget = budget;

  const features = extractFeatures(text);
  if (features.length > 0) requirements.features = features;

  const terrain = extractTerrain(text);

  if (!requirements.bedrooms) clarifications.push('¿Cuántos dormitorios necesita la vivienda?');
  if (!requirements.levels) clarifications.push('¿La vivienda será de uno o dos pisos?');
  if (!terrain) clarifications.push('¿Cuáles son las dimensiones del terreno (ancho × fondo) en metros?');
  if (!requirements.budget) clarifications.push('¿Cuál es el presupuesto estimado para la construcción?');
  if (!requirements.bathrooms) clarifications.push('¿Cuántos baños requiere la vivienda?');

  if (requirements.levels && requirements.levels > 1 && features.includes('terrace')) {
    notes.push('La terraza se ubicará en la planta alta.');
  }
  if (/economico/.test(text) && budget === 150000) {
    notes.push('Se asumió un presupuesto económico de referencia (150 000 USD) porque no se indicó un monto.');
  }

  const filled = [requirements.levels, requirements.bedrooms, requirements.bathrooms, terrain, requirements.style, requirements.budget, features.length > 0].filter(
    (value) => value !== undefined && value !== null && value !== false,
  ).length;

  const parts: string[] = [];
  if (requirements.levels) parts.push(`${requirements.levels} piso(s)`);
  if (requirements.bedrooms) parts.push(`${requirements.bedrooms} dormitorio(s)`);
  if (requirements.bathrooms) parts.push(`${requirements.bathrooms} baño(s)`);
  if (terrain) parts.push(`terreno ${terrain.width} × ${terrain.depth} m`);
  if (requirements.style) parts.push(`estilo ${requirements.style}`);
  if (features.length) parts.push(`extras: ${features.join(', ')}`);

  return {
    intent: 'generate',
    operations: [],
    requirements,
    terrain: terrain ?? undefined,
    clarifications,
    explanation: `Generaré una propuesta de vivienda con ${parts.join(', ')}.`,
    confidence: Math.min(0.95, 0.45 + filled * 0.08),
    source: 'rules',
    unresolved: [],
    notes,
  };
}

/* -------------------------------------------------------------------------- */
/*                           Modificaciones del modelo                        */
/* -------------------------------------------------------------------------- */

function describeOperation(op: Operation, model?: DesignModel): string {
  const roomName = (id: string) => {
    const room = model?.building.levels.flatMap((l) => l.rooms).find((r) => r.id === id);
    return room?.name ?? id;
  };
  switch (op.op) {
    case 'resize_room':
      return `${roomName(op.roomId)} a ${op.targetArea.toFixed(1)} m²`;
    case 'add_room':
      return `nuevo ambiente tipo ${op.type} en la planta ${op.level + 1}`;
    case 'remove_room':
      return `eliminar ${roomName(op.roomId)}`;
    case 'add_window':
      return `ventana nueva en ${roomName(op.roomId)}`;
    case 'windows_floor_to_ceiling':
      return `ventanales de piso a techo (${op.scope})`;
    case 'add_door':
      return `puerta nueva en ${roomName(op.roomId)}`;
    case 'move_door':
      return `mover la puerta ${op.delta > 0 ? 'a la derecha' : 'a la izquierda'}`;
    case 'set_room_floor':
      return `piso ${op.materialId} en ${roomName(op.roomId)}`;
    case 'set_room_color':
      return `color ${op.color} en ${roomName(op.roomId)}`;
    case 'set_facade_color':
      return `fachada ${op.color}`;
    case 'set_facade_material':
      return `revestimiento de fachada ${op.materialId}`;
    case 'set_roof_material':
      return `cubierta ${op.materialId}`;
    case 'set_style':
      return `estilo ${op.style}`;
    case 'add_furniture':
      return `${op.type} en ${roomName(op.roomId)}`;
    case 'remove_furniture':
      return `retirar ${op.type} de ${roomName(op.roomId)}`;
    case 'add_level':
      return 'una planta adicional';
    case 'reduce_budget':
      return `materiales de menor costo (${(op.percent * 100).toFixed(0)}%)`;
    default:
      return 'operación';
  }
}

interface ClauseResult {
  ops: Operation[];
  unresolved: string[];
  notes: string[];
  clarifications: string[];
}

function parseClause(clause: string, model: DesignModel | undefined): ClauseResult {
  const ops: Operation[] = [];
  const unresolved: string[] = [];
  const notes: string[] = [];
  const clarifications: string[] = [];
  const detected = detectRoomType(clause);
  const room = detected && model ? resolveRoom(model, detected.type) : null;

  /* -------- Ventanales de piso a techo -------- */
  if (/ventanal|piso a techo/.test(clause) && /(cambia|cambiar|convierte|convertir|sustituye|sustituir|reemplaza|reemplazar|pon)/.test(clause)) {
    const level = /(segundo piso|planta alta|nivel 2)/.test(clause) ? levelFrom(clause, 0) : undefined;
    ops.push(
      room
        ? { op: 'windows_floor_to_ceiling', scope: 'room', roomId: room.id }
        : level !== undefined
          ? { op: 'windows_floor_to_ceiling', scope: 'level', level }
          : { op: 'windows_floor_to_ceiling', scope: 'all' },
    );
    notes.push('Se reemplazan las ventanas existentes por ventanales; no se agregan vanos nuevos.');
    return { ops, unresolved, notes, clarifications };
  }

  /* -------- Mover puerta -------- */
  if (/(mueve|mover|desplaza|corre|desplazar)/.test(clause) && /puerta/.test(clause)) {
    const door = model
      ? model.building.levels
          .flatMap((level) => level.walls)
          .flatMap((wall) => wall.openings.filter((o) => o.kind === 'door').map((o) => ({ wall, opening: o })))
          .filter((entry) => entry.wall.kind === 'external')
          .sort((a, b) => b.opening.width - a.opening.width)[0]
      : undefined;
    if (!door) {
      clarifications.push('No encontré una puerta de acceso que pueda mover.');
    } else {
      const direction = /izquierda/.test(clause) ? -1 : /derecha/.test(clause) ? 1 : -1;
      ops.push({ op: 'move_door', doorId: door.opening.id, delta: direction * 0.6 });
    }
    return { ops, unresolved, notes, clarifications };
  }

  /* -------- Mobiliario -------- */
  const furnitureVerb = /(agrega|agregar|anade|anadir|pon|poner|incluye|incluir|incorpora|incorporar|suma|sumar)/.test(clause);
  if (furnitureVerb) {
    const furniture = firstMatch(FURNITURE_WORDS, clause);
    if (furniture === 'kitchen_island') {
      const kitchen = model ? resolveRoom(model, 'kitchen') : null;
      if (!kitchen) clarifications.push('No encontré la cocina en el modelo actual.');
      else ops.push({ op: 'add_furniture', roomId: kitchen.id, type: 'kitchen_island' });
      return { ops, unresolved, notes, clarifications };
    }
    if (furniture && detected && room) {
      ops.push({ op: 'add_furniture', roomId: room.id, type: furniture });
      return { ops, unresolved, notes, clarifications };
    }
  }

  /* -------- Presupuesto -------- */
  if (/(presupuesto|costos?|coste|economi)/.test(clause) && /(reduc|baja|disminuy|menor|abarata|ajusta)/.test(clause)) {
    ops.push({ op: 'reduce_budget', percent: 0.15 });
    notes.push('Se sustituyen acabados por las opciones de menor costo del catálogo y se retiran elementos premium.');
    return { ops, unresolved, notes, clarifications };
  }

  /* -------- Estilo -------- */
  const style = styleFrom(clause);
  if (style && /(estilo|fachada|diseno)/.test(clause)) {
    ops.push({ op: 'set_style', style });
    return { ops, unresolved, notes, clarifications };
  }

  /* -------- Colores -------- */
  const color = colorFrom(clause);
  if (color && /(color|pint|tonos|acabado)/.test(clause)) {
    if (/fachada/.test(clause)) {
      ops.push({ op: 'set_facade_color', color });
      if (/gris/.test(clause) && /blanc/.test(clause)) {
        notes.push('Se combinaron tonos blancos y grises: se aplicó el blanco a la fachada y se sugiere gris para la planta baja.');
      }
    } else if (model) {
      if (room) ops.push({ op: 'set_room_color', roomId: room.id, color });
      else {
        for (const level of model.building.levels) {
          for (const candidate of level.rooms) {
            ops.push({ op: 'set_room_color', roomId: candidate.id, color });
          }
        }
      }
    }
    return { ops, unresolved, notes, clarifications };
  }

  /* -------- Materiales -------- */
  const floorMaterial = firstMatch(FLOOR_WORDS, clause);
  if (floorMaterial && /(piso|pisos|pavimento|ceramic|porcelanato)/.test(clause) && model) {
    const targets = room ? [room] : model.building.levels.flatMap((l) => l.rooms);
    for (const target of targets) ops.push({ op: 'set_room_floor', roomId: target.id, materialId: floorMaterial });
    const material = MATERIALS.find((m) => m.id === floorMaterial);
    notes.push(`Se aplicó ${material?.name ?? floorMaterial} en ${room ? room.name : 'todos los ambientes'}.`);
    return { ops, unresolved, notes, clarifications };
  }

  const facadeMaterial = firstMatch(FACADE_WORDS, clause);
  if (facadeMaterial && /fachada/.test(clause)) {
    ops.push({ op: 'set_facade_material', materialId: facadeMaterial });
    return { ops, unresolved, notes, clarifications };
  }

  const roofMaterial = firstMatch(ROOF_WORDS, clause);
  if (roofMaterial && /(techo|cubierta|tejado)/.test(clause)) {
    ops.push({ op: 'set_roof_material', materialId: roofMaterial });
    return { ops, unresolved, notes, clarifications };
  }

  /* -------- Agregar planta -------- */
  if (
    /(agrega|anade|suma|incorpora)/.test(clause) &&
    /(un piso|otro piso|otra planta|nivel adicional|planta adicional|un nivel)/.test(clause) &&
    !detected
  ) {
    ops.push({ op: 'add_level' });
    return { ops, unresolved, notes, clarifications };
  }

  /* -------- Eliminar ambiente -------- */
  if (/(elimina|eliminar|quita|quitar|remueve|remover|borra|suprime)/.test(clause) && detected && model) {
    if (!room) clarifications.push(`No encontré un ambiente de tipo ${ROOM_DEFAULTS[detected.type]?.label ?? detected.type} en el proyecto.`);
    else ops.push({ op: 'remove_room', roomId: room.id });
    return { ops, unresolved, notes, clarifications };
  }

  /* -------- Agregar ambiente -------- */
  if (/(agrega|agregar|anade|anadir|crea|crear|incorpora|incorporar|incluye|incluir|suma|sumar)/.test(clause) && detected && model) {
    const levels = model.building.levels.length;
    const defaultLevel = levels > 1 ? levels - 1 : 0;
    const level = levelFrom(clause, defaultLevel);
    const area = ROOM_DEFAULTS[detected.type]?.preferredArea ?? 10;
    ops.push({
      op: 'add_room',
      type: detected.type,
      level: Math.min(level, levels - 1),
      targetArea: Math.round(area * 0.9 * 10) / 10,
    });
    notes.push('El ambiente nuevo se crea dividiendo un espacio existente para no alterar el resto de la vivienda.');
    return { ops, unresolved, notes, clarifications };
  }

  /* -------- Ampliar / reducir ambiente -------- */
  const resizeVerb = /(ampli|aument|agrand|crec|mas grande|reduce|reduc|disminuy|achic|mas pequen|menor tamano)/.test(clause);
  if (resizeVerb && detected && model) {
    if (!room) {
      clarifications.push(`No encontré un ambiente de tipo ${ROOM_DEFAULTS[detected.type]?.label ?? detected.type} en el proyecto actual.`);
      return { ops, unresolved, notes, clarifications };
    }
    const current = room.rect.w * room.rect.h;
    const grow = /(ampli|aument|agrand|crec|mas grande)/.test(clause);
    const absolute = match(clause, /(?:a|hasta)\s+(\d+(?:[.,]\d+)?)\s*(?:m2|metros cuadrados|m\b)/);
    const relative = match(clause, /(?:en|mas|menos)\s+(\d+(?:[.,]\d+)?)\s*(?:m2|metros cuadrados)/);
    let target = current * (grow ? 1.2 : 0.85);
    if (absolute) target = Number(absolute[1].replace(',', '.'));
    else if (relative) {
      const value = Number(relative[1].replace(',', '.'));
      target = grow ? current + value : current - value;
    }
    ops.push({ op: 'resize_room', roomId: room.id, targetArea: Math.round(target * 10) / 10 });
    notes.push(
      `Se conservarán los demás ambientes; si el espacio vecino no alcanza, el motor ajustará solo la superficie que sea posible.`,
    );
    return { ops, unresolved, notes, clarifications };
  }

  /* -------- Fachada + color/material genérico -------- */
  if (/fachada/.test(clause)) {
    unresolved.push(clause);
    return { ops, unresolved, notes, clarifications };
  }

  unresolved.push(clause);
  return { ops, unresolved, notes, clarifications };
}

function splitClauses(text: string): string[] {
  const verbs = '(?:amplia|ampliar|aumenta|aumentar|agranda|reduce|reducir|disminuye|agrega|anade|anadir|crea|incorpora|incluye|suma|cambia|cambiar|sustituye|reemplaza|mueve|mover|elimina|quita|remueve|pone|pon)';
  return text
    .split(new RegExp(`\\s*(?:,|;|\\by\\b(?=\\s+${verbs}\\b))\\s*`))
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 3);
}

function buildModifyIntent(text: string, model?: DesignModel): ParsedIntent {
  const clauses = splitClauses(text);
  const ops: Operation[] = [];
  const unresolved: string[] = [];
  const notes: string[] = [];
  const clarifications: string[] = [];

  for (const clause of clauses) {
    const result = parseClause(clause, model);
    ops.push(...result.ops);
    unresolved.push(...result.unresolved);
    notes.push(...result.notes);
    clarifications.push(...result.clarifications);
  }

  if (ops.length === 0 && clarifications.length === 0) {
    return {
      intent: 'unknown',
      operations: [],
      clarifications: ['No pude identificar el cambio solicitado. Puede pedirlo así: "amplía la cocina a 16 m²" o "cambia el piso de la sala a porcelanato".'],
      explanation: 'No se reconoció una modificación concreta en la instrucción.',
      confidence: 0.15,
      source: 'rules',
      unresolved,
      notes,
    };
  }

  const described = ops.map((op) => describeOperation(op, model));
  return {
    intent: 'modify',
    operations: ops,
    clarifications,
    explanation: `Entendí que desea: ${described.join('; ')}.`,
    confidence: ops.length > 0 ? Math.min(0.95, 0.6 + 0.05 * ops.length) : 0.35,
    source: 'rules',
    unresolved,
    notes,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Punto de entrada                              */
/* -------------------------------------------------------------------------- */

const GENERATE_HINT = /(disena|disenar|diseno de|quiero|necesito|construye|construir|crea|crear|proyecta|proyectar|vivienda de|casa de)/;
const MODIFY_HINT = /(ampli|reduce|agrega|anade|cambia|sustituye|reemplaza|mueve|elimina|quita|pinta|pon|convierte|disminuye)/;

export function parseInstruction(text: string, context: InterpretationContext = {}): ParsedIntent {
  const normalized = normalize(text);
  if (normalized.length === 0) {
    return {
      intent: 'unknown',
      operations: [],
      clarifications: ['Escriba una descripción de la vivienda o el cambio que desea.'],
      explanation: 'Instrucción vacía.',
      confidence: 0,
      source: 'rules',
      unresolved: [],
      notes: [],
    };
  }

  if (/compara|comparar|comparacion|alternativa de menor costo|version anterior/.test(normalized)) {
    return {
      intent: 'compare',
      operations: [],
      clarifications: [],
      explanation:
        'Prepararé la comparación entre la versión vigente y la versión de referencia, mostrando áreas, materiales y costo estimado.',
      confidence: 0.8,
      source: 'rules',
      unresolved: [],
      notes: [],
    };
  }

  const explicitGenerate =
    context.mode === 'generate' ||
    (/terreno/.test(normalized) && /(mide|m2|metros|de \\d+ x \\d+)/.test(normalized)) ||
    (GENERATE_HINT.test(normalized) &&
      !MODIFY_HINT.test(normalized) &&
      /(dormitorio|habitacion|piso|planta|m2|terreno)/.test(normalized)) ||
    (context.mode !== 'modify' && /(disena|disenar|quiero una casa|necesito una casa|vivienda de)/.test(normalized) && !MODIFY_HINT.test(normalized));

  if (explicitGenerate && (!context.model || context.mode === 'generate' || /(disena|quiero una casa|necesito una vivienda|construye)/.test(normalized))) {
    return buildGenerateIntent(normalized);
  }

  if (context.model) {
    return buildModifyIntent(normalized, context.model);
  }

  return {
    intent: 'unknown',
    operations: [],
    clarifications: ['Aún no existe un modelo. Describa la vivienda que desea para generarla.'],
    explanation: 'No hay un proyecto con modelo para aplicar cambios.',
    confidence: 0.2,
    source: 'rules',
    unresolved: [],
    notes: [],
  };
}
