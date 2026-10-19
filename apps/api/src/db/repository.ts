import type { DesignModel, CostReport, ValidationReport } from '@domus/domain';
import type { Db } from './database';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  phone: string | null;
  role_id: string;
  created_at: string;
  last_login_at: string | null;
}

export interface ClientRow {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

export interface ProjectRow {
  id: string;
  client_id: string;
  name: string;
  status: string;
  style: string;
  levels: number;
  bedrooms: number;
  bathrooms: number;
  parking_spaces: number;
  family_size: number;
  budget: string | number;
  features: unknown;
  notes: unknown;
  current_version: number;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TerrainRow {
  id: string;
  project_id: string;
  width: string | number;
  depth: string | number;
  setbacks: unknown;
  orientation: string;
  slope: string | number;
}

export interface VersionRow {
  id: string;
  project_id: string;
  version: number;
  label: string | null;
  model: DesignModel;
  cost: CostReport;
  validation: ValidationReport;
  parent_version: number | null;
  created_by: string | null;
  created_at: string;
}

export interface RequestContext {
  userId?: string;
  ip?: string;
}

/**
 * Acceso a datos. SQL explícito sobre PostgreSQL, sin ORM, para mantener
 * control fino de las consultas y de las transacciones.
 */
export class Repository {
  constructor(private readonly db: Db) {}

  get database(): Db {
    return this.db;
  }

  /* ------------------------------- Usuarios ------------------------------- */
  async findUserByEmail(email: string): Promise<UserRow | null> {
    const rows = await this.db.query<UserRow>('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
    return rows[0] ?? null;
  }

  async findUserById(id: string): Promise<UserRow | null> {
    const rows = await this.db.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  async insertUser(user: Omit<UserRow, 'created_at' | 'last_login_at'>): Promise<UserRow> {
    const rows = await this.db.query<UserRow>(
      `INSERT INTO users (id, email, password_hash, full_name, phone, role_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [user.id, user.email, user.password_hash, user.full_name, user.phone, user.role_id],
    );
    return rows[0];
  }

  async touchLogin(id: string): Promise<void> {
    await this.db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
  }

  /* ------------------------------- Clientes ------------------------------- */
  async listClients(): Promise<ClientRow[]> {
    return this.db.query<ClientRow>('SELECT * FROM clients ORDER BY created_at DESC');
  }

  async getClient(id: string): Promise<ClientRow | null> {
    const rows = await this.db.query<ClientRow>('SELECT * FROM clients WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  async insertClient(client: Omit<ClientRow, 'created_at'>): Promise<ClientRow> {
    const rows = await this.db.query<ClientRow>(
      `INSERT INTO clients (id, user_id, full_name, email, phone, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [client.id, client.user_id, client.full_name, client.email, client.phone, client.notes],
    );
    return rows[0];
  }

  /* ------------------------------- Proyectos ------------------------------ */
  async insertProject(project: {
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
    features: unknown;
    notes: unknown;
    owner_id: string | null;
  }): Promise<ProjectRow> {
    const rows = await this.db.query<ProjectRow>(
      `INSERT INTO projects
        (id, client_id, name, style, levels, bedrooms, bathrooms, parking_spaces, family_size, budget, features, notes, owner_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13) RETURNING *`,
      [
        project.id,
        project.client_id,
        project.name,
        project.style,
        project.levels,
        project.bedrooms,
        project.bathrooms,
        project.parking_spaces,
        project.family_size,
        project.budget,
        JSON.stringify(project.features),
        JSON.stringify(project.notes),
        project.owner_id,
      ],
    );
    return rows[0];
  }

  async listProjects(status?: string): Promise<ProjectRow[]> {
    if (status) {
      return this.db.query<ProjectRow>('SELECT * FROM projects WHERE status = $1 ORDER BY updated_at DESC', [status]);
    }
    return this.db.query<ProjectRow>('SELECT * FROM projects ORDER BY updated_at DESC');
  }

  async getProject(id: string): Promise<ProjectRow | null> {
    const rows = await this.db.query<ProjectRow>('SELECT * FROM projects WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  async updateProjectStatus(id: string, status: string): Promise<ProjectRow | null> {
    const rows = await this.db.query<ProjectRow>(
      'UPDATE projects SET status = $2, updated_at = now() WHERE id = $1 RETURNING *',
      [id, status],
    );
    return rows[0] ?? null;
  }

  async setCurrentVersion(id: string, version: number): Promise<void> {
    await this.db.query('UPDATE projects SET current_version = $2, updated_at = now() WHERE id = $1', [
      id,
      version,
    ]);
  }

  async insertTerrain(terrain: Omit<TerrainRow, 'id'> & { id: string }): Promise<TerrainRow> {
    const rows = await this.db.query<TerrainRow>(
      `INSERT INTO terrains (id, project_id, width, depth, setbacks, orientation, slope)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING *`,
      [
        terrain.id,
        terrain.project_id,
        terrain.width,
        terrain.depth,
        JSON.stringify(terrain.setbacks),
        terrain.orientation,
        terrain.slope,
      ],
    );
    return rows[0];
  }

  async getTerrain(projectId: string): Promise<TerrainRow | null> {
    const rows = await this.db.query<TerrainRow>('SELECT * FROM terrains WHERE project_id = $1', [projectId]);
    return rows[0] ?? null;
  }

  async updateTerrain(
    projectId: string,
    terrain: { width: number; depth: number; setbacks: unknown; orientation: string; slope: number },
  ): Promise<void> {
    await this.db.query(
      `UPDATE terrains
       SET width = $2, depth = $3, setbacks = $4::jsonb, orientation = $5, slope = $6
       WHERE project_id = $1`,
      [projectId, terrain.width, terrain.depth, JSON.stringify(terrain.setbacks), terrain.orientation, terrain.slope],
    );
  }

  async updateProjectRequirements(
    projectId: string,
    requirements: {
      style: string;
      levels: number;
      bedrooms: number;
      bathrooms: number;
      parkingSpaces: number;
      familySize: number;
      budget: number;
      features: unknown;
      notes: unknown;
    },
  ): Promise<void> {
    await this.db.query(
      `UPDATE projects SET
         style = $2, levels = $3, bedrooms = $4, bathrooms = $5, parking_spaces = $6,
         family_size = $7, budget = $8, features = $9::jsonb, notes = $10::jsonb,
         updated_at = now()
       WHERE id = $1`,
      [
        projectId,
        requirements.style,
        requirements.levels,
        requirements.bedrooms,
        requirements.bathrooms,
        requirements.parkingSpaces,
        requirements.familySize,
        requirements.budget,
        JSON.stringify(requirements.features),
        JSON.stringify(requirements.notes),
      ],
    );
  }

  /* -------------------------------- Versiones ------------------------------ */
  async insertVersion(version: {
    id: string;
    project_id: string;
    version: number;
    label: string | null;
    model: DesignModel;
    cost: CostReport;
    validation: ValidationReport;
    parent_version: number | null;
    created_by: string | null;
  }): Promise<VersionRow> {
    const rows = await this.db.query<VersionRow>(
      `INSERT INTO design_versions (id, project_id, version, label, model, cost, validation, parent_version, created_by)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9) RETURNING *`,
      [
        version.id,
        version.project_id,
        version.version,
        version.label,
        JSON.stringify(version.model),
        JSON.stringify(version.cost),
        JSON.stringify(version.validation),
        version.parent_version,
        version.created_by,
      ],
    );
    return rows[0];
  }

  async listVersions(projectId: string): Promise<Array<Pick<VersionRow, 'id' | 'version' | 'label' | 'created_at' | 'parent_version' | 'validation' | 'cost'>>> {
    return this.db.query(
      `SELECT id, version, label, created_at, parent_version, validation, cost
       FROM design_versions WHERE project_id = $1 ORDER BY version ASC`,
      [projectId],
    );
  }

  async getVersion(projectId: string, version: number): Promise<VersionRow | null> {
    const rows = await this.db.query<VersionRow>(
      'SELECT * FROM design_versions WHERE project_id = $1 AND version = $2',
      [projectId, version],
    );
    return rows[0] ?? null;
  }

  async latestVersion(projectId: string): Promise<VersionRow | null> {
    const rows = await this.db.query<VersionRow>(
      'SELECT * FROM design_versions WHERE project_id = $1 ORDER BY version DESC LIMIT 1',
      [projectId],
    );
    return rows[0] ?? null;
  }

  /* ---------------------- Instrucciones, cambios y auditoría --------------- */
  async insertInstruction(instruction: {
    id: string;
    project_id: string;
    version: number;
    text: string;
    intent: string;
    operations: unknown;
    rejected: unknown;
    source: string;
    confidence: number;
    user_id: string | null;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO modification_instructions
        (id, project_id, version, text, intent, operations, rejected, source, confidence, user_id)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)`,
      [
        instruction.id,
        instruction.project_id,
        instruction.version,
        instruction.text,
        instruction.intent,
        JSON.stringify(instruction.operations),
        JSON.stringify(instruction.rejected),
        instruction.source,
        instruction.confidence,
        instruction.user_id,
      ],
    );
  }

  async listInstructions(projectId: string) {
    return this.db.query(
      `SELECT id, version, text, intent, source, confidence, created_at
       FROM modification_instructions WHERE project_id = $1 ORDER BY created_at ASC`,
      [projectId],
    );
  }

  async insertChange(change: {
    id: string;
    project_id: string;
    from_version: number;
    to_version: number;
    changes: unknown;
    summary: string;
    source: string;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO change_history (id, project_id, from_version, to_version, changes, summary, source)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
      [change.id, change.project_id, change.from_version, change.to_version, JSON.stringify(change.changes), change.summary, change.source],
    );
  }

  async listChanges(projectId: string) {
    return this.db.query(
      `SELECT id, from_version, to_version, changes, summary, created_at
       FROM change_history WHERE project_id = $1 ORDER BY created_at ASC`,
      [projectId],
    );
  }

  async insertApproval(approval: {
    id: string;
    project_id: string;
    version: number;
    status: string;
    reviewer_id: string | null;
    comments: string | null;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO approvals (id, project_id, version, status, reviewer_id, comments, decided_at)
       VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $4 = 'pending' THEN NULL ELSE now() END)`,
      [approval.id, approval.project_id, approval.version, approval.status, approval.reviewer_id, approval.comments],
    );
  }

  async listApprovals(projectId: string) {
    return this.db.query(
      `SELECT id, version, status, reviewer_id, comments, decided_at, created_at
       FROM approvals WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId],
    );
  }

  async insertAudit(event: {
    id: string;
    actor_id: string | null;
    action: string;
    entity: string;
    entity_id: string | null;
    payload: unknown;
    ip: string | null;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_events (id, actor_id, action, entity, entity_id, payload, ip)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
      [event.id, event.actor_id, event.action, event.entity, event.entity_id, JSON.stringify(event.payload), event.ip],
    );
  }

  async listAudit(limit = 100) {
    return this.db.query(
      `SELECT id, actor_id, action, entity, entity_id, payload, created_at
       FROM audit_events ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
  }

  /* -------------------------------- Catálogo ------------------------------- */
  async listMaterials(category?: string) {
    if (category) {
      return this.db.query('SELECT * FROM materials WHERE category = $1 ORDER BY unit_cost ASC', [category]);
    }
    return this.db.query('SELECT * FROM materials ORDER BY category, unit_cost ASC');
  }

  async listFurniture() {
    return this.db.query('SELECT * FROM furniture_catalog ORDER BY name');
  }

  async listSuppliers() {
    return this.db.query('SELECT * FROM suppliers ORDER BY name');
  }

  /* ------------------------- Proyección de geometría ----------------------- */
  async replaceGeometry(projectId: string, model: DesignModel): Promise<void> {
    await this.db.query('DELETE FROM buildings WHERE project_id = $1', [projectId]);
    const buildingId = `BLD-${projectId}`;
    await this.db.query(
      `INSERT INTO buildings (id, project_id, footprint, roof, facade_material_id, facade_color)
       VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6)`,
      [buildingId, projectId, JSON.stringify(model.building.footprint), JSON.stringify(model.building.roof), model.building.facadeMaterialId, model.building.facadeColor],
    );
    for (const level of model.building.levels) {
      const levelId = `${buildingId}-L${level.index}`;
      await this.db.query(
        'INSERT INTO levels (id, building_id, index, name, height) VALUES ($1,$2,$3,$4,$5)',
        [levelId, buildingId, level.index, level.name, level.height],
      );
      for (const room of level.rooms) {
        const roomRowId = levelId + '-' + room.id;
        await this.db.query(
          `INSERT INTO rooms (id, level_id, name, type, rect, area, height, floor_material_id, interior_color)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)`,
          [roomRowId, levelId, room.name, room.type, JSON.stringify(room.rect), room.rect.w * room.rect.h, room.height, room.floorMaterialId, room.interiorColor],
        );
      }
      for (const wall of level.walls) {
        await this.db.query('INSERT INTO elements (id, level_id, kind, payload) VALUES ($1,$2,$3,$4::jsonb)', [
          levelId + '-' + wall.id,
          levelId,
          'wall',
          JSON.stringify(wall),
        ]);
      }
      for (const room of level.rooms) {
        for (const item of room.furniture) {
          await this.db.query('INSERT INTO elements (id, level_id, kind, payload) VALUES ($1,$2,$3,$4::jsonb)', [
            levelId + '-' + item.id,
            levelId,
            'furniture',
            JSON.stringify(item),
          ]);
        }
      }
    }
  }

  /* ------------------------------ Indicadores ------------------------------ */
  async metrics() {
    const [totals] = await this.db.query<{
      clients: string;
      projects: string;
      active: string;
      review: string;
      finished: string;
      budget: string;
    }>(`
      SELECT
        (SELECT count(*) FROM clients) AS clients,
        (SELECT count(*) FROM projects) AS projects,
        (SELECT count(*) FROM projects WHERE status IN ('designing','review')) AS active,
        (SELECT count(*) FROM projects WHERE status = 'review') AS review,
        (SELECT count(*) FROM projects WHERE status IN ('approved','finished')) AS finished,
        (SELECT coalesce(sum(budget),0) FROM projects WHERE status <> 'archived') AS budget
    `);

    const byStatus = await this.db.query<{ status: string; total: string }>(
      'SELECT status, count(*) AS total FROM projects GROUP BY status ORDER BY status',
    );
    const byStyle = await this.db.query<{ style: string; total: string }>(
      'SELECT style, count(*) AS total FROM projects GROUP BY style ORDER BY total DESC',
    );
    const byMonth = await this.db.query<{ month: string; total: string }>(
      `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, count(*) AS total
       FROM projects GROUP BY 1 ORDER BY 1 DESC LIMIT 6`,
    );
    const [times] = await this.db.query<{ avg_hours: string | null; avg_changes: string | null }>(`
      SELECT
        (SELECT avg(extract(epoch FROM (v.created_at - p.created_at)) / 3600)
           FROM projects p JOIN design_versions v ON v.project_id = p.id AND v.version = 1) AS avg_hours,
        (SELECT avg(cnt) FROM (SELECT project_id, count(*) AS cnt FROM change_history GROUP BY project_id) t) AS avg_changes
    `);
    const materialUsage = await this.db.query<{ floor_material_id: string; total: string }>(
      `SELECT r.floor_material_id, count(*) AS total FROM rooms r GROUP BY 1 ORDER BY total DESC LIMIT 5`,
    );

    return {
      clients: Number(totals?.clients ?? 0),
      projects: Number(totals?.projects ?? 0),
      active: Number(totals?.active ?? 0),
      pendingReview: Number(totals?.review ?? 0),
      finished: Number(totals?.finished ?? 0),
      budgetTotal: Number(totals?.budget ?? 0),
      averageProposalHours: times?.avg_hours ? Number(times.avg_hours) : null,
      averageChangesPerProject: times?.avg_changes ? Number(times.avg_changes) : 0,
      byStatus: byStatus.map((row) => ({ status: row.status, total: Number(row.total) })),
      byStyle: byStyle.map((row) => ({ style: row.style, total: Number(row.total) })),
      byMonth: byMonth.map((row) => ({ month: row.month, total: Number(row.total) })),
      topFloorMaterials: materialUsage.map((row) => ({ materialId: row.floor_material_id, total: Number(row.total) })),
      satisfaction: null,
    };
  }
}
