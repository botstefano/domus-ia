# Domus IA · Plataforma de diseño de viviendas asistido por IA

MVP funcional de una plataforma que convierte una descripción en lenguaje natural en un
**modelo arquitectónico tridimensional estructurado, editable y verificable**: ambientes,
muros, puertas, ventanas, materiales y mobiliario con dimensiones reales; no imágenes.

> **Estado:** prototipo funcional (Nivel 1 del producto). La documentación técnica completa,
> con requisitos, arquitectura, modelo de datos, trazabilidad, riesgos y manuales, está en
> [`docs/Documentacion-Tecnica-DomusIA.docx`](docs/Documentacion-Tecnica-DomusIA.docx).

---

## 1. Qué está implementado y qué no

| Módulo | Estado | Evidencia |
| --- | --- | --- |
| Registro de clientes y gestión de proyectos | Operativo | `POST /api/projects`, `GET /api/projects` |
| Generación de propuestas desde requisitos | Operativo | Motor paramétrico determinista (40 pruebas) |
| Modelo 3D editable por componentes | Operativo | Visor Three.js + operaciones geométricas |
| Modificación por lenguaje natural | Operativo (reglas) | 22 pruebas de interpretación |
| Interpretación con LLM | Adaptador listo, **sin credenciales** | Requiere `LLM_API_KEY`; degrada a reglas |
| Planos preliminares (SVG) y ficha (PDF) | Operativo | `GET /projects/:id/plan.svg`, `report.pdf` |
| Presupuesto paramétrico | Operativo (estimación) | `estimateCost()` del motor |
| Comparación de versiones | Operativo | `GET /projects/:id/compare/:a/:b` |
| Deshacer / rehacer | Operativo (restauración de versión) | `POST /projects/:id/restore` |
| Realidad virtual / aumentada | Implementado con WebXR, **no probado en dispositivo** | Botones VR/AR del visor |
| Importación/exportación BIM (IFC) | **No implementado** | Fase posterior |
| Voz (dictado) | **No implementado** | Depende del navegador; fase posterior |

Las funciones marcadas como no probadas o no implementadas se detallan en la sección
*Limitaciones conocidas* de la documentación.

## 2. Inicio rápido (sin servicios externos)

Requisitos: Node.js ≥ 20 y pnpm ≥ 9.

```bash
pnpm install
pnpm build                # compila motor, intérprete, API y web
pnpm --filter @domus/api migrate   # crea el esquema (PostgreSQL embebido PGlite)
pnpm --filter @domus/api seed      # carga datos de demostración
pnpm dev:api              # API en http://localhost:3000/api  (sirve también la web compilada)
```

Abra <http://localhost:3000> e ingrese con cualquiera de las cuentas de demostración:

| Correo | Rol | Contraseña |
| --- | --- | --- |
| `admin@domus.local` | Administrador | `Domus2026!` |
| `arquitecto@domus.local` | Arquitecto | `Domus2026!` |
| `asesor@domus.local` | Asesor comercial | `Domus2026!` |
| `cliente@domus.local` | Cliente | `Domus2026!` |

Documentación interactiva de la API: <http://localhost:3000/api/docs>

### Desarrollo de la interfaz con recarga en caliente

```bash
pnpm dev:web              # Vite en http://localhost:5173 con proxy /api
```

## 3. Pruebas

```bash
pnpm --filter @domus/domain test      # 40 pruebas del motor geométrico
pnpm --filter @domus/assistant test   # 22 pruebas del intérprete de lenguaje natural
pnpm build && pnpm e2e:api            # 24 verificaciones HTTP de extremo a extremo
```

Las pruebas de extremo a extremo levantan la API en un puerto efímero con una base temporal,
recorren el flujo completo (registro → proyecto → instrucción → comparación → documentos) y
exportan la especificación OpenAPI a `docs/openapi.json`.

## 4. Arquitectura en una imagen

```
Cliente web (React + Three.js)
        │  HTTP/JSON  (JWT)
        ▼
API NestJS ── auth/RBAC ── proyectos/versiones ── documentos (SVG/PDF)
        │                        │
        │                        ├── @domus/assistant   texto → operaciones JSON
        │                        └── @domus/domain      operaciones → geometría + validación
        ▼
PostgreSQL (PGlite en local) · snapshot JSONB por versión + proyección relacional
```

- `packages/domain`: modelo arquitectónico, generador paramétrico, operaciones, validaciones,
  costos, diff de versiones y planos SVG. Sin dependencias externas.
- `packages/assistant`: intérprete determinista español → operaciones, con adaptador opcional
  a un modelo de lenguaje que valida el contrato antes de usarlo.
- `apps/api`: NestJS + PostgreSQL, JWT/RBAC, auditoría, versiones inmutables, documentos.
- `apps/web`: React + Three.js, panel de instrucciones, visor 3D, propiedades, comparación.

## 5. Estructura del repositorio

```
domus-ia/
├── apps/
│   ├── api/                API NestJS, migraciones SQL, scripts (migrate/seed/e2e)
│   └── web/                Interfaz React + Three.js (Vite)
├── packages/
│   ├── domain/             Motor paramétrico y validaciones (40 pruebas)
│   └── assistant/          NLU español → operaciones (22 pruebas)
├── docs/                   Documentación técnica (DOCX), OpenAPI, matriz de trazabilidad
├── docker-compose.yml      PostgreSQL + API + Nginx
└── .env.example            Variables de entorno documentadas
```

## 6. Despliegue con Docker

```bash
cp .env.example .env
docker compose up --build
docker compose exec api node apps/api/dist/scripts/migrate.js
docker compose exec api node apps/api/dist/scripts/seed.js
```

Interfaz en <http://localhost:8080>, API en <http://localhost:3000/api>.

> El archivo `docker-compose.yml` y los `Dockerfile` no pudieron ejecutarse en el entorno de
> desarrollo usado para construir el MVP (sin Docker disponible); se validaron las imágenes
> de forma estática. La ruta sin contenedores (PGlite) sí fue ejecutada y verificada.

## 7. Variables de entorno

Todas están documentadas en [`.env.example`](.env.example). Las relevantes:

- `DB_DRIVER`: `pglite` (por defecto, sin servicios) o `postgres`.
- `DATABASE_URL`: cadena de conexión cuando `DB_DRIVER=postgres`.
- `JWT_SECRET`, `JWT_EXPIRES_IN`: firma de los tokens.
- `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`: proveedor de lenguaje opcional.

Sin `LLM_API_KEY` el producto funciona por completo con el intérprete determinista.

## 8. Decisiones de diseño clave

1. **Geometría estructurada, no imágenes.** El modelo se compone de ambientes rectangulares,
   muros con vanos y mobiliario, con dimensiones y coordenadas reales.
2. **La IA no genera geometría.** Produce *operaciones estructuradas* validadas contra reglas
   geométricas y funcionales; el motor es determinista y auditable.
3. **Edición local, no regeneración.** Cambiar la cocina mueve solo los tabiques afectados y
   conserva puertas, ventanas, materiales y mobiliario del resto de la vivienda.
4. **Versiones inmutables.** Cada cambio crea una versión nueva con su snapshot, costo,
   validación y diff; el historial es recuperable y comparable.
5. **Snapshot + proyección.** El modelo vive en `design_versions.model` (JSONB) y se proyecta
   a tablas relacionales (`buildings`, `levels`, `rooms`, `elements`) para consultas.

## 9. Limitaciones conocidas (resumen)

- La ampliación de un ambiente se aplica de forma exacta solo si los vecinos tienen holgura;
  cuando no la hay, el motor aplica lo posible y lo explica (`warnings`).
- La escalera se reserva como bloque fijo entre plantas; si la geometría no lo permite, se
  emite una advertencia para revisión profesional.
- VR/AR requieren hardware y navegador compatibles con WebXR.
- Los planos, presupuestos y fichas son **preliminares**: no sustituyen la revisión de un
  arquitecto o ingeniero habilitado ni un proyecto constructivo.
- El catálogo de materiales y proveedores es de demostración (precios y marcas ficticias).

## 10. Licencia y uso

Código de ejemplo académico (curso ISII). Los datasets públicos citados en la documentación
tienen sus propias licencias; verifique su uso comercial antes de integrarlos.
