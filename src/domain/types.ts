/**
 * @domus/domain - Contrato del modelo arquitectónico estructurado.
 *
 * Unidades: todas las longitudes en metros (m), superficies en m2 y dinero en USD.
 * Sistema de coordenadas: X hacia el este, Y hacia el norte, origen en la esquina
 * suroeste del terreno. Cada planta usa el mismo sistema (proyección vertical).
 *
 * Decisión de diseño: el proyecto NO se representa con imágenes ni con mallas
 * arbitrarias, sino con una estructura explícita (terreno -> vivienda -> plantas ->
 * ambientes / muros / vanos / mobiliario) cuyas operaciones son verificables.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Setbacks {
  front: number;
  back: number;
  left: number;
  right: number;
}

export type Orientation = 'north' | 'south' | 'east' | 'west';

export interface Terrain {
  width: number;
  depth: number;
  setbacks: Setbacks;
  orientation: Orientation;
  slope: number;
}

export type StyleId =
  | 'modern'
  | 'minimalist'
  | 'classic'
  | 'mediterranean'
  | 'industrial'
  | 'nordic';

export type Feature =
  | 'garden'
  | 'terrace'
  | 'openKitchen'
  | 'island'
  | 'laundry'
  | 'study'
  | 'fireplace'
  | 'pool';

export interface Requirements {
  style: StyleId;
  levels: number;
  bedrooms: number;
  bathrooms: number;
  parkingSpaces: number;
  budget: number;
  familySize: number;
  features: Feature[];
  notes: string[];
}

export type RoomType =
  | 'hall'
  | 'living'
  | 'dining'
  | 'kitchen'
  | 'bedroom'
  | 'bathroom'
  | 'garage'
  | 'terrace'
  | 'laundry'
  | 'study'
  | 'stairs'
  | 'storage';

export type FurnitureType =
  | 'bed_double'
  | 'bed_single'
  | 'wardrobe'
  | 'nightstand'
  | 'sofa'
  | 'sofa_l'
  | 'coffee_table'
  | 'tv_unit'
  | 'dining_table'
  | 'chair'
  | 'kitchen_counter'
  | 'kitchen_island'
  | 'fridge'
  | 'stove'
  | 'sink'
  | 'toilet'
  | 'shower'
  | 'bathtub'
  | 'washbasin'
  | 'washing_machine'
  | 'desk'
  | 'bookshelf'
  | 'car'
  | 'plant';

export interface FurnitureItem {
  id: string;
  type: FurnitureType;
  roomId: string;
  /** Posición del centro del mueble, relativa al origen del terreno (m). */
  x: number;
  y: number;
  /** Rotación en grados sobre el plano horizontal. */
  rotation: number;
  width: number;
  depth: number;
  height: number;
  materialId?: string;
}

/**
 * Vanos (puertas y ventanas). `offset` se mide en metros desde el punto `from`
 * del muro que los contiene, a lo largo del eje del muro.
 */
export interface Opening {
  id: string;
  kind: 'door' | 'window';
  wallId: string;
  offset: number;
  width: number;
  height: number;
  /** Altura del antepecho; 0 para puertas y ventanales de piso a techo. */
  sill: number;
}

export type WallKind = 'external' | 'internal' | 'railing';

export interface Wall {
  id: string;
  level: number;
  from: Vec2;
  to: Vec2;
  thickness: number;
  height: number;
  kind: WallKind;
  /** Ambientes a los que sirve el muro (1 en muros exteriores, 2 en tabiques). */
  roomIds: string[];
  materialId?: string;
  color?: string;
  openings: Opening[];
}

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  level: number;
  rect: Rect;
  height: number;
  interiorColor: string;
  floorMaterialId: string;
  wallMaterialId?: string;
  furniture: FurnitureItem[];
  /** Un ambiente bloqueado no puede ser eliminado ni absorbido por operaciones de IA. */
  locked: boolean;
}

export interface Level {
  index: number;
  name: string;
  height: number;
  rooms: Room[];
  walls: Wall[];
}

export interface Roof {
  type: 'flat' | 'gabled';
  pitch: number;
  materialId: string;
  overhang: number;
}

export interface Building {
  /** Huella de la vivienda dentro del terreno. */
  footprint: Rect;
  levels: Level[];
  roof: Roof;
  facadeMaterialId: string;
  facadeColor: string;
}

export interface SiteLayout {
  garden?: Rect;
  driveway?: Rect;
  pool?: Rect;
}

export interface ModelMeta {
  generator: string;
  seed: number;
  style: StyleId;
  units: 'm';
  warnings: string[];
}

export interface DesignModel {
  id: string;
  projectId: string;
  version: number;
  createdAt: string;
  terrain: Terrain;
  requirements: Requirements;
  building: Building;
  site: SiteLayout;
  meta: ModelMeta;
}

/* ----------------------------- Catálogo ---------------------------------- */

export type MaterialCategory = 'floor' | 'wall' | 'facade' | 'roof' | 'furniture' | 'opening';
export type MaterialTier = 'economic' | 'standard' | 'premium';

export interface Material {
  id: string;
  name: string;
  category: MaterialCategory;
  /** Unidad de medida usada para costear (m2, ml, unidad). */
  unit: 'm2' | 'ml' | 'unit';
  unitCost: number;
  currency: 'USD';
  brand: string;
  tier: MaterialTier;
  color?: string;
  roughness?: number;
  maintenance?: string;
  availability?: 'in_stock' | 'on_request' | 'discontinued';
  /** true si el material puede usarse como acabado de piso. */
  tags?: string[];
}

/* --------------------------- Instrucciones -------------------------------- */

export type Operation =
  | { op: 'resize_room'; roomId: string; targetArea: number }
  | { op: 'add_room'; type: RoomType; level: number; targetArea: number; name?: string }
  | { op: 'remove_room'; roomId: string }
  | { op: 'add_window'; roomId: string; width?: number; height?: number; sill?: number }
  | { op: 'windows_floor_to_ceiling'; scope: 'all' | 'level' | 'room'; roomId?: string; level?: number }
  | { op: 'add_door'; roomId: string; toRoomId?: string }
  | { op: 'move_door'; doorId: string; delta: number }
  | { op: 'set_room_floor'; roomId: string; materialId: string }
  | { op: 'set_room_color'; roomId: string; color: string }
  | { op: 'set_facade_color'; color: string }
  | { op: 'set_facade_material'; materialId: string }
  | { op: 'set_roof_material'; materialId: string }
  | { op: 'set_style'; style: StyleId }
  | { op: 'add_furniture'; roomId: string; type: FurnitureType }
  | { op: 'remove_furniture'; roomId: string; type: FurnitureType }
  | { op: 'add_level' }
  | { op: 'reduce_budget'; percent: number };

/* ---------------------------- Validación --------------------------------- */

export type IssueSeverity = 'error' | 'warning';

export interface Issue {
  code: string;
  severity: IssueSeverity;
  message: string;
  elementIds?: string[];
  data?: Record<string, unknown>;
}

export interface ValidationReport {
  ok: boolean;
  issues: Issue[];
  errors: Issue[];
  warnings: Issue[];
  checkedAt: string;
}

/* -------------------------------- Costos --------------------------------- */

export interface CostLine {
  category:
    | 'pisos'
    | 'muros'
    | 'fachada'
    | 'cubierta'
    | 'vanos'
    | 'mobiliario'
    | 'estructura'
    | 'terreno'
    | 'honorarios';
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
}

export interface CostReport {
  currency: 'USD';
  lines: CostLine[];
  subtotal: number;
  contingency: number;
  total: number;
  budget: number;
  withinBudget: boolean;
}

/* --------------------------------- Diff ---------------------------------- */

export type ChangeKind =
  | 'room_added'
  | 'room_removed'
  | 'room_resized'
  | 'room_renamed'
  | 'room_floor'
  | 'room_color'
  | 'wall_added'
  | 'wall_removed'
  | 'opening_added'
  | 'opening_removed'
  | 'furniture_added'
  | 'furniture_removed'
  | 'facade'
  | 'roof'
  | 'level_added'
  | 'requirement';

export interface ModelChange {
  kind: ChangeKind;
  elementId?: string;
  label: string;
  before?: unknown;
  after?: unknown;
}

export interface ModelDiff {
  changes: ModelChange[];
  summary: string[];
  sameStructure: boolean;
}

/* ------------------------- Resultado de operaciones ---------------------- */

export interface ApplyResult {
  model: DesignModel;
  report: ValidationReport;
  applied: Operation[];
  rejected: Array<{ operation: Operation; reason: string }>;
  warnings: string[];
}
