import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import {
  FURNITURE_CATALOG,
  MATERIALS,
  applyOperations,
  diffModels,
  estimateCost,
  generateDesign,
  summarizeRooms,
  validateModel,
  type DesignModel,
  type Feature,
  type Requirements,
  type StyleId,
  type Terrain,
} from '@domus/domain';
import { loadConfig } from '../config';
import { createDatabase, runMigrations } from '../db/database';
import { Repository } from '../db/repository';

const PASSWORD = 'Domus2026!';

const USERS = [
  { email: 'admin@domus.local', name: 'Ana Torres', role: 'admin' },
  { email: 'arquitecto@domus.local', name: 'Luis Ramírez', role: 'architect' },
  { email: 'asesor@domus.local', name: 'Carla Mendoza', role: 'advisor' },
  { email: 'cliente@domus.local', name: 'Jorge Salas', role: 'client' },
];

const SUPPLIERS = [
  { id: 'SUP-001', name: 'Porcelanato Lima', contact: 'ventas@porcelanatolima.demo', city: 'Lima' },
  { id: 'SUP-002', name: 'Pinturas Unión', contact: 'proyectos@pinturasunion.demo', city: 'Lima' },
  { id: 'SUP-003', name: 'Vidriosur', contact: 'cotizaciones@vidriosur.demo', city: 'Arequipa' },
  { id: 'SUP-004', name: 'Carpintería Andina', contact: 'talleres@carpinteriaandina.demo', city: 'Cusco' },
];

interface SeedProject {
  name: string;
  style: StyleId;
  levels: number;
  bedrooms: number;
  bathrooms: number;
  parkingSpaces: number;
  familySize: number;
  budget: number;
  features: Feature[];
  terrain: Terrain;
  status: string;
  modification?: string[];
}

const PROJECTS: SeedProject[] = [
  {
    name: 'Casa moderna en La Molina',
    style: 'modern',
    levels: 2,
    bedrooms: 3,
    bathrooms: 2,
    parkingSpaces: 1,
    familySize: 4,
    budget: 185000,
    features: ['garden', 'terrace', 'openKitchen', 'laundry'],
    terrain: {
      width: 10,
      depth: 20,
      setbacks: { front: 2, back: 2, left: 1.5, right: 1.5 },
      orientation: 'south',
      slope: 0,
    },
    status: 'review',
    modification: ['Amplía la cocina a 16 m2', 'Agrega una isla central a la cocina', 'Cambia la fachada a tonos blancos y grises'],
  },
  {
    name: 'Vivienda minimalista de un piso',
    style: 'minimalist',
    levels: 1,
    bedrooms: 2,
    bathrooms: 2,
    parkingSpaces: 1,
    familySize: 3,
    budget: 98000,
    features: ['garden', 'openKitchen', 'laundry'],
    terrain: {
      width: 8,
      depth: 16,
      setbacks: { front: 2, back: 1.5, left: 1.2, right: 1.2 },
      orientation: 'north',
      slope: 0,
    },
    status: 'approved',
  },
  {
    name: 'Casa mediterránea familiar',
    style: 'mediterranean',
    levels: 2,
    bedrooms: 4,
    bathrooms: 3,
    parkingSpaces: 2,
    familySize: 5,
    budget: 260000,
    features: ['garden', 'terrace', 'openKitchen', 'study', 'laundry'],
    terrain: {
      width: 12,
      depth: 25,
      setbacks: { front: 3, back: 2, left: 1.5, right: 1.5 },
      orientation: 'east',
      slope: 0,
    },
    status: 'designing',
  },
];

async function main(): Promise<void> {
  const config = loadConfig();
  const db = await createDatabase(config);
  const repo = new Repository(db);

  try {
    await runMigrations(db);

    const [{ count }] = await db.query<{ count: string }>('SELECT count(*) AS count FROM users');
    if (Number(count) > 0) {
      console.log('La base de datos ya contiene datos; no se vuelve a sembrar.');
      return;
    }

    /* ------------------------------ Usuarios ------------------------------- */
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const userIds: string[] = [];
    for (const user of USERS) {
      const id = randomUUID();
      userIds.push(id);
      await repo.insertUser({
        id,
        email: user.email,
        password_hash: passwordHash,
        full_name: user.name,
        phone: null,
        role_id: user.role,
      });
    }
    const [adminId, architectId, advisorId, clientUserId] = userIds;

    /* ------------------------- Proveedores y catálogo ----------------------- */
    for (const supplier of SUPPLIERS) {
      await db.query('INSERT INTO suppliers (id, name, contact, city) VALUES ($1,$2,$3,$4)', [
        supplier.id,
        supplier.name,
        supplier.contact,
        supplier.city,
      ]);
    }

    for (const material of MATERIALS) {
      await db.query(
        `INSERT INTO materials (id, name, category, unit, unit_cost, brand, tier, color, maintenance, availability)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          material.id,
          material.name,
          material.category,
          material.unit,
          material.unitCost,
          material.brand,
          material.tier,
          material.color ?? null,
          material.maintenance ?? null,
          material.availability ?? null,
        ],
      );
    }

    for (const [type, spec] of Object.entries(FURNITURE_CATALOG)) {
      await db.query(
        'INSERT INTO furniture_catalog (id, name, width, depth, height, unit_cost) VALUES ($1,$2,$3,$4,$5,$6)',
        [type, spec.label, spec.width, spec.depth, spec.height, spec.cost],
      );
    }

    /* ------------------------------- Clientes ------------------------------ */
    const clients = [
      { id: randomUUID(), userId: clientUserId, name: 'Jorge Salas', email: 'cliente@domus.local', phone: '+51 987 654 321' },
      { id: randomUUID(), userId: null, name: 'María Fernanda Ruiz', email: 'mfruiz@example.com', phone: '+51 999 111 222' },
      { id: randomUUID(), userId: null, name: 'Constructora Andina SAC', email: 'proyectos@andina.example', phone: '+51 940 222 333' },
    ];
    for (const client of clients) {
      await repo.insertClient({
        id: client.id,
        user_id: client.userId,
        full_name: client.name,
        email: client.email,
        phone: client.phone,
        notes: null,
      });
    }

    /* ------------------------------- Proyectos ----------------------------- */
    let projectIndex = 0;
    for (const seed of PROJECTS) {
      const projectId = randomUUID();
      const client = clients[projectIndex % clients.length];
      projectIndex += 1;

      const requirements: Requirements = {
        style: seed.style,
        levels: seed.levels,
        bedrooms: seed.bedrooms,
        bathrooms: seed.bathrooms,
        parkingSpaces: seed.parkingSpaces,
        budget: seed.budget,
        familySize: seed.familySize,
        features: seed.features,
        notes: [],
      };

      await repo.insertProject({
        id: projectId,
        client_id: client.id,
        name: seed.name,
        style: seed.style,
        levels: seed.levels,
        bedrooms: seed.bedrooms,
        bathrooms: seed.bathrooms,
        parking_spaces: seed.parkingSpaces,
        family_size: seed.familySize,
        budget: seed.budget,
        features: seed.features,
        notes: [],
        owner_id: architectId,
      });
      await repo.insertTerrain({
        id: randomUUID(),
        project_id: projectId,
        width: seed.terrain.width,
        depth: seed.terrain.depth,
        setbacks: seed.terrain.setbacks,
        orientation: seed.terrain.orientation,
        slope: seed.terrain.slope,
      });

      let model: DesignModel = generateDesign({ projectId, requirements, terrain: seed.terrain });
      let version = 1;
      await repo.insertVersion({
        id: randomUUID(),
        project_id: projectId,
        version,
        label: 'Propuesta inicial generada',
        model,
        cost: estimateCost(model),
        validation: validateModel(model, { cost: estimateCost(model) }),
        parent_version: null,
        created_by: architectId,
      });

      if (seed.modification) {
        for (const text of seed.modification) {
          const operations = modificationOperations(text, model);
          if (operations.length === 0) continue;
          const result = applyOperations(model, operations);
          if (result.applied.length === 0) continue;
          const previous = model;
          version += 1;
          model = { ...result.model, version, createdAt: new Date().toISOString() };
          const cost = estimateCost(model);
          await repo.insertVersion({
            id: randomUUID(),
            project_id: projectId,
            version,
            label: `Modificación: ${text}`,
            model,
            cost,
            validation: validateModel(model, { cost }),
            parent_version: version - 1,
            created_by: clientUserId,
          });
          const diff = diffModels(previous, model);
          await repo.insertChange({
            id: randomUUID(),
            project_id: projectId,
            from_version: version - 1,
            to_version: version,
            changes: diff.changes,
            summary: diff.summary.join('; '),
            source: 'instruction',
          });
          await repo.insertInstruction({
            id: randomUUID(),
            project_id: projectId,
            version: version - 1,
            text,
            intent: `modify:${result.applied.map((operation) => operation.op).join(',')}`,
            operations: result.applied,
            rejected: result.rejected,
            source: 'rules',
            confidence: 0.85,
            user_id: clientUserId,
          });
        }
      }

      await repo.setCurrentVersion(projectId, version);
      await repo.updateProjectStatus(projectId, seed.status);
      await repo.replaceGeometry(projectId, model);

      if (seed.status === 'approved') {
        await repo.insertApproval({
          id: randomUUID(),
          project_id: projectId,
          version,
          status: 'approved',
          reviewer_id: architectId,
          comments: 'Propuesta revisada: cumple con el programa solicitado. Documentación preliminar.',
        });
      }

      const summary = summarizeRooms(model);
      console.log(
        `Proyecto "${seed.name}": ${version} versión(es), ${summary.length} ambientes, USD ${estimateCost(model).total.toFixed(0)}`,
      );
    }

    await repo.insertAudit({
      id: randomUUID(),
      actor_id: adminId,
      action: 'seed.load',
      entity: 'system',
      entity_id: null,
      payload: { projects: PROJECTS.length, users: USERS.length, materials: MATERIALS.length },
      ip: null,
    });
    await repo.insertAudit({
      id: randomUUID(),
      actor_id: advisorId,
      action: 'client.create',
      entity: 'client',
      entity_id: clients[1].id,
      payload: { fullName: clients[1].name },
      ip: null,
    });

    console.log('\nDatos de demostración cargados.');
    console.log(`Usuarios: ${USERS.map((user) => user.email).join(', ')}`);
    console.log(`Contraseña común: ${PASSWORD}`);
  } finally {
    await db.close();
  }
}

/** Traduce las tres instrucciones de demostración a operaciones del motor. */
function modificationOperations(text: string, model: DesignModel) {
  const kitchen = model.building.levels
    .flatMap((level) => level.rooms)
    .find((room) => room.type === 'kitchen');
  const normalized = text.toLowerCase();
  if (!kitchen) return [];
  if (normalized.includes('isla')) {
    return [{ op: 'add_furniture' as const, roomId: kitchen.id, type: 'kitchen_island' as const }];
  }
  if (normalized.includes('fachada')) {
    return [{ op: 'set_facade_color' as const, color: '#f2f0ea' }];
  }
  const match = /(\d+(?:[.,]\d+)?)\s*m2/.exec(normalized);
  const targetArea = match ? Number(match[1].replace(',', '.')) : kitchen.rect.w * kitchen.rect.h * 1.2;
  return [{ op: 'resize_room' as const, roomId: kitchen.id, targetArea }];
}

main().catch((error: unknown) => {
  console.error('Error al cargar los datos de demostración:', error);
  process.exit(1);
});
