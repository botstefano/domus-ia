import type {
  FurnitureType,
  Material,
  RoomType,
  StyleId,
} from './types';

/**
 * Catálogo de demostración.
 *
 * IMPORTANTE: precios unitarios de referencia con fines de prototipo. Los
 * proveedores son ficticios; en producción este catálogo debe sustituirse por
 * datos reales de fabricantes con su vigencia y moneda local.
 */
export const MATERIALS: Material[] = [
  { id: 'floor.ceramic.standard', name: 'Cerámica estándar 45x45', category: 'floor', unit: 'm2', unitCost: 22, currency: 'USD', brand: 'Cerámicas Andinas', tier: 'economic', color: '#d8d2c4', roughness: 0.6, maintenance: 'Limpieza húmeda', availability: 'in_stock' },
  { id: 'floor.porcelain.matte', name: 'Porcelanato mate 60x60', category: 'floor', unit: 'm2', unitCost: 38, currency: 'USD', brand: 'Porcelanato Lima', tier: 'standard', color: '#cfcabf', roughness: 0.45, maintenance: 'Limpieza húmeda', availability: 'in_stock' },
  { id: 'floor.laminate.oak', name: 'Laminado roble claro', category: 'floor', unit: 'm2', unitCost: 28, currency: 'USD', brand: 'Madera Perú', tier: 'standard', color: '#c8a97e', roughness: 0.5, maintenance: 'Paño semihúmedo', availability: 'in_stock' },
  { id: 'floor.vinyl.grey', name: 'Vinílico gris', category: 'floor', unit: 'm2', unitCost: 18, currency: 'USD', brand: 'Pisosur', tier: 'economic', color: '#9aa0a6', roughness: 0.55, availability: 'in_stock' },
  { id: 'floor.concrete.polished', name: 'Concreto pulido', category: 'floor', unit: 'm2', unitCost: 45, currency: 'USD', brand: 'Cementos Pacífico', tier: 'standard', color: '#a8a8a8', roughness: 0.3, availability: 'in_stock' },
  { id: 'floor.marble.carrara', name: 'Mármol Carrara', category: 'floor', unit: 'm2', unitCost: 95, currency: 'USD', brand: 'Mármoles del Sur', tier: 'premium', color: '#eceae4', roughness: 0.2, availability: 'on_request' },
  { id: 'floor.wood.engineered', name: 'Madera ingenierizada', category: 'floor', unit: 'm2', unitCost: 55, currency: 'USD', brand: 'Madera Perú', tier: 'premium', color: '#b98b5e', roughness: 0.45, availability: 'on_request' },

  { id: 'wall.paint.white', name: 'Pintura látex blanco', category: 'wall', unit: 'm2', unitCost: 8, currency: 'USD', brand: 'Pinturas Unión', tier: 'economic', color: '#f6f4ef', roughness: 0.9, availability: 'in_stock' },
  { id: 'wall.paint.warm_grey', name: 'Pintura gris cálido', category: 'wall', unit: 'm2', unitCost: 9, currency: 'USD', brand: 'Pinturas Unión', tier: 'economic', color: '#e2dfd8', roughness: 0.9, availability: 'in_stock' },
  { id: 'wall.plaster.textured', name: 'Yeso texturado', category: 'wall', unit: 'm2', unitCost: 14, currency: 'USD', brand: 'Acabados Lima', tier: 'standard', color: '#efe9df', roughness: 0.8, availability: 'in_stock' },
  { id: 'wall.paper.geometric', name: 'Papel mural geométrico', category: 'wall', unit: 'm2', unitCost: 20, currency: 'USD', brand: 'Casa Textil', tier: 'standard', color: '#dfe3e6', roughness: 0.7, availability: 'on_request' },
  { id: 'wall.brick.exposed', name: 'Ladrillo expuesto', category: 'wall', unit: 'm2', unitCost: 25, currency: 'USD', brand: 'Ladrillos Norte', tier: 'standard', color: '#a2603f', roughness: 0.85, availability: 'in_stock' },

  { id: 'facade.paint.white', name: 'Pintura exterior blanca', category: 'facade', unit: 'm2', unitCost: 12, currency: 'USD', brand: 'Pinturas Unión', tier: 'economic', color: '#f3f1ec', roughness: 0.85, availability: 'in_stock' },
  { id: 'facade.stucco.sand', name: 'Estuco arena', category: 'facade', unit: 'm2', unitCost: 20, currency: 'USD', brand: 'Acabados Lima', tier: 'standard', color: '#d9cbb3', roughness: 0.8, availability: 'in_stock' },
  { id: 'facade.brick.cladding', name: 'Enchapado ladrillo', category: 'facade', unit: 'm2', unitCost: 45, currency: 'USD', brand: 'Ladrillos Norte', tier: 'standard', color: '#9d5b3c', roughness: 0.9, availability: 'in_stock' },
  { id: 'facade.stone.travertine', name: 'Travertino', category: 'facade', unit: 'm2', unitCost: 65, currency: 'USD', brand: 'Mármoles del Sur', tier: 'premium', color: '#d8cdbb', roughness: 0.6, availability: 'on_request' },
  { id: 'facade.wood.slats', name: 'Celosía de madera', category: 'facade', unit: 'm2', unitCost: 70, currency: 'USD', brand: 'Madera Perú', tier: 'premium', color: '#8a5a34', roughness: 0.7, availability: 'on_request' },
  { id: 'facade.glass.curtain', name: 'Muro cortina vidrio', category: 'facade', unit: 'm2', unitCost: 180, currency: 'USD', brand: 'Vidriosur', tier: 'premium', color: '#9fc3cf', roughness: 0.1, availability: 'on_request' },

  { id: 'roof.slab.concrete', name: 'Losa de concreto', category: 'roof', unit: 'm2', unitCost: 55, currency: 'USD', brand: 'Cementos Pacífico', tier: 'standard', color: '#bdbdbd', roughness: 0.9, availability: 'in_stock' },
  { id: 'roof.tile.terracotta', name: 'Teja de arcilla', category: 'roof', unit: 'm2', unitCost: 40, currency: 'USD', brand: 'Tejas Sur', tier: 'standard', color: '#b15b3c', roughness: 0.85, availability: 'in_stock' },
  { id: 'roof.metal.deck', name: 'Cubierta metálica', category: 'roof', unit: 'm2', unitCost: 48, currency: 'USD', brand: 'AceroSur', tier: 'standard', color: '#7f8a94', roughness: 0.4, availability: 'in_stock' },

  { id: 'opening.door.wood', name: 'Puerta de madera', category: 'opening', unit: 'unit', unitCost: 320, currency: 'USD', brand: 'Carpintería Andina', tier: 'standard', color: '#8b5a2b', availability: 'in_stock' },
  { id: 'opening.door.glass', name: 'Puerta vidrio templado', category: 'opening', unit: 'unit', unitCost: 620, currency: 'USD', brand: 'Vidriosur', tier: 'premium', color: '#bfd6de', availability: 'on_request' },
  { id: 'opening.window.aluminum', name: 'Ventana aluminio + vidrio', category: 'opening', unit: 'unit', unitCost: 260, currency: 'USD', brand: 'Aluminios Lima', tier: 'standard', color: '#9aa5ad', availability: 'in_stock' },
  { id: 'opening.window.pvc', name: 'Ventana PVC', category: 'opening', unit: 'unit', unitCost: 210, currency: 'USD', brand: 'PVC Perú', tier: 'economic', color: '#c6c6c6', availability: 'in_stock' },
  { id: 'opening.window.floor_to_ceiling', name: 'Ventanal piso a techo', category: 'opening', unit: 'unit', unitCost: 950, currency: 'USD', brand: 'Vidriosur', tier: 'premium', color: '#a9c9d4', availability: 'on_request' },
];

export const MATERIAL_INDEX: Record<string, Material> = Object.fromEntries(
  MATERIALS.map((m) => [m.id, m]),
);

export function getMaterial(id: string): Material | undefined {
  return MATERIAL_INDEX[id];
}

export function materialsByCategory(category: Material['category']): Material[] {
  return MATERIALS.filter((m) => m.category === category);
}

export interface StyleProfile {
  id: StyleId;
  label: string;
  description: string;
  /** Multiplicador de superficies: estilos compactos vs. amplios. */
  areaFactor: number;
  floorMaterialId: string;
  wallColor: string;
  facadeMaterialId: string;
  facadeColor: string;
  roofType: 'flat' | 'gabled';
  roofMaterialId: string;
  /** Ratio de ventana respecto al área de fachada del ambiente. */
  windowRatio: number;
  floorToCeilingWindows: boolean;
  furnitureTier: 'economic' | 'standard' | 'premium';
  palette: string[];
}

export const STYLE_PROFILES: Record<StyleId, StyleProfile> = {
  modern: {
    id: 'modern',
    label: 'Moderno',
    description: 'Volúmenes limpios, grandes vanos, paleta neutra con acentos oscuros.',
    areaFactor: 1.0,
    floorMaterialId: 'floor.porcelain.matte',
    wallColor: '#f6f4ef',
    facadeMaterialId: 'facade.paint.white',
    facadeColor: '#f1efe9',
    roofType: 'flat',
    roofMaterialId: 'roof.slab.concrete',
    windowRatio: 0.22,
    floorToCeilingWindows: false,
    furnitureTier: 'standard',
    palette: ['#f1efe9', '#3a3f45', '#8c9aa4', '#c9b79c'],
  },
  minimalist: {
    id: 'minimalist',
    label: 'Minimalista',
    description: 'Superficies continuas, mobiliario esencial, vanos de piso a techo.',
    areaFactor: 1.05,
    floorMaterialId: 'floor.concrete.polished',
    wallColor: '#f7f6f3',
    facadeMaterialId: 'facade.paint.white',
    facadeColor: '#f4f3ef',
    roofType: 'flat',
    roofMaterialId: 'roof.slab.concrete',
    windowRatio: 0.26,
    floorToCeilingWindows: true,
    furnitureTier: 'standard',
    palette: ['#f4f3ef', '#dcdad4', '#8f9499', '#2f3337'],
  },
  classic: {
    id: 'classic',
    label: 'Clásico',
    description: 'Proporciones simétricas, molduras, cubierta inclinada.',
    areaFactor: 1.15,
    floorMaterialId: 'floor.marble.carrara',
    wallColor: '#fbf8f1',
    facadeMaterialId: 'facade.stucco.sand',
    facadeColor: '#e6d8c1',
    roofType: 'gabled',
    roofMaterialId: 'roof.tile.terracotta',
    windowRatio: 0.16,
    floorToCeilingWindows: false,
    furnitureTier: 'premium',
    palette: ['#e6d8c1', '#fbf8f1', '#8c6f4e', '#3e3a35'],
  },
  mediterranean: {
    id: 'mediterranean',
    label: 'Mediterráneo',
    description: 'Muros gruesos, terracota, patios y celosías.',
    areaFactor: 1.1,
    floorMaterialId: 'floor.ceramic.standard',
    wallColor: '#fdf9f0',
    facadeMaterialId: 'facade.stucco.sand',
    facadeColor: '#ecdfc6',
    roofType: 'gabled',
    roofMaterialId: 'roof.tile.terracotta',
    windowRatio: 0.18,
    floorToCeilingWindows: false,
    furnitureTier: 'standard',
    palette: ['#ecdfc6', '#c0714a', '#5f7a6a', '#fdf9f0'],
  },
  industrial: {
    id: 'industrial',
    label: 'Industrial',
    description: 'Ladrillo expuesto, acero, concreto y vanos amplios.',
    areaFactor: 1.0,
    floorMaterialId: 'floor.concrete.polished',
    wallColor: '#e8e5df',
    facadeMaterialId: 'facade.brick.cladding',
    facadeColor: '#9d5b3c',
    roofType: 'flat',
    roofMaterialId: 'roof.metal.deck',
    windowRatio: 0.24,
    floorToCeilingWindows: false,
    furnitureTier: 'standard',
    palette: ['#9d5b3c', '#4a4f54', '#d9d5cd', '#2b2d2f'],
  },
  nordic: {
    id: 'nordic',
    label: 'Nórdico',
    description: 'Madera clara, blanco, luz natural y líneas simples.',
    areaFactor: 1.0,
    floorMaterialId: 'floor.laminate.oak',
    wallColor: '#faf8f4',
    facadeMaterialId: 'facade.wood.slats',
    facadeColor: '#c8a97e',
    roofType: 'gabled',
    roofMaterialId: 'roof.metal.deck',
    windowRatio: 0.2,
    floorToCeilingWindows: false,
    furnitureTier: 'standard',
    palette: ['#faf8f4', '#c8a97e', '#9aa5ad', '#4a4a4a'],
  },
};

export interface RoomDefault {
  label: string;
  minArea: number;
  preferredArea: number;
  height: number;
  /** Proporción preferida ancho/fondo. */
  aspect: number;
  windowRatio: number;
  maxWindows: number;
}

export const ROOM_DEFAULTS: Record<RoomType, RoomDefault> = {
  hall: { label: 'Hall', minArea: 3.5, preferredArea: 5.5, height: 2.8, aspect: 1.2, windowRatio: 0, maxWindows: 0 },
  living: { label: 'Sala', minArea: 10, preferredArea: 18, height: 2.8, aspect: 1.5, windowRatio: 0.25, maxWindows: 2 },
  dining: { label: 'Comedor', minArea: 7, preferredArea: 12, height: 2.8, aspect: 1.3, windowRatio: 0.25, maxWindows: 2 },
  kitchen: { label: 'Cocina', minArea: 5, preferredArea: 10, height: 2.8, aspect: 1.2, windowRatio: 0.2, maxWindows: 1 },
  bedroom: { label: 'Dormitorio', minArea: 7, preferredArea: 11.5, height: 2.7, aspect: 1.15, windowRatio: 0.18, maxWindows: 1 },
  bathroom: { label: 'Baño', minArea: 2.6, preferredArea: 4.5, height: 2.5, aspect: 1.2, windowRatio: 0.08, maxWindows: 1 },
  garage: { label: 'Cochera', minArea: 13, preferredArea: 16, height: 2.9, aspect: 1.6, windowRatio: 0.05, maxWindows: 1 },
  terrace: { label: 'Terraza', minArea: 8, preferredArea: 14, height: 2.8, aspect: 1.6, windowRatio: 0.3, maxWindows: 0 },
  laundry: { label: 'Lavandería', minArea: 2.2, preferredArea: 3.5, height: 2.5, aspect: 1.3, windowRatio: 0.08, maxWindows: 1 },
  study: { label: 'Estudio', minArea: 4.5, preferredArea: 7.5, height: 2.7, aspect: 1.2, windowRatio: 0.2, maxWindows: 1 },
  stairs: { label: 'Escalera', minArea: 3.5, preferredArea: 5, height: 2.8, aspect: 1.0, windowRatio: 0.1, maxWindows: 1 },
  storage: { label: 'Depósito', minArea: 1.8, preferredArea: 3, height: 2.4, aspect: 1.4, windowRatio: 0, maxWindows: 0 },
};

export interface FurnitureSpec {
  label: string;
  width: number;
  depth: number;
  height: number;
  cost: number;
  materialId?: string;
  /** Elementos que no deben repetirse automáticamente en un mismo ambiente. */
  unique?: boolean;
}

export const FURNITURE_CATALOG: Record<FurnitureType, FurnitureSpec> = {
  bed_double: { label: 'Cama 2 plazas', width: 1.6, depth: 2.0, height: 0.55, cost: 650, unique: true },
  bed_single: { label: 'Cama 1 plaza', width: 1.0, depth: 2.0, height: 0.5, cost: 420, unique: true },
  wardrobe: { label: 'Clóset empotrado', width: 2.0, depth: 0.6, height: 2.2, cost: 720, unique: true },
  nightstand: { label: 'Velador', width: 0.45, depth: 0.4, height: 0.5, cost: 90 },
  sofa: { label: 'Sofá 3 cuerpos', width: 2.1, depth: 0.9, height: 0.8, cost: 890, unique: true },
  sofa_l: { label: 'Sofá en L', width: 2.6, depth: 1.7, height: 0.8, cost: 1350, unique: true },
  coffee_table: { label: 'Mesa de centro', width: 1.1, depth: 0.6, height: 0.4, cost: 260, unique: true },
  tv_unit: { label: 'Mueble TV', width: 1.8, depth: 0.45, height: 0.5, cost: 380, unique: true },
  dining_table: { label: 'Mesa de comedor', width: 1.6, depth: 0.9, height: 0.75, cost: 720, unique: true },
  chair: { label: 'Silla', width: 0.45, depth: 0.45, height: 0.9, cost: 85 },
  kitchen_counter: { label: 'Mueble bajo de cocina', width: 2.4, depth: 0.6, height: 0.9, cost: 980 },
  kitchen_island: { label: 'Isla central', width: 1.8, depth: 0.85, height: 0.9, cost: 1250, unique: true },
  fridge: { label: 'Refrigeradora', width: 0.7, depth: 0.7, height: 1.8, cost: 890, unique: true },
  stove: { label: 'Cocina / horno', width: 0.75, depth: 0.65, height: 0.9, cost: 620, unique: true },
  sink: { label: 'Lavadero', width: 0.6, depth: 0.5, height: 0.85, cost: 180, unique: true },
  toilet: { label: 'Inodoro', width: 0.4, depth: 0.65, height: 0.8, cost: 220, unique: true },
  shower: { label: 'Ducha', width: 0.9, depth: 0.9, height: 2.0, cost: 450, unique: true },
  bathtub: { label: 'Tina', width: 1.7, depth: 0.8, height: 0.55, cost: 980, unique: true },
  washbasin: { label: 'Lavamanos', width: 0.7, depth: 0.5, height: 0.85, cost: 210, unique: true },
  washing_machine: { label: 'Lavadora', width: 0.6, depth: 0.6, height: 0.85, cost: 690, unique: true },
  desk: { label: 'Escritorio', width: 1.3, depth: 0.6, height: 0.75, cost: 340, unique: true },
  bookshelf: { label: 'Estantería', width: 1.0, depth: 0.35, height: 1.9, cost: 280, unique: true },
  car: { label: 'Auto (referencia)', width: 1.8, depth: 4.4, height: 1.5, cost: 0, unique: false },
  plant: { label: 'Planta ornamental', width: 0.5, depth: 0.5, height: 1.1, cost: 60 },
};

/** Superficie mínima habitable por persona usada para validar el programa. */
export const MIN_AREA_PER_PERSON = 12;

/** Coeficiente de circulación aplicado al programa de áreas útiles. */
export const CIRCULATION_FACTOR = 1.22;
