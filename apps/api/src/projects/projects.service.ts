import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { interpret, type ParsedIntent } from '@domus/assistant';
import {
  applyOperations,
  diffModels,
  estimateCost,
  generateDesign,
  summarizeRooms,
  validateModel,
  type DesignModel,
  type Feature,
  type Orientation,
  type Requirements,
  type Setbacks,
  type Terrain,
} from '@domus/domain';
import { APP_CONFIG } from '../db/db.module';
import { Repository, type ProjectRow, type TerrainRow, type VersionRow } from '../db/repository';
import type { AppConfig } from '../config';
import type { AuthUser } from '../auth/auth.guard';
import type { ApprovalDto, CreateProjectDto, UpdateStatusDto } from './dto';

const DEFAULT_SETBACKS: Setbacks = { front: 2, back: 2, left: 1.5, right: 1.5 };
import type { StyleId } from '@domus/domain';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly repository: Repository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /* ------------------------------ Utilidades ------------------------------- */

  private async withRepo<T>(fn: (repo: Repository) => Promise<T>): Promise<T> {
    return this.repository.database.transaction(async (db) => fn(new Repository(db)));
  }

  requirementsOf(project: ProjectRow): Requirements {
    return {
      style: project.style as StyleId,
      levels: Number(project.levels),
      bedrooms: Number(project.bedrooms),
      bathrooms: Number(project.bathrooms),
      parkingSpaces: Number(project.parking_spaces),
      budget: Number(project.budget),
      familySize: Number(project.family_size),
      features: (project.features as Feature[]) ?? [],
      notes: (project.notes as string[]) ?? [],
    };
  }

  terrainOf(row: TerrainRow): Terrain {
    return {
      width: Number(row.width),
      depth: Number(row.depth),
      setbacks: (row.setbacks as Setbacks) ?? DEFAULT_SETBACKS,
      orientation: (row.orientation as Orientation) ?? 'south',
      slope: Number(row.slope) || 0,
    };
  }

  private async audit(
    user: AuthUser | undefined,
    action: string,
    entity: string,
    entityId: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    await this.repository.insertAudit({
      id: randomUUID(),
      actor_id: user?.id ?? null,
      action,
      entity,
      entity_id: entityId,
      payload,
      ip: null,
    });
  }

  /* ------------------------------ Proyectos -------------------------------- */

  async create(dto: CreateProjectDto, user: AuthUser): Promise<unknown> {
    const terrain: Terrain = {
      width: dto.terrain.width,
      depth: dto.terrain.depth,
      setbacks: dto.terrain.setbacks ?? DEFAULT_SETBACKS,
      orientation: dto.terrain.orientation ?? 'south',
      slope: dto.terrain.slope ?? 0,
    };
    const requirements: Requirements = {
      style: dto.style as StyleId,
      levels: dto.levels,
      bedrooms: dto.bedrooms,
      bathrooms: dto.bathrooms,
      parkingSpaces: dto.parkingSpaces,
      budget: dto.budget,
      familySize: dto.familySize,
      features: (dto.features as Feature[]) ?? [],
      notes: dto.notes ?? [],
    };

    const projectId = randomUUID();
    const model = generateDesign({ projectId, requirements, terrain });
    const cost = estimateCost(model);
    const validation = validateModel(model, { cost });

    await this.withRepo(async (repo) => {
      let clientId = dto.clientId;
      if (clientId) {
        const client = await repo.getClient(clientId);
        if (!client) throw new NotFoundException(`No existe el cliente ${clientId}.`);
      } else {
        const client = await repo.insertClient({
          id: randomUUID(),
          user_id: user.role === 'client' ? user.id : null,
          full_name: dto.clientName ?? user.fullName,
          email: dto.clientEmail ?? (user.role === 'client' ? user.email : null),
          phone: dto.clientPhone ?? null,
          notes: null,
        });
        clientId = client.id;
      }

      await repo.insertProject({
        id: projectId,
        client_id: clientId,
        name: dto.name,
        style: dto.style,
        levels: dto.levels,
        bedrooms: dto.bedrooms,
        bathrooms: dto.bathrooms,
        parking_spaces: dto.parkingSpaces,
        family_size: dto.familySize,
        budget: dto.budget,
        features: requirements.features,
        notes: requirements.notes,
        owner_id: user.id,
      });
      await repo.insertTerrain({
        id: randomUUID(),
        project_id: projectId,
        width: terrain.width,
        depth: terrain.depth,
        setbacks: terrain.setbacks,
        orientation: terrain.orientation,
        slope: terrain.slope,
      });
      await repo.insertVersion({
        id: randomUUID(),
        project_id: projectId,
        version: 1,
        label: 'Propuesta inicial generada',
        model,
        cost,
        validation,
        parent_version: null,
        created_by: user.id,
      });
      await repo.setCurrentVersion(projectId, 1);
      await repo.updateProjectStatus(projectId, 'designing');
      await repo.replaceGeometry(projectId, model);
    });

    await this.audit(user, 'project.create', 'project', projectId, {
      style: dto.style,
      levels: dto.levels,
      validationErrors: validation.errors.length,
    });
    return this.detail(projectId);
  }

  async list(status?: string): Promise<unknown[]> {
    const projects = await this.repository.listProjects(status);
    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      style: project.style,
      levels: project.levels,
      bedrooms: project.bedrooms,
      bathrooms: project.bathrooms,
      budget: Number(project.budget),
      currentVersion: project.current_version,
      clientId: project.client_id,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    }));
  }

  async detail(projectId: string): Promise<unknown> {
    const project = await this.repository.getProject(projectId);
    if (!project) throw new NotFoundException(`No existe el proyecto ${projectId}.`);
    const terrainRow = await this.repository.getTerrain(projectId);
    const version = await this.repository.latestVersion(projectId);

    return {
      id: project.id,
      name: project.name,
      status: project.status,
      clientId: project.client_id,
      style: project.style,
      levels: Number(project.levels),
      bedrooms: Number(project.bedrooms),
      bathrooms: Number(project.bathrooms),
      parkingSpaces: Number(project.parking_spaces),
      familySize: Number(project.family_size),
      budget: Number(project.budget),
      features: project.features,
      notes: project.notes,
      currentVersion: project.current_version,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      terrain: terrainRow ? this.terrainOf(terrainRow) : null,
      requirements: this.requirementsOf(project),
      version: version
        ? {
            version: version.version,
            label: version.label,
            createdAt: version.created_at,
            model: version.model,
            cost: version.cost,
            validation: version.validation,
            summary: summarizeRooms(version.model),
          }
        : null,
      history: await this.repository.listChanges(projectId),
      instructions: await this.repository.listInstructions(projectId),
    };
  }

  async setStatus(projectId: string, dto: UpdateStatusDto, user: AuthUser): Promise<unknown> {
    const project = await this.repository.updateProjectStatus(projectId, dto.status);
    if (!project) throw new NotFoundException(`No existe el proyecto ${projectId}.`);
    await this.audit(user, 'project.status', 'project', projectId, { status: dto.status });
    return { id: project.id, status: project.status };
  }

  /* ------------------------------- Diseño ---------------------------------- */

  private async saveVersion(params: {
    projectId: string;
    version: number;
    label: string;
    model: DesignModel;
    parentVersion: number | null;
    user: AuthUser;
    previous?: DesignModel;
    source: 'generation' | 'instruction';
    instructionId?: string;
  }): Promise<{ version: VersionRow; changes: ReturnType<typeof diffModels> }> {
    const cost = estimateCost(params.model);
    const validation = validateModel(params.model, { cost });
    const changes = params.previous
      ? diffModels(params.previous, params.model)
      : { changes: [], summary: ['Propuesta inicial'], sameStructure: false };

    const version = await this.withRepo(async (repo) => {
      const inserted = await repo.insertVersion({
        id: randomUUID(),
        project_id: params.projectId,
        version: params.version,
        label: params.label,
        model: params.model,
        cost,
        validation,
        parent_version: params.parentVersion,
        created_by: params.user.id,
      });
      await repo.setCurrentVersion(params.projectId, params.version);
      await repo.replaceGeometry(params.projectId, params.model);
      if (params.previous) {
        await repo.insertChange({
          id: randomUUID(),
          project_id: params.projectId,
          from_version: params.parentVersion ?? params.version - 1,
          to_version: params.version,
          changes: changes.changes,
          summary: changes.summary.join('; ') || 'Sin cambios detectados',
          source: params.source,
        });
      }
      return inserted;
    });

    await this.audit(params.user, `design.${params.source}`, 'project', params.projectId, {
      version: params.version,
      changes: changes.changes.length,
      validationErrors: validation.errors.length,
    });

    return { version, changes };
  }

  async generate(projectId: string, user: AuthUser, label = 'Nueva propuesta generada'): Promise<unknown> {
    const project = await this.repository.getProject(projectId);
    if (!project) throw new NotFoundException(`No existe el proyecto ${projectId}.`);
    const terrainRow = await this.repository.getTerrain(projectId);
    if (!terrainRow) throw new NotFoundException('El proyecto no tiene terreno registrado.');
    const previous = await this.repository.latestVersion(projectId);
    const requirements = this.requirementsOf(project);
    const terrain = this.terrainOf(terrainRow);
    const version = (previous?.version ?? 0) + 1;

    const model = generateDesign({ projectId, requirements, terrain, version });
    const saved = await this.saveVersion({
      projectId,
      version,
      label,
      model,
      parentVersion: previous?.version ?? null,
      user,
      previous: previous?.model,
      source: 'generation',
    });

    return {
      version: saved.version.version,
      model: saved.version.model,
      cost: saved.version.cost,
      validation: saved.version.validation,
      changes: saved.changes.changes,
      summary: saved.changes.summary,
    };
  }

  async instruct(projectId: string, text: string, user: AuthUser): Promise<unknown> {
    const project = await this.repository.getProject(projectId);
    if (!project) throw new NotFoundException(`No existe el proyecto ${projectId}.`);
    const terrainRow = await this.repository.getTerrain(projectId);
    if (!terrainRow) throw new NotFoundException('El proyecto no tiene terreno registrado.');

    let current = await this.repository.latestVersion(projectId);
    if (!current) {
      await this.generate(projectId, user);
      current = await this.repository.latestVersion(projectId);
    }
    if (!current) throw new NotFoundException('No se pudo generar una versión inicial.');

    const intent: ParsedIntent = await interpret(
      text,
      { model: current.model },
      { llm: this.config.llm },
    );

    await this.repository.insertInstruction({
      id: randomUUID(),
      project_id: projectId,
      version: current.version,
      text,
      intent: `${intent.intent}:${intent.operations.map((operation) => operation.op).join(',')}`,
      operations: intent.operations,
      rejected: [],
      source: intent.source,
      confidence: intent.confidence,
      user_id: user.id,
    });

    if (intent.intent === 'compare') {
      const target = Math.max(1, current.version - 1);
      const comparison = await this.compare(projectId, target, current.version);
      return { intent, comparison, message: intent.explanation };
    }

    if (intent.intent === 'generate') {
      const requirements: Requirements = {
        ...this.requirementsOf(project),
        ...(intent.requirements ?? {}),
      };
      const terrain: Terrain = intent.terrain
        ? { ...this.terrainOf(terrainRow), ...intent.terrain, setbacks: intent.terrain.setbacks ?? this.terrainOf(terrainRow).setbacks }
        : this.terrainOf(terrainRow);

      await this.withRepo(async (repo) => {
        await repo.updateProjectRequirements(projectId, requirements);
        await repo.updateTerrain(projectId, terrain);
      });

      const version = current.version + 1;
      const model = generateDesign({ projectId, requirements, terrain, version });
      const saved = await this.saveVersion({
        projectId,
        version,
        label: 'Propuesta regenerada según nuevos requisitos',
        model,
        parentVersion: current.version,
        user,
        previous: current.model,
        source: 'generation',
      });
      return {
        intent,
        version: saved.version.version,
        model: saved.version.model,
        cost: saved.version.cost,
        validation: saved.version.validation,
        changes: saved.changes.changes,
        summary: saved.changes.summary,
        clarifications: intent.clarifications,
      };
    }

    if (intent.operations.length === 0) {
      throw new UnprocessableEntityException({
        message: intent.explanation,
        clarifications: intent.clarifications,
        unresolved: intent.unresolved,
        notes: intent.notes,
      });
    }

    const result = applyOperations(current.model, intent.operations);
    if (result.applied.length === 0) {
      throw new UnprocessableEntityException({
        message:
          'Ninguna de las operaciones solicitadas pudo aplicarse sin romper la coherencia del modelo.',
        rejected: result.rejected,
        validation: result.report,
        explanation: intent.explanation,
      });
    }

    const version = current.version + 1;
    const model: DesignModel = {
      ...result.model,
      version,
      createdAt: new Date().toISOString(),
    };
    const saved = await this.saveVersion({
      projectId,
      version,
      label: `Modificación: ${text.slice(0, 80)}`,
      model,
      parentVersion: current.version,
      user,
      previous: current.model,
      source: 'instruction',
    });

    if (result.rejected.length > 0) {
      await this.repository.insertInstruction({
        id: randomUUID(),
        project_id: projectId,
        version,
        text,
        intent: `rejected:${result.rejected.map((item) => item.operation.op).join(',')}`,
        operations: result.rejected.map((item) => item.operation),
        rejected: result.rejected,
        source: intent.source,
        confidence: intent.confidence,
        user_id: user.id,
      });
    }

    return {
      intent,
      version: saved.version.version,
      model: saved.version.model,
      cost: saved.version.cost,
      validation: saved.version.validation,
      applied: result.applied,
      rejected: result.rejected,
      warnings: [...intent.notes, ...result.warnings],
      changes: saved.changes.changes,
      summary: saved.changes.summary,
      clarifications: intent.clarifications,
    };
  }

  /* ------------------------------ Versiones -------------------------------- */

  async versions(projectId: string): Promise<unknown[]> {
    return this.repository.listVersions(projectId);
  }

  async version(projectId: string, version: number): Promise<unknown> {
    const row = await this.repository.getVersion(projectId, version);
    if (!row) throw new NotFoundException(`No existe la versión ${version} del proyecto ${projectId}.`);
    return {
      version: row.version,
      label: row.label,
      createdAt: row.created_at,
      parentVersion: row.parent_version,
      model: row.model,
      cost: row.cost,
      validation: row.validation,
      summary: summarizeRooms(row.model),
    };
  }

  async compare(projectId: string, fromVersion: number, toVersion: number): Promise<unknown> {
    const [a, b] = await Promise.all([
      this.repository.getVersion(projectId, fromVersion),
      this.repository.getVersion(projectId, toVersion),
    ]);
    if (!a) throw new NotFoundException(`No existe la versión ${fromVersion}.`);
    if (!b) throw new NotFoundException(`No existe la versión ${toVersion}.`);
    const diff = diffModels(a.model, b.model);
    const area = (model: DesignModel) =>
      model.building.levels.reduce(
        (acc, level) => acc + level.rooms.reduce((sum, room) => sum + room.rect.w * room.rect.h, 0),
        0,
      );
    return {
      from: { version: a.version, area: Number(area(a.model).toFixed(2)), total: a.cost.total },
      to: { version: b.version, area: Number(area(b.model).toFixed(2)), total: b.cost.total },
      areaDelta: Number((area(b.model) - area(a.model)).toFixed(2)),
      costDelta: b.cost.total - a.cost.total,
      changes: diff.changes,
      summary: diff.summary,
      sameStructure: diff.sameStructure,
    };
  }

  /** Restaura una versión anterior como una versión nueva (deshacer con historial). */
  async restore(projectId: string, version: number, user: AuthUser): Promise<unknown> {
    const target = await this.repository.getVersion(projectId, version);
    if (!target) throw new NotFoundException(`No existe la versión ${version}`);
    const latest = await this.repository.latestVersion(projectId);
    const next = (latest?.version ?? 0) + 1;
    const model: DesignModel = {
      ...structuredClone(target.model),
      version: next,
      createdAt: new Date().toISOString(),
    };
    const saved = await this.saveVersion({
      projectId,
      version: next,
      label: `Restauración de la versión ${version}`,
      model,
      parentVersion: latest?.version ?? null,
      user,
      previous: latest?.model,
      source: 'generation',
    });
    return {
      version: saved.version.version,
      model: saved.version.model,
      cost: saved.version.cost,
      validation: saved.version.validation,
      changes: saved.changes.changes,
      summary: saved.changes.summary,
    };
  }

  /* ------------------------------ Aprobaciones ----------------------------- */

  async approve(projectId: string, dto: ApprovalDto, user: AuthUser): Promise<unknown> {
    const version = await this.repository.getVersion(projectId, dto.version);
    if (!version) throw new NotFoundException(`No existe la versión ${dto.version}.`);
    await this.repository.insertApproval({
      id: randomUUID(),
      project_id: projectId,
      version: dto.version,
      status: dto.status,
      reviewer_id: user.id,
      comments: dto.comments ?? null,
    });
    const nextStatus =
      dto.status === 'approved' ? 'approved' : dto.status === 'rejected' ? 'designing' : 'review';
    await this.repository.updateProjectStatus(projectId, nextStatus);
    await this.audit(user, 'project.approval', 'project', projectId, {
      version: dto.version,
      status: dto.status,
    });
    return { projectId, version: dto.version, status: dto.status, projectStatus: nextStatus };
  }

  async approvals(projectId: string): Promise<unknown[]> {
    return this.repository.listApprovals(projectId);
  }

  async changes(projectId: string): Promise<unknown[]> {
    return this.repository.listChanges(projectId);
  }
}
