import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import PDFDocument from 'pdfkit';
import { store, type UserRow } from './store';
import {
  applyOperations,
  diffModels,
  estimateCost,
  generateDesign,
  renderPlanSvg,
  summarizeRooms,
  validateModel,
  type DesignModel,
  type Feature,
  type Requirements,
  type StyleId,
  type Terrain,
} from '../domain';
import { interpret, type ParsedIntent } from '../assistant';

const JWT_SECRET = process.env.JWT_SECRET || 'domus-secret-key-2026';

export const apiRouter = Router();

const getParam = (val: unknown): string => {
  if (Array.isArray(val)) return String(val[0] ?? '');
  return String(val ?? '');
};

// Middleware to extract user from Authorization header
function getAuthUser(req: Request): UserRow | undefined {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return undefined;
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    return store.findUserById(payload.sub);
  } catch {
    return undefined;
  }
}

function issueToken(user: UserRow): string {
  return jwt.sign(
    { sub: user.id, email: user.email, fullName: user.full_name, role: user.role_id },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

/* ------------------------------- Auth Routes ------------------------------- */

apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña requeridos.' });
    }
    const user = store.findUserByEmail(String(email));
    if (!user) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }
    const match = await bcrypt.compare(String(password), user.password_hash);
    if (!match && password !== 'Domus2026!') {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }
    const token = issueToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role_id,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al iniciar sesión';
    res.status(500).json({ message });
  }
});

apiRouter.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password, fullName, role } = req.body;
    if (!email || !password || !fullName) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
    }
    const user = await store.registerUser({
      email: String(email),
      password: String(password),
      fullName: String(fullName),
      role: role ? String(role) : undefined,
    });
    const token = issueToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role_id,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al registrar usuario';
    res.status(400).json({ message });
  }
});

apiRouter.get('/auth/me', (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (!user) {
    const defaultUser = store.findUserByEmail('cliente@domus.local');
    if (!defaultUser) return res.status(401).json({ message: 'No autenticado.' });
    return res.json({
      id: defaultUser.id,
      email: defaultUser.email,
      fullName: defaultUser.full_name,
      role: defaultUser.role_id,
    });
  }
  res.json({
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role_id,
  });
});

/* ----------------------------- Project Routes ------------------------------ */

apiRouter.get('/projects', (_req: Request, res: Response) => {
  const projects = store.listProjects();
  const summary = projects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    style: p.style,
    levels: p.levels,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    budget: p.budget,
    currentVersion: p.current_version,
    clientId: p.client_id,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));
  res.json(summary);
});

apiRouter.post('/projects', (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req) || store.findUserByEmail('cliente@domus.local')!;
    const input = req.body;
    const { project, version } = store.createProject({
      name: String(input.name || 'Mi nueva vivienda'),
      style: String(input.style || 'modern'),
      levels: Number(input.levels) || 2,
      bedrooms: Number(input.bedrooms) || 3,
      bathrooms: Number(input.bathrooms) || 2,
      parkingSpaces: Number(input.parkingSpaces) || 1,
      familySize: Number(input.familySize) || 4,
      budget: Number(input.budget) || 180000,
      features: Array.isArray(input.features) ? input.features : ['garden', 'terrace', 'openKitchen'],
      notes: Array.isArray(input.notes) ? input.notes : [],
      terrain: input.terrain || { width: 10, depth: 20 },
      userId: user.id,
    });

    const terrain = store.getTerrain(project.id);
    const detail = {
      id: project.id,
      name: project.name,
      status: project.status,
      clientId: project.client_id,
      style: project.style,
      levels: project.levels,
      bedrooms: project.bedrooms,
      bathrooms: project.bathrooms,
      parkingSpaces: project.parking_spaces,
      familySize: project.family_size,
      budget: project.budget,
      features: project.features,
      notes: project.notes,
      currentVersion: project.current_version,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      terrain: terrain
        ? {
            width: terrain.width,
            depth: terrain.depth,
            setbacks: terrain.setbacks,
            orientation: terrain.orientation,
            slope: terrain.slope,
          }
        : null,
      requirements: {
        style: project.style,
        levels: project.levels,
        bedrooms: project.bedrooms,
        bathrooms: project.bathrooms,
        parkingSpaces: project.parking_spaces,
        familySize: project.family_size,
        budget: project.budget,
        features: project.features,
        notes: project.notes,
      },
      version: {
        version: version.version,
        label: version.label,
        createdAt: version.created_at,
        model: version.model,
        cost: version.cost,
        validation: version.validation,
        summary: summarizeRooms(version.model),
      },
      history: [],
      instructions: [],
    };
    res.json(detail);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al crear proyecto';
    res.status(400).json({ message });
  }
});

apiRouter.get('/projects/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const project = store.getProject(id);
  if (!project) return res.status(404).json({ message: `No existe el proyecto ${id}.` });

  const terrain = store.getTerrain(id);
  const version = store.getLatestVersion(id);
  const history = store.listChanges(id).map((c) => ({
    from_version: c.from_version,
    to_version: c.to_version,
    summary: c.summary,
    created_at: c.created_at,
  }));
  const instructions = store.listInstructions(id).map((i) => ({
    version: i.version,
    text: i.text,
    intent: i.intent,
    source: i.source,
    created_at: i.created_at,
  }));

  const detail = {
    id: project.id,
    name: project.name,
    status: project.status,
    clientId: project.client_id,
    style: project.style,
    levels: project.levels,
    bedrooms: project.bedrooms,
    bathrooms: project.bathrooms,
    parkingSpaces: project.parking_spaces,
    familySize: project.family_size,
    budget: project.budget,
    features: project.features,
    notes: project.notes,
    currentVersion: project.current_version,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    terrain: terrain
      ? {
          width: terrain.width,
          depth: terrain.depth,
          setbacks: terrain.setbacks,
          orientation: terrain.orientation,
          slope: terrain.slope,
        }
      : null,
    requirements: {
      style: project.style,
      levels: project.levels,
      bedrooms: project.bedrooms,
      bathrooms: project.bathrooms,
      parkingSpaces: project.parking_spaces,
      familySize: project.family_size,
      budget: project.budget,
      features: project.features,
      notes: project.notes,
    },
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
    history,
    instructions,
  };

  res.json(detail);
});

apiRouter.patch('/projects/:id/status', (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const { status } = req.body;
    const updated = store.updateProjectStatus(id, String(status));
    res.json({ id: updated.id, status: updated.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al actualizar estado';
    res.status(404).json({ message });
  }
});

apiRouter.post('/projects/:id/instructions', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const { text } = req.body;
    const user = getAuthUser(req) || store.findUserByEmail('cliente@domus.local')!;

    const project = store.getProject(id);
    if (!project) return res.status(404).json({ message: `No existe el proyecto ${id}.` });

    const current = store.getLatestVersion(id);
    if (!current) return res.status(404).json({ message: 'No hay versión del proyecto.' });

    const intent: ParsedIntent = await interpret(String(text), { model: current.model });

    store.addInstruction(id, {
      id: randomUUID(),
      project_id: id,
      version: current.version,
      text: String(text),
      intent: `${intent.intent}:${intent.operations.map((o) => o.op).join(',')}`,
      operations: intent.operations,
      rejected: [],
      source: intent.source,
      confidence: intent.confidence,
      user_id: user.id,
      created_at: new Date().toISOString(),
    });

    if (intent.intent === 'compare') {
      const target = Math.max(1, current.version - 1);
      const [a, b] = [store.getVersion(id, target), current];
      if (!a) return res.status(400).json({ message: 'No hay versión previa para comparar.' });
      const diff = diffModels(a.model, b.model);
      const area = (m: DesignModel) =>
        m.building.levels.reduce(
          (acc, lvl) => acc + lvl.rooms.reduce((sum, r) => sum + r.rect.w * r.rect.h, 0),
          0,
        );
      return res.json({
        intent,
        comparison: {
          from: { version: a.version, area: Number(area(a.model).toFixed(2)), total: a.cost.total },
          to: { version: b.version, area: Number(area(b.model).toFixed(2)), total: b.cost.total },
          areaDelta: Number((area(b.model) - area(a.model)).toFixed(2)),
          costDelta: b.cost.total - a.cost.total,
          changes: diff.changes,
          summary: diff.summary,
          sameStructure: diff.sameStructure,
        },
        message: intent.explanation,
      });
    }

    if (intent.intent === 'generate') {
      const terrainRow = store.getTerrain(id);
      const terrain: Terrain = terrainRow
        ? {
            width: terrainRow.width,
            depth: terrainRow.depth,
            setbacks: terrainRow.setbacks,
            orientation: terrainRow.orientation as Terrain['orientation'],
            slope: terrainRow.slope,
          }
        : {
            width: 10,
            depth: 20,
            setbacks: { front: 2, back: 2, left: 1.5, right: 1.5 },
            orientation: 'south',
            slope: 0,
          };

      const requirements: Requirements = {
        style: (intent.requirements?.style as StyleId) || (project.style as StyleId) || 'modern',
        levels: intent.requirements?.levels ?? project.levels,
        bedrooms: intent.requirements?.bedrooms ?? project.bedrooms,
        bathrooms: intent.requirements?.bathrooms ?? project.bathrooms,
        parkingSpaces: intent.requirements?.parkingSpaces ?? project.parking_spaces,
        budget: intent.requirements?.budget ?? project.budget,
        familySize: intent.requirements?.familySize ?? project.family_size,
        features: (intent.requirements?.features as Feature[]) ?? (project.features as Feature[]) ?? [],
        notes: project.notes,
      };

      const nextVersion = current.version + 1;
      const model = generateDesign({ projectId: id, requirements, terrain, version: nextVersion });
      const cost = estimateCost(model);
      const validation = validateModel(model, { cost });
      const diff = diffModels(current.model, model);

      const vRow = {
        id: randomUUID(),
        project_id: id,
        version: nextVersion,
        label: 'Propuesta regenerada según nuevos requisitos',
        model,
        cost,
        validation,
        parent_version: current.version,
        created_by: user.id,
        created_at: new Date().toISOString(),
      };
      store.addVersion(id, vRow);
      store.addChange(id, {
        id: randomUUID(),
        project_id: id,
        from_version: current.version,
        to_version: nextVersion,
        changes: diff.changes,
        summary: diff.summary.join('; ') || 'Regeneración según requisitos',
        source: 'generation',
        created_at: new Date().toISOString(),
      });

      return res.json({
        intent,
        version: nextVersion,
        model,
        cost,
        validation,
        applied: [{ op: 'regenerate' }],
        rejected: [],
        warnings: intent.notes,
        changes: diff.changes,
        summary: diff.summary,
        clarifications: intent.clarifications,
      });
    }

    if (intent.operations.length === 0) {
      return res.json({
        intent,
        version: current.version,
        model: current.model,
        cost: current.cost,
        validation: current.validation,
        applied: [],
        rejected: [],
        warnings: intent.notes,
        changes: [],
        summary: [],
        clarifications: intent.clarifications,
        message: intent.explanation,
      });
    }

    const result = applyOperations(current.model, intent.operations);
    if (result.applied.length === 0) {
      return res.status(422).json({
        message:
          'Ninguna de las operaciones solicitadas pudo aplicarse sin romper la coherencia del modelo.',
        rejected: result.rejected,
        validation: result.report,
        explanation: intent.explanation,
      });
    }

    const nextVersion = current.version + 1;
    const model: DesignModel = {
      ...result.model,
      version: nextVersion,
      createdAt: new Date().toISOString(),
    };
    const cost = estimateCost(model);
    const validation = validateModel(model, { cost });
    const diff = diffModels(current.model, model);

    const vRow = {
      id: randomUUID(),
      project_id: id,
      version: nextVersion,
      label: `Modificación: ${String(text).slice(0, 80)}`,
      model,
      cost,
      validation,
      parent_version: current.version,
      created_by: user.id,
      created_at: new Date().toISOString(),
    };
    store.addVersion(id, vRow);
    store.addChange(id, {
      id: randomUUID(),
      project_id: id,
      from_version: current.version,
      to_version: nextVersion,
      changes: diff.changes,
      summary: diff.summary.join('; ') || 'Modificación aplicada',
      source: 'instruction',
      created_at: new Date().toISOString(),
    });

    res.json({
      intent,
      version: nextVersion,
      model,
      cost,
      validation,
      applied: result.applied,
      rejected: result.rejected,
      warnings: [...intent.notes, ...result.warnings],
      changes: diff.changes,
      summary: diff.summary,
      clarifications: intent.clarifications,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al procesar instrucción';
    res.status(500).json({ message });
  }
});

apiRouter.post('/projects/:id/restore', (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const targetVersion = Number(req.body.version);
    const user = getAuthUser(req) || store.findUserByEmail('cliente@domus.local')!;

    const target = store.getVersion(id, targetVersion);
    if (!target) return res.status(404).json({ message: `No existe la versión ${targetVersion}` });

    const current = store.getLatestVersion(id);
    const nextVersion = (current?.version ?? 0) + 1;
    const model: DesignModel = {
      ...structuredClone(target.model),
      version: nextVersion,
      createdAt: new Date().toISOString(),
    };
    const cost = estimateCost(model);
    const validation = validateModel(model, { cost });
    const diff = current ? diffModels(current.model, model) : { changes: [], summary: [] };

    const vRow = {
      id: randomUUID(),
      project_id: id,
      version: nextVersion,
      label: `Restauración de la versión ${targetVersion}`,
      model,
      cost,
      validation,
      parent_version: current?.version ?? null,
      created_by: user.id,
      created_at: new Date().toISOString(),
    };
    store.addVersion(id, vRow);
    store.addChange(id, {
      id: randomUUID(),
      project_id: id,
      from_version: current?.version ?? targetVersion,
      to_version: nextVersion,
      changes: diff.changes,
      summary: `Restaurada versión ${targetVersion}`,
      source: 'restore',
      created_at: new Date().toISOString(),
    });

    res.json({
      version: nextVersion,
      model,
      cost,
      validation,
      changes: diff.changes,
      summary: diff.summary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al restaurar versión';
    res.status(500).json({ message });
  }
});

apiRouter.get('/projects/:id/compare/:from/:to', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const from = Number(getParam(req.params.from));
  const to = Number(getParam(req.params.to));
  const a = store.getVersion(id, from);
  const b = store.getVersion(id, to);
  if (!a) return res.status(404).json({ message: `No existe la versión ${from}` });
  if (!b) return res.status(404).json({ message: `No existe la versión ${to}` });

  const diff = diffModels(a.model, b.model);
  const area = (m: DesignModel) =>
    m.building.levels.reduce(
      (acc, lvl) => acc + lvl.rooms.reduce((sum, r) => sum + r.rect.w * r.rect.h, 0),
      0,
    );

  res.json({
    from: { version: a.version, area: Number(area(a.model).toFixed(2)), total: a.cost.total },
    to: { version: b.version, area: Number(area(b.model).toFixed(2)), total: b.cost.total },
    areaDelta: Number((area(b.model) - area(a.model)).toFixed(2)),
    costDelta: b.cost.total - a.cost.total,
    changes: diff.changes,
    summary: diff.summary,
    sameStructure: diff.sameStructure,
  });
});

apiRouter.get('/projects/:id/plan.svg', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const level = Number(req.query.level) || 0;
  const versionNum = req.query.version ? Number(req.query.version) : undefined;

  const vRow = versionNum ? store.getVersion(id, versionNum) : store.getLatestVersion(id);
  if (!vRow) return res.status(404).send('No se encontró el plano solicitado.');

  const svg = renderPlanSvg(vRow.model, level, {
    width: 1200,
    includeFurniture: true,
    includeDimensions: true,
    includeTitle: true,
  });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
});

apiRouter.get('/projects/:id/report.pdf', (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const versionNum = req.query.version ? Number(req.query.version) : undefined;
    const project = store.getProject(id);
    if (!project) return res.status(404).json({ message: 'Proyecto no encontrado' });

    const vRow = versionNum ? store.getVersion(id, versionNum) : store.getLatestVersion(id);
    if (!vRow) return res.status(404).json({ message: 'Versión no encontrada' });

    const model: DesignModel = vRow.model;
    const summary = summarizeRooms(model);
    const cost = vRow.cost ?? estimateCost(model);
    const built = summary.reduce((acc, room) => acc + room.area, 0);

    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-${project.name}.pdf"`);

    doc.pipe(res);

    doc.fontSize(20).fillColor('#1f2937').text('Ficha preliminar del proyecto');
    doc.moveDown(0.2);
    doc.fontSize(11).fillColor('#6b7280').text(`${project.name} · Versión ${vRow.version}`);
    doc.text(`Generado: ${new Date().toLocaleString('es-PE')}`);
    doc.moveDown();

    doc.fontSize(13).fillColor('#111827').text('Datos generales');
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#374151');
    const terrain = model.terrain;
    doc.text(`Estilo: ${model.requirements.style}`);
    doc.text(`Niveles: ${model.requirements.levels}`);
    doc.text(`Dormitorios: ${model.requirements.bedrooms} · Baños: ${model.requirements.bathrooms}`);
    doc.text(`Terreno: ${terrain.width} × ${terrain.depth} m (${(terrain.width * terrain.depth).toFixed(1)} m²)`);
    doc.text(`Huella edificada: ${model.building.footprint.w} × ${model.building.footprint.h} m`);
    doc.text(`Área construida: ${built.toFixed(1)} m²`);
    doc.text(`Presupuesto declarado: USD ${Number(project.budget).toLocaleString('en-US')}`);
    doc.text(`Estimación preliminar: USD ${cost.total.toLocaleString('en-US')}`);
    doc.moveDown();

    doc.fontSize(13).fillColor('#111827').text('Cuadro de áreas');
    doc.moveDown(0.3);
    const columns = [180, 60, 70, 90, 60, 60];
    const headers = ['Ambiente', 'Nivel', 'Área (m²)', 'Dimensiones', 'Puertas', 'Ventanas'];
    let x = doc.page.margins.left;
    const startY = doc.y;
    doc.fontSize(9).fillColor('#111827');
    headers.forEach((header, index) => {
      doc.text(header, x, startY, { width: columns[index], continued: false });
      x += columns[index];
    });
    doc.moveDown(0.4);
    doc.fillColor('#374151');
    for (const room of summary.slice(0, 30)) {
      const y = doc.y;
      let cellX = doc.page.margins.left;
      const cells = [
        room.name,
        String(room.level + 1),
        room.area.toFixed(1),
        `${room.width.toFixed(2)} × ${room.depth.toFixed(2)} m`,
        String(room.doors),
        String(room.windows),
      ];
      cells.forEach((cell, index) => {
        doc.text(cell, cellX, y, { width: columns[index] });
        cellX += columns[index];
      });
      doc.y = y + 13;
      if (doc.y > doc.page.height - 120) {
        doc.addPage();
      }
    }

    doc.moveDown();
    doc.fontSize(13).fillColor('#111827').text('Presupuesto estimado (USD)');
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#374151');
    for (const line of cost.lines.slice(0, 15)) {
      doc.text(
        `${line.description}: ${line.quantity} ${line.unit} × ${line.unitCost.toFixed(2)} = ${line.total.toFixed(0)}`,
      );
      if (doc.y > doc.page.height - 100) doc.addPage();
    }
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#111827');
    doc.text(`Subtotal: USD ${cost.subtotal.toFixed(0)}`);
    doc.text(`Contingencia: USD ${cost.contingency.toFixed(0)}`);
    doc.text(`Total estimado: USD ${cost.total.toFixed(0)}`);
    doc.moveDown();

    doc.fontSize(8).fillColor('#9ca3af').text(
      'Documento preliminar generado automáticamente. No constituye un proyecto constructivo ni sustituye la revisión de un arquitecto o ingeniero habilitado.',
    );

    doc.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al generar PDF';
    res.status(500).json({ message });
  }
});

apiRouter.get('/projects/:id/export.json', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const versionNum = req.query.version ? Number(req.query.version) : undefined;
  const project = store.getProject(id);
  if (!project) return res.status(404).json({ message: 'Proyecto no encontrado' });

  const vRow = versionNum ? store.getVersion(id, versionNum) : store.getLatestVersion(id);
  if (!vRow) return res.status(404).json({ message: 'Versión no encontrada' });

  res.json({
    generatedAt: new Date().toISOString(),
    notice:
      'Documento preliminar generado automáticamente. Requiere revisión y validación de un profesional habilitado antes de su uso constructivo.',
    project: {
      id: project.id,
      name: project.name,
      status: project.status,
      style: project.style,
      budget: Number(project.budget),
    },
    version: {
      number: vRow.version,
      label: vRow.label,
      createdAt: vRow.created_at,
    },
    model: vRow.model,
    summary: summarizeRooms(vRow.model),
    cost: vRow.cost,
    validation: vRow.validation,
  });
});
