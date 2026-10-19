# Domus IA · Plataforma de diseño de viviendas asistido por IA

Plataforma que convierte requisitos en lenguaje natural en un **modelo arquitectónico tridimensional estructurado, editable y verificable**: ambientes, muros, puertas, ventanas, materiales y mobiliario con dimensiones reales; no meras imágenes.

Reescrita como una aplicación completa React + Vite + Express en TypeScript, lista para ejecutar en Node.js 22.

---

## 1. Módulos y funcionalidades principales

| Módulo | Estado | Detalle |
| --- | --- | --- |
| Registro de clientes y gestión de proyectos | Operativo | `POST /api/projects`, `GET /api/projects`, formulario con validaciones |
| Generación de propuestas paramétricas | Operativo | Motor procedural determinista (`generateDesign`) |
| Recorrido y visor 3D interactivo | Operativo | Three.js con OrbitControls, vistas axonométricas/planta, capas (techos, muros, mobiliario, terreno) |
| Modificación por lenguaje natural | Operativo (NLU determinista + LLM) | Motor semántico (`interpret`) con aplicación atómica de operaciones (`applyOperations`) |
| Planos preliminares (SVG) y ficha técnica (PDF) | Operativo | `GET /api/projects/:id/plan.svg`, `GET /api/projects/:id/report.pdf` |
| Presupuesto paramétrico desglosado | Operativo | Cálculo de partidas, materiales, acabados, mobiliario y contingencia (`estimateCost`) |
| Comparación gráfica de versiones | Operativo | Comparativa de áreas, variaciones de costo y reporte de modificaciones (`GET /api/projects/:id/compare/:from/:to`) |
| Historial, deshacer y restaurar | Operativo | Restauración idempotente de versiones con registro cronológico |

## 2. Inicio rápido

```bash
# Instalar dependencias
npm install

# Compilar la aplicación
npm run build

# Iniciar servidor de desarrollo en puerto 3000
npm run dev
```

Abra `http://localhost:3000` e ingrese con cualquiera de las cuentas de demostración:

| Correo | Rol | Contraseña |
| --- | --- | --- |
| `admin@domus.local` | Administrador | `Domus2026!` |
| `arquitecto@domus.local` | Arquitecto | `Domus2026!` |
| `asesor@domus.local` | Asesor comercial | `Domus2026!` |
| `cliente@domus.local` | Cliente | `Domus2026!` |

## 3. Arquitectura

- **Frontend:** React 19 SPA con Vite, Three.js para renderizado 3D y CSS personalizado con diseño sobrio y profesional.
- **Backend:** Servidor Express integrado con endpoints REST (`/api/*`) y middleware de Vite en desarrollo.
- **Motor de Dominio:** Generador arquitectónico procedural, cálculo de costes, validación geométrica/normativa y generador de planos 2D SVG vectoriales.
- **Asistente NLU:** Parser de lenguaje natural en español capaz de traducir órdenes arquitectónicas en transformaciones geométricas del modelo.
