-- Domus IA - Esquema inicial (PostgreSQL 15+)
-- Ejecutado por apps/api/src/scripts/migrate.ts o por PGlite en desarrollo local.

CREATE TABLE IF NOT EXISTS roles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
  code        TEXT PRIMARY KEY,
  description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id     TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission  TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission)
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  phone         TEXT,
  role_id       TEXT NOT NULL REFERENCES roles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));

CREATE TABLE IF NOT EXISTS clients (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  full_name  TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id              TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','designing','review','approved','finished','archived')),
  style           TEXT NOT NULL,
  levels          INTEGER NOT NULL DEFAULT 1,
  bedrooms        INTEGER NOT NULL DEFAULT 2,
  bathrooms       INTEGER NOT NULL DEFAULT 1,
  parking_spaces  INTEGER NOT NULL DEFAULT 0,
  family_size     INTEGER NOT NULL DEFAULT 3,
  budget          NUMERIC(14,2) NOT NULL DEFAULT 0,
  features        JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes           JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_version INTEGER NOT NULL DEFAULT 0,
  owner_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_client_idx ON projects (client_id);
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects (status);

CREATE TABLE IF NOT EXISTS terrains (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  width       NUMERIC(10,2) NOT NULL,
  depth       NUMERIC(10,2) NOT NULL,
  setbacks    JSONB NOT NULL,
  orientation TEXT NOT NULL DEFAULT 'south',
  slope       NUMERIC(6,2) NOT NULL DEFAULT 0
);

-- Proyección analítica de la geometría (fuente de verdad: design_versions.model).
CREATE TABLE IF NOT EXISTS buildings (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  footprint          JSONB NOT NULL,
  roof               JSONB NOT NULL,
  facade_material_id TEXT NOT NULL,
  facade_color       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS buildings_project_idx ON buildings (project_id);

CREATE TABLE IF NOT EXISTS levels (
  id          TEXT PRIMARY KEY,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  index       INTEGER NOT NULL,
  name        TEXT NOT NULL,
  height      NUMERIC(6,2) NOT NULL,
  UNIQUE (building_id, index)
);

CREATE TABLE IF NOT EXISTS rooms (
  id                TEXT PRIMARY KEY,
  level_id          TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  type              TEXT NOT NULL,
  rect              JSONB NOT NULL,
  area              NUMERIC(10,2) NOT NULL,
  height            NUMERIC(6,2) NOT NULL,
  floor_material_id TEXT NOT NULL,
  interior_color    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rooms_level_idx ON rooms (level_id);

CREATE TABLE IF NOT EXISTS elements (
  id       TEXT PRIMARY KEY,
  level_id TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  kind     TEXT NOT NULL CHECK (kind IN ('wall','opening','furniture','roof')),
  payload  JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS elements_level_idx ON elements (level_id);

CREATE TABLE IF NOT EXISTS suppliers (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  contact TEXT,
  city    TEXT
);

CREATE TABLE IF NOT EXISTS materials (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL CHECK (category IN ('floor','wall','facade','roof','furniture','opening')),
  unit             TEXT NOT NULL,
  unit_cost        NUMERIC(12,2) NOT NULL,
  brand            TEXT NOT NULL,
  tier             TEXT NOT NULL CHECK (tier IN ('economic','standard','premium')),
  color            TEXT,
  maintenance      TEXT,
  availability     TEXT,
  supplier_id      TEXT REFERENCES suppliers(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS materials_category_idx ON materials (category);

CREATE TABLE IF NOT EXISTS furniture_catalog (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  width      NUMERIC(6,2) NOT NULL,
  depth      NUMERIC(6,2) NOT NULL,
  height     NUMERIC(6,2) NOT NULL,
  unit_cost  NUMERIC(12,2) NOT NULL,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS design_versions (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL,
  label          TEXT,
  model          JSONB NOT NULL,
  cost           JSONB NOT NULL,
  validation     JSONB NOT NULL,
  parent_version INTEGER,
  created_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);
CREATE INDEX IF NOT EXISTS versions_project_idx ON design_versions (project_id, version DESC);

CREATE TABLE IF NOT EXISTS modification_instructions (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  text        TEXT NOT NULL,
  intent      TEXT NOT NULL,
  operations  JSONB NOT NULL,
  rejected    JSONB NOT NULL DEFAULT '[]'::jsonb,
  source      TEXT NOT NULL,
  confidence  NUMERIC(4,3),
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS instructions_project_idx ON modification_instructions (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS change_history (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_version INTEGER NOT NULL,
  to_version   INTEGER NOT NULL,
  changes      JSONB NOT NULL,
  summary      TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'instruction',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS changes_project_idx ON change_history (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS documents (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  filename    TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  storage_key TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approvals (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','changes_requested')),
  reviewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  comments    TEXT,
  decided_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS approvals_project_idx ON approvals (project_id, version);

CREATE TABLE IF NOT EXISTS audit_events (
  id         TEXT PRIMARY KEY,
  actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_events (entity, entity_id);

INSERT INTO roles (id, name, description) VALUES
  ('admin', 'Administrador', 'Acceso total, gestión de usuarios y auditoría'),
  ('architect', 'Arquitecto', 'Diseño, revisión y aprobación técnica'),
  ('advisor', 'Asesor comercial', 'Gestión de clientes y proyectos'),
  ('client', 'Cliente', 'Consulta y personalización de sus proyectos')
ON CONFLICT (id) DO NOTHING;

INSERT INTO permissions (code, description) VALUES
  ('project:read', 'Consultar proyectos'),
  ('project:write', 'Crear y modificar proyectos'),
  ('project:approve', 'Aprobar propuestas'),
  ('catalog:read', 'Consultar catálogo'),
  ('catalog:write', 'Administrar catálogo'),
  ('audit:read', 'Consultar auditoría'),
  ('user:manage', 'Administrar usuarios')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission) VALUES
  ('admin','project:read'),('admin','project:write'),('admin','project:approve'),
  ('admin','catalog:read'),('admin','catalog:write'),('admin','audit:read'),('admin','user:manage'),
  ('architect','project:read'),('architect','project:write'),('architect','project:approve'),('architect','catalog:read'),
  ('advisor','project:read'),('advisor','project:write'),('advisor','catalog:read'),
  ('client','project:read'),('client','project:write'),('client','catalog:read')
ON CONFLICT DO NOTHING;
