import 'reflect-metadata';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

/**
 * Prueba de extremo a extremo de la API.
 *
 * Levanta la aplicación en un puerto efímero contra una base PGlite temporal y
 * recorre el flujo completo: alta de usuario, creación de proyecto, generación
 * del modelo, modificación en lenguaje natural, comparación de versiones y
 * exportación de documentos.
 */
async function main(): Promise<void> {
  const root = resolve(__dirname, '..', '..', '..', '..');
  const dataDir = join(root, 'data', 'pglite-e2e');
  await fs.rm(dataDir, { recursive: true, force: true });

  process.env.DB_DRIVER = 'pglite';
  process.env.PGLITE_DIR = dataDir;
  process.env.JWT_SECRET = 'clave-de-pruebas-e2e';
  delete process.env.LLM_API_KEY;

  const { AppModule } = await import('../app.module');
  const { setupOpenApi } = await import('../openapi');
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  setupOpenApi(app);
  await app.listen(0);
  const address = app.getHttpServer().address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const base = `http://127.0.0.1:${port}/api`;

  let passed = 0;
  const failures: string[] = [];
  const check = (name: string, condition: boolean, extra?: unknown): void => {
    if (condition) {
      passed += 1;
      console.log(`  ✓ ${name}`);
    } else {
      failures.push(name);
      console.log(`  ✗ ${name}`, extra ?? '');
    }
  };

  let token = '';

  const request = async (
    path: string,
    options: { method?: string; body?: unknown; auth?: boolean; raw?: boolean } = {},
  ): Promise<{ status: number; body: unknown; text: string; contentType: string | null }> => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (options.auth !== false && token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(`${base}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const contentType = response.headers.get('content-type');
    if (options.raw) {
      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        status: response.status,
        body: buffer,
        text: buffer.toString('latin1'),
        contentType,
      };
    }
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* respuesta no JSON */
    }
    return { status: response.status, body, text, contentType };
  };

  console.log('\n► Autenticación y estado del servicio');
  const health = await request('/health', { auth: false });
  check('health responde ok', health.status === 200 && (health.body as { status: string }).status === 'ok', health.text);

  const register = await request('/auth/register', {
    method: 'POST',
    auth: false,
    body: {
      email: 'e2e@domus.local',
      password: 'PruebaSegura2026',
      fullName: 'Usuario E2E',
      role: 'admin',
    },
  });
  check('registro devuelve token', register.status === 201 && typeof (register.body as { token?: string }).token === 'string', register.text);
  token = (register.body as { token: string }).token;

  const me = await request('/auth/me');
  check('perfil autenticado', me.status === 200 && (me.body as { email: string }).email === 'e2e@domus.local');

  const unauthorized = await fetch(`${base}/projects`);
  check('acceso sin token rechazado', unauthorized.status === 401);

  console.log('\n► Proyecto y generación del modelo');
  const created = await request('/projects', {
    method: 'POST',
    body: {
      name: 'Casa de prueba E2E',
      clientName: 'Cliente E2E',
      style: 'modern',
      levels: 2,
      bedrooms: 3,
      bathrooms: 2,
      parkingSpaces: 1,
      familySize: 4,
      budget: 180000,
      features: ['garden', 'terrace', 'openKitchen'],
      terrain: { width: 10, depth: 20 },
    },
  });
  const project = created.body as {
    id: string;
    version: { version: number; model: { building: { levels: Array<{ rooms: Array<{ id: string; type: string; rect: { w: number; h: number } }> }> } } };
    currentVersion: number;
  };
  check('proyecto creado con versión 1', created.status === 201 && project.version?.version === 1, created.text.slice(0, 400));
  const projectId = project.id;
  const rooms = project.version.model.building.levels.flatMap((level) => level.rooms);
  check('modelo generado con ambientes', rooms.length >= 6, rooms.length);
  check('modelo incluye cocina y dormitorios', rooms.some((room) => room.type === 'kitchen') && rooms.filter((room) => room.type === 'bedroom').length >= 2);

  console.log('\n► Modificación en lenguaje natural');
  const modify = await request(`/projects/${projectId}/instructions`, {
    method: 'POST',
    body: { text: 'Amplía la cocina a 14 m2' },
  });
  const modifyBody = modify.body as {
    version?: number;
    applied?: unknown[];
    rejected?: unknown[];
    model?: { building: { levels: Array<{ rooms: Array<{ type: string; rect: { w: number; h: number } }> }> } };
  };
  check('instrucción aceptada', modify.status === 201, modify.text.slice(0, 500));
  check('se creó la versión 2', modifyBody.version === 2, modifyBody.version);
  const kitchen = modifyBody.model?.building.levels
    .flatMap((level) => level.rooms)
    .find((room) => room.type === 'kitchen');
  const kitchenArea = kitchen ? kitchen.rect.w * kitchen.rect.h : 0;
  check('la cocina quedó en 14 m²', Math.abs(kitchenArea - 14) < 0.4, kitchenArea);

  const partial = await request(`/projects/${projectId}/instructions`, {
    method: 'POST',
    body: { text: 'Amplía la cocina a 60 m2' },
  });
  const partialVersion = (partial.body as { version?: number }).version ?? 0;
  const partialBody = partial.body as {
    warnings?: string[];
    validation?: { ok: boolean };
    model?: { building: { levels: Array<{ rooms: Array<{ type: string; rect: { w: number; h: number } }> }> } };
  };
  const partialKitchen = partialBody.model?.building.levels
    .flatMap((level) => level.rooms)
    .find((room) => room.type === 'kitchen');
  const partialArea = partialKitchen ? partialKitchen.rect.w * partialKitchen.rect.h : 0;
  check(
    'objetivo inalcanzable se aplica parcialmente y se explica',
    partial.status === 201 && partialArea > kitchenArea && partialArea < 60 && (partialBody.warnings?.length ?? 0) > 0,
    { status: partial.status, partialArea, warnings: partialBody.warnings?.length },
  );

  const facade = await request(`/projects/${projectId}/instructions`, {
    method: 'POST',
    body: { text: 'Cambia la fachada a tonos blancos y grises' },
  });
  const facadeVersion = (facade.body as { version?: number }).version ?? 0;
  check(
    'segunda modificación aplicada',
    facade.status === 201 && facadeVersion === partialVersion + 1,
    facade.text.slice(0, 300),
  );

  const detail = await request(`/projects/${projectId}`);
  const detailBody = detail.body as { version: { model: { building: { facadeColor: string } } }; history: unknown[] };
  check('detalle del proyecto con historial', detail.status === 200 && Array.isArray(detailBody.history) && detailBody.history.length >= 2);
  check('fachada actualizada en el modelo', detailBody.version.model.building.facadeColor.startsWith('#'), detailBody.version.model.building.facadeColor);

  const bad = await request(`/projects/${projectId}/instructions`, {
    method: 'POST',
    body: { text: 'Haz magia con la casa' },
  });
  check('instrucción incomprensible devuelve 422', bad.status === 422, bad.status);

  console.log('\n► Versiones y comparación');
  const versions = await request(`/projects/${projectId}/versions`);
  check('versiones listadas', Array.isArray(versions.body) && (versions.body as unknown[]).length >= 3);

  const compare = await request(`/projects/${projectId}/compare/1/3`);
  const compareBody = compare.body as { changes: unknown[]; areaDelta: number };
  check('comparación entre versiones', compare.status === 200 && compareBody.changes.length > 0, compare.text.slice(0, 300));

  console.log('\n► Documentos');
  const plan = await request(`/projects/${projectId}/plan.svg`, { raw: true });
  const planText = Buffer.isBuffer(plan.body) ? plan.body.toString('utf8') : plan.text;
  check(
    'plano SVG generado',
    plan.status === 200 && planText.includes('<svg') && planText.includes('m²'),
    plan.contentType,
  );

  const pdf = await request(`/projects/${projectId}/report.pdf`, { raw: true });
  check('ficha PDF generada', pdf.status === 200 && pdf.text.startsWith('%PDF'), pdf.contentType);

  const exported = await request(`/projects/${projectId}/export.json`);
  const exportedBody = exported.body as { model?: unknown; cost?: { total?: number }; summary?: unknown[] };
  check('exportación JSON completa', exported.status === 200 && !!exportedBody.model && (exportedBody.summary?.length ?? 0) > 0);

  console.log('\n► Revisión profesional y panel');
  const approval = await request(`/projects/${projectId}/approvals`, {
    method: 'POST',
    body: { version: facadeVersion, status: 'approved', comments: 'Revisado en prueba E2E' },
  });
  check('aprobación registrada', approval.status === 201 && (approval.body as { projectStatus: string }).projectStatus === 'approved');

  const dashboard = await request('/dashboard/summary');
  const dashboardBody = dashboard.body as { projects: number; byStyle: unknown[] };
  check('panel con indicadores', dashboard.status === 200 && dashboardBody.projects >= 1 && Array.isArray(dashboardBody.byStyle), dashboard.text.slice(0, 300));

  const audit = await request('/audit');
  check('auditoría con eventos', audit.status === 200 && Array.isArray(audit.body) && (audit.body as unknown[]).length > 0);

  console.log('\n► Documentación OpenAPI');
  const openapi = await fetch(`${base}/docs-json`);
  const spec = (await openapi.json()) as { openapi?: string; paths?: Record<string, unknown> };
  const docsDir = join(root, 'docs');
  await fs.mkdir(docsDir, { recursive: true });
  await fs.writeFile(join(docsDir, 'openapi.json'), JSON.stringify(spec, null, 2), 'utf8');
  check('especificación OpenAPI exportada', !!spec.openapi && Object.keys(spec.paths ?? {}).length > 10, Object.keys(spec.paths ?? {}).length);

  await app.close();
  await fs.rm(dataDir, { recursive: true, force: true });

  console.log(`\nResultado: ${passed} verificaciones correctas, ${failures.length} fallidas.`);
  if (failures.length > 0) {
    console.log('Fallidas:', failures.join(' | '));
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('Error en la prueba E2E:', error);
  process.exit(1);
});
