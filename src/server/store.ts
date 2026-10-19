import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import {
  applyOperations,
  diffModels,
  estimateCost,
  generateDesign,
  summarizeRooms,
  validateModel,
  type DesignModel,
  type Feature,
  type ModelChange,
  type Requirements,
  type Setbacks,
  type StyleId,
  type Terrain,
} from '../domain';
import { interpret, type ParsedIntent } from '../assistant';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  phone: string | null;
  role_id: string;
}

export interface ProjectRow {
  id: string;
  client_id: string;
  name: string;
  style: string;
  levels: number;
  bedrooms: number;
  bathrooms: number;
  parking_spaces: number;
  family_size: number;
  budget: number;
  features: string[];
  notes: string[];
  owner_id: string;
  status: string;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export interface TerrainRow {
  id: string;
  project_id: string;
  width: number;
  depth: number;
  setbacks: Setbacks;
  orientation: string;
  slope: number;
}

export interface VersionRow {
  id: string;
  project_id: string;
  version: number;
  label: string | null;
  model: DesignModel;
  cost: ReturnType<typeof estimateCost>;
  validation: ReturnType<typeof validateModel>;
  parent_version: number | null;
  created_by: string;
  created_at: string;
}

export interface ChangeRow {
  id: string;
  project_id: string;
  from_version: number;
  to_version: number;
  changes: ModelChange[];
  summary: string;
  source: string;
  created_at: string;
}

export interface InstructionRow {
  id: string;
  project_id: string;
  version: number;
  text: string;
  intent: string;
  operations: unknown[];
  rejected: unknown[];
  source: string;
  confidence: number;
  user_id: string;
  created_at: string;
}

const DEFAULT_SETBACKS: Setbacks = { front: 2, back: 2, left: 1.5, right: 1.5 };

class Store {
  public users: Map<string, UserRow> = new Map();
  public projects: Map<string, ProjectRow> = new Map();
  public terrains: Map<string, TerrainRow> = new Map();
  public versions: Map<string, VersionRow[]> = new Map();
  public changes: Map<string, ChangeRow[]> = new Map();
  public instructions: Map<string, InstructionRow[]> = new Map();

  private initialized = false;

  public async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const passwordHash = await bcrypt.hash('Domus2026!', 10);
    const seedUsers = [
      { id: 'usr-admin', email: 'admin@domus.local', full_name: 'Ana Torres', role_id: 'admin' },
      { id: 'usr-arch', email: 'arquitecto@domus.local', full_name: 'Luis Ramírez', role_id: 'architect' },
      { id: 'usr-adv', email: 'asesor@domus.local', full_name: 'Carla Mendoza', role_id: 'advisor' },
      { id: 'usr-client', email: 'cliente@domus.local', full_name: 'Jorge Salas', role_id: 'client' },
    ];

    for (const u of seedUsers) {
      this.users.set(u.id, {
        id: u.id,
        email: u.email,
        password_hash: passwordHash,
        full_name: u.full_name,
        phone: null,
        role_id: u.role_id,
      });
    }

    // Seed project 1: Casa moderna en La Molina
    const p1Id = 'proj-molina';
    const t1: Terrain = {
      width: 10,
      depth: 20,
      setbacks: { front: 2, back: 2, left: 1.5, right: 1.5 },
      orientation: 'south',
      slope: 0,
    };
    const req1: Requirements = {
      style: 'modern',
      levels: 2,
      bedrooms: 3,
      bathrooms: 2,
      parkingSpaces: 1,
      familySize: 4,
      budget: 185000,
      features: ['garden', 'terrace', 'openKitchen', 'laundry'],
      notes: [],
    };

    this.projects.set(p1Id, {
      id: p1Id,
      client_id: 'usr-client',
      name: 'Casa moderna en La Molina',
      style: 'modern',
      levels: 2,
      bedrooms: 3,
      bathrooms: 2,
      parking_spaces: 1,
      family_size: 4,
      budget: 185000,
      features: req1.features,
      notes: [],
      owner_id: 'usr-arch',
      status: 'review',
      current_version: 1,
      created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      updated_at: new Date().toISOString(),
    });

    this.terrains.set(p1Id, {
      id: 'terr-1',
      project_id: p1Id,
      width: t1.width,
      depth: t1.depth,
      setbacks: t1.setbacks,
      orientation: t1.orientation,
      slope: t1.slope,
    });

    let m1 = generateDesign({ projectId: p1Id, requirements: req1, terrain: t1, version: 1 });
    const cost1 = estimateCost(m1);
    const val1 = validateModel(m1, { cost: cost1 });
    const p1Versions: VersionRow[] = [
      {
        id: 'ver-1-1',
        project_id: p1Id,
        version: 1,
        label: 'Propuesta inicial generada',
        model: m1,
        cost: cost1,
        validation: val1,
        parent_version: null,
        created_by: 'usr-arch',
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      },
    ];

    // Seed modification 1: Amplía la cocina a 16 m2
    const opMod1 = await interpret('Amplía la cocina a 16 m2', { model: m1 });
    if (opMod1.operations.length > 0) {
      const res1 = applyOperations(m1, opMod1.operations);
      if (res1.applied.length > 0) {
        const prev1 = m1;
        m1 = { ...res1.model, version: 2, createdAt: new Date(Date.now() - 86400000 * 2).toISOString() };
        const c2 = estimateCost(m1);
        const v2 = validateModel(m1, { cost: c2 });
        p1Versions.push({
          id: 'ver-1-2',
          project_id: p1Id,
          version: 2,
          label: 'Modificación: Amplía la cocina a 16 m2',
          model: m1,
          cost: c2,
          validation: v2,
          parent_version: 1,
          created_by: 'usr-client',
          created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        });
        const diff1 = diffModels(prev1, m1);
        this.changes.set(p1Id, [
          {
            id: 'chg-1-2',
            project_id: p1Id,
            from_version: 1,
            to_version: 2,
            changes: diff1.changes,
            summary: diff1.summary.join('; ') || 'Ampliación de cocina',
            source: 'instruction',
            created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
          },
        ]);
        const pRow = this.projects.get(p1Id)!;
        pRow.current_version = 2;
      }
    }

    this.versions.set(p1Id, p1Versions);
    this.instructions.set(p1Id, [
      {
        id: 'inst-1-1',
        project_id: p1Id,
        version: 1,
        text: 'Amplía la cocina a 16 m2',
        intent: 'modify:resize_room',
        operations: opMod1.operations,
        rejected: [],
        source: 'nlu',
        confidence: 0.95,
        user_id: 'usr-client',
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
    ]);

    // Seed project 2: Vivienda minimalista de un piso
    const p2Id = 'proj-minimal';
    const t2: Terrain = {
      width: 8,
      depth: 16,
      setbacks: { front: 2, back: 1.5, left: 1.2, right: 1.2 },
      orientation: 'north',
      slope: 0,
    };
    const req2: Requirements = {
      style: 'minimalist',
      levels: 1,
      bedrooms: 2,
      bathrooms: 2,
      parkingSpaces: 1,
      familySize: 3,
      budget: 98000,
      features: ['garden', 'openKitchen', 'laundry'],
      notes: [],
    };
    this.projects.set(p2Id, {
      id: p2Id,
      client_id: 'usr-client',
      name: 'Vivienda minimalista de un piso',
      style: 'minimalist',
      levels: 1,
      bedrooms: 2,
      bathrooms: 2,
      parking_spaces: 1,
      family_size: 3,
      budget: 98000,
      features: req2.features,
      notes: [],
      owner_id: 'usr-arch',
      status: 'approved',
      current_version: 1,
      created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
      updated_at: new Date().toISOString(),
    });
    this.terrains.set(p2Id, {
      id: 'terr-2',
      project_id: p2Id,
      width: t2.width,
      depth: t2.depth,
      setbacks: t2.setbacks,
      orientation: t2.orientation,
      slope: t2.slope,
    });
    const m2 = generateDesign({ projectId: p2Id, requirements: req2, terrain: t2, version: 1 });
    const c2 = estimateCost(m2);
    const v2 = validateModel(m2, { cost: c2 });
    this.versions.set(p2Id, [
      {
        id: 'ver-2-1',
        project_id: p2Id,
        version: 1,
        label: 'Propuesta inicial generada',
        model: m2,
        cost: c2,
        validation: v2,
        parent_version: null,
        created_by: 'usr-arch',
        created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
      },
    ]);

    // Seed project 3: Casa mediterránea familiar
    const p3Id = 'proj-med';
    const t3: Terrain = {
      width: 12,
      depth: 25,
      setbacks: { front: 3, back: 2, left: 1.5, right: 1.5 },
      orientation: 'east',
      slope: 0,
    };
    const req3: Requirements = {
      style: 'mediterranean',
      levels: 2,
      bedrooms: 4,
      bathrooms: 3,
      parkingSpaces: 2,
      familySize: 5,
      budget: 260000,
      features: ['garden', 'terrace', 'openKitchen', 'study', 'laundry'],
      notes: [],
    };
    this.projects.set(p3Id, {
      id: p3Id,
      client_id: 'usr-client',
      name: 'Casa mediterránea familiar',
      style: 'mediterranean',
      levels: 2,
      bedrooms: 4,
      bathrooms: 3,
      parking_spaces: 2,
      family_size: 5,
      budget: 260000,
      features: req3.features,
      notes: [],
      owner_id: 'usr-arch',
      status: 'designing',
      current_version: 1,
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    });
    this.terrains.set(p3Id, {
      id: 'terr-3',
      project_id: p3Id,
      width: t3.width,
      depth: t3.depth,
      setbacks: t3.setbacks,
      orientation: t3.orientation,
      slope: t3.slope,
    });
    const m3 = generateDesign({ projectId: p3Id, requirements: req3, terrain: t3, version: 1 });
    const c3 = estimateCost(m3);
    const v3 = validateModel(m3, { cost: c3 });
    this.versions.set(p3Id, [
      {
        id: 'ver-3-1',
        project_id: p3Id,
        version: 1,
        label: 'Propuesta inicial generada',
        model: m3,
        cost: c3,
        validation: v3,
        parent_version: null,
        created_by: 'usr-arch',
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
    ]);
  }

  public findUserByEmail(email: string): UserRow | undefined {
    const clean = email.trim().toLowerCase();
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === clean) return u;
    }
    return undefined;
  }

  public findUserById(id: string): UserRow | undefined {
    return this.users.get(id);
  }

  public async registerUser(input: { email: string; password: string; fullName: string; role?: string }): Promise<UserRow> {
    const existing = this.findUserByEmail(input.email);
    if (existing) throw new Error('Ya existe una cuenta con ese correo electrónico.');
    const id = randomUUID();
    const hash = await bcrypt.hash(input.password, 10);
    const user: UserRow = {
      id,
      email: input.email.trim().toLowerCase(),
      password_hash: hash,
      full_name: input.fullName.trim(),
      phone: null,
      role_id: input.role ?? 'client',
    };
    this.users.set(id, user);
    return user;
  }

  public listProjects(): ProjectRow[] {
    return Array.from(this.projects.values()).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }

  public getProject(id: string): ProjectRow | undefined {
    return this.projects.get(id);
  }

  public getTerrain(projectId: string): TerrainRow | undefined {
    return this.terrains.get(projectId);
  }

  public getLatestVersion(projectId: string): VersionRow | undefined {
    const list = this.versions.get(projectId) ?? [];
    if (list.length === 0) return undefined;
    return list[list.length - 1];
  }

  public getVersion(projectId: string, versionNumber: number): VersionRow | undefined {
    const list = this.versions.get(projectId) ?? [];
    return list.find((v) => v.version === versionNumber);
  }

  public listVersions(projectId: string): VersionRow[] {
    return this.versions.get(projectId) ?? [];
  }

  public listChanges(projectId: string): ChangeRow[] {
    return this.changes.get(projectId) ?? [];
  }

  public listInstructions(projectId: string): InstructionRow[] {
    return this.instructions.get(projectId) ?? [];
  }

  public createProject(input: {
    name: string;
    style: string;
    levels: number;
    bedrooms: number;
    bathrooms: number;
    parkingSpaces: number;
    familySize: number;
    budget: number;
    features: string[];
    notes?: string[];
    terrain: { width: number; depth: number; setbacks?: Setbacks; orientation?: string; slope?: number };
    userId: string;
  }): { project: ProjectRow; version: VersionRow } {
    const id = randomUUID();
    const setbacks = input.terrain.setbacks ?? DEFAULT_SETBACKS;
    const terrain: Terrain = {
      width: input.terrain.width,
      depth: input.terrain.depth,
      setbacks,
      orientation: (input.terrain.orientation as Terrain['orientation']) ?? 'south',
      slope: input.terrain.slope ?? 0,
    };
    const requirements: Requirements = {
      style: input.style as StyleId,
      levels: input.levels,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      parkingSpaces: input.parkingSpaces,
      familySize: input.familySize,
      budget: input.budget,
      features: (input.features as Feature[]) ?? [],
      notes: input.notes ?? [],
    };

    const model = generateDesign({ projectId: id, requirements, terrain, version: 1 });
    const cost = estimateCost(model);
    const validation = validateModel(model, { cost });

    const now = new Date().toISOString();
    const project: ProjectRow = {
      id,
      client_id: input.userId,
      name: input.name,
      style: input.style,
      levels: input.levels,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      parking_spaces: input.parkingSpaces,
      family_size: input.familySize,
      budget: input.budget,
      features: input.features,
      notes: input.notes ?? [],
      owner_id: input.userId,
      status: 'designing',
      current_version: 1,
      created_at: now,
      updated_at: now,
    };

    const terrainRow: TerrainRow = {
      id: randomUUID(),
      project_id: id,
      width: terrain.width,
      depth: terrain.depth,
      setbacks: terrain.setbacks,
      orientation: terrain.orientation,
      slope: terrain.slope,
    };

    const versionRow: VersionRow = {
      id: randomUUID(),
      project_id: id,
      version: 1,
      label: 'Propuesta inicial generada',
      model,
      cost,
      validation,
      parent_version: null,
      created_by: input.userId,
      created_at: now,
    };

    this.projects.set(id, project);
    this.terrains.set(id, terrainRow);
    this.versions.set(id, [versionRow]);
    this.changes.set(id, []);
    this.instructions.set(id, []);

    return { project, version: versionRow };
  }

  public updateProjectStatus(projectId: string, status: string): ProjectRow {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Proyecto ${projectId} no encontrado`);
    project.status = status;
    project.updated_at = new Date().toISOString();
    return project;
  }

  public addVersion(projectId: string, versionRow: VersionRow): void {
    const list = this.versions.get(projectId) ?? [];
    list.push(versionRow);
    this.versions.set(projectId, list);
    const project = this.projects.get(projectId);
    if (project) {
      project.current_version = versionRow.version;
      project.updated_at = new Date().toISOString();
    }
  }

  public addChange(projectId: string, change: ChangeRow): void {
    const list = this.changes.get(projectId) ?? [];
    list.push(change);
    this.changes.set(projectId, list);
  }

  public addInstruction(projectId: string, inst: InstructionRow): void {
    const list = this.instructions.get(projectId) ?? [];
    list.push(inst);
    this.instructions.set(projectId, list);
  }
}

export const store = new Store();
