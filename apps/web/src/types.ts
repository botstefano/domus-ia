export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
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

export interface Opening {
  id: string;
  kind: 'door' | 'window';
  wallId: string;
  offset: number;
  width: number;
  height: number;
  sill: number;
}

export interface Wall {
  id: string;
  level: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  thickness: number;
  height: number;
  kind: 'external' | 'internal' | 'railing';
  roomIds: string[];
  openings: Opening[];
  materialId?: string;
  color?: string;
}

export interface FurnitureItem {
  id: string;
  type: string;
  roomId: string;
  x: number;
  y: number;
  rotation: number;
  width: number;
  depth: number;
  height: number;
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
  furniture: FurnitureItem[];
  locked: boolean;
}

export interface Level {
  index: number;
  name: string;
  height: number;
  rooms: Room[];
  walls: Wall[];
}

export interface Terrain {
  width: number;
  depth: number;
  setbacks: { front: number; back: number; left: number; right: number };
  orientation: string;
  slope: number;
}

export interface DesignModel {
  id: string;
  projectId: string;
  version: number;
  createdAt: string;
  terrain: Terrain;
  requirements: {
    style: string;
    levels: number;
    bedrooms: number;
    bathrooms: number;
    parkingSpaces: number;
    budget: number;
    familySize: number;
    features: string[];
    notes: string[];
  };
  building: {
    footprint: Rect;
    levels: Level[];
    roof: { type: 'flat' | 'gabled'; pitch: number; materialId: string; overhang: number };
    facadeMaterialId: string;
    facadeColor: string;
  };
  site: { garden?: Rect; driveway?: Rect; pool?: Rect };
  meta: { generator: string; seed: number; style: string; units: string; warnings: string[] };
}

export interface CostLine {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
}

export interface CostReport {
  currency: string;
  lines: CostLine[];
  subtotal: number;
  contingency: number;
  total: number;
  budget: number;
  withinBudget: boolean;
}

export interface Issue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  elementIds?: string[];
}

export interface ValidationReport {
  ok: boolean;
  issues: Issue[];
  errors: Issue[];
  warnings: Issue[];
  checkedAt: string;
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

export interface ModelChange {
  kind: string;
  elementId?: string;
  label: string;
}

export interface VersionDetail {
  version: number;
  label: string | null;
  createdAt: string;
  model: DesignModel;
  cost: CostReport;
  validation: ValidationReport;
  summary: RoomSummary[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  style: string;
  levels: number;
  bedrooms: number;
  bathrooms: number;
  budget: number;
  currentVersion: number;
  clientId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail {
  id: string;
  name: string;
  status: string;
  clientId: string;
  style: string;
  levels: number;
  bedrooms: number;
  bathrooms: number;
  parkingSpaces: number;
  familySize: number;
  budget: number;
  features: string[];
  notes: string[];
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  terrain: Terrain;
  requirements: DesignModel['requirements'];
  version: VersionDetail | null;
  history: Array<{ from_version: number; to_version: number; summary: string; created_at: string }>;
  instructions: Array<{ version: number; text: string; intent: string; source: string; created_at: string }>;
}

export interface InstructionResponse {
  version: number;
  model: DesignModel;
  cost: CostReport;
  validation: ValidationReport;
  applied: Array<{ op: string }>;
  rejected: Array<{ operation: { op: string }; reason: string }>;
  warnings: string[];
  changes: ModelChange[];
  summary: string[];
  intent: { intent: string; explanation: string; confidence: number; source: string; clarifications: string[] };
  clarifications: string[];
}

export interface Comparison {
  from: { version: number; area: number; total: number };
  to: { version: number; area: number; total: number };
  areaDelta: number;
  costDelta: number;
  changes: ModelChange[];
  summary: string[];
  sameStructure: boolean;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
}
