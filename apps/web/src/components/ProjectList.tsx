import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ProjectSummary, User } from '../types';

interface Props {
  user: User;
  onOpen: (projectId: string) => void;
  onLogout: () => void;
}

const STYLES = [
  { id: 'modern', label: 'Moderno' },
  { id: 'minimalist', label: 'Minimalista' },
  { id: 'classic', label: 'Clásico' },
  { id: 'mediterranean', label: 'Mediterráneo' },
  { id: 'industrial', label: 'Industrial' },
  { id: 'nordic', label: 'Nórdico' },
];

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  designing: 'En diseño',
  review: 'En revisión',
  approved: 'Aprobado',
  finished: 'Finalizado',
  archived: 'Archivado',
};

export default function ProjectList({ user, onOpen, onLogout }: Props): JSX.Element {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: 'Mi nueva vivienda',
    style: 'modern',
    levels: 2,
    bedrooms: 3,
    bathrooms: 2,
    parkingSpaces: 1,
    familySize: 4,
    budget: 180000,
    width: 10,
    depth: 20,
  });

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      setProjects(await api.projects());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los proyectos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const project = await api.createProject({
        name: form.name,
        style: form.style,
        levels: Number(form.levels),
        bedrooms: Number(form.bedrooms),
        bathrooms: Number(form.bathrooms),
        parkingSpaces: Number(form.parkingSpaces),
        familySize: Number(form.familySize),
        budget: Number(form.budget),
        features: ['garden', 'terrace', 'openKitchen'],
        terrain: { width: Number(form.width), depth: Number(form.depth) },
      });
      onOpen(project.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'No se pudo crear el proyecto.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◈</span>
          <span>Domus IA</span>
        </div>
        <div className="topbar-right">
          <span className="user-chip">
            {user.fullName} · {user.role}
          </span>
          <button className="ghost" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>

      <main className="content">
        <div className="section-head">
          <div>
            <h1>Proyectos</h1>
            <p>Gestione los proyectos de diseño y continúe trabajando en sus propuestas.</p>
          </div>
          <button className="primary" onClick={() => setShowForm((value) => !value)}>
            {showForm ? 'Cancelar' : 'Nuevo proyecto'}
          </button>
        </div>

        {error && <div className="alert error">{error}</div>}

        {showForm && (
          <form className="card form-grid" onSubmit={create}>
            <label className="span-2">
              Nombre del proyecto
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
                minLength={3}
              />
            </label>
            <label>
              Estilo
              <select
                value={form.style}
                onChange={(event) => setForm({ ...form, style: event.target.value })}
              >
                {STYLES.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Plantas
              <input
                type="number"
                min={1}
                max={3}
                value={form.levels}
                onChange={(event) => setForm({ ...form, levels: Number(event.target.value) })}
              />
            </label>
            <label>
              Dormitorios
              <input
                type="number"
                min={0}
                max={8}
                value={form.bedrooms}
                onChange={(event) => setForm({ ...form, bedrooms: Number(event.target.value) })}
              />
            </label>
            <label>
              Baños
              <input
                type="number"
                min={1}
                max={6}
                value={form.bathrooms}
                onChange={(event) => setForm({ ...form, bathrooms: Number(event.target.value) })}
              />
            </label>
            <label>
              Cochera (vehículos)
              <input
                type="number"
                min={0}
                max={3}
                value={form.parkingSpaces}
                onChange={(event) => setForm({ ...form, parkingSpaces: Number(event.target.value) })}
              />
            </label>
            <label>
              Personas en la familia
              <input
                type="number"
                min={1}
                max={12}
                value={form.familySize}
                onChange={(event) => setForm({ ...form, familySize: Number(event.target.value) })}
              />
            </label>
            <label>
              Ancho del terreno (m)
              <input
                type="number"
                min={3}
                max={200}
                step={0.5}
                value={form.width}
                onChange={(event) => setForm({ ...form, width: Number(event.target.value) })}
              />
            </label>
            <label>
              Fondo del terreno (m)
              <input
                type="number"
                min={3}
                max={200}
                step={0.5}
                value={form.depth}
                onChange={(event) => setForm({ ...form, depth: Number(event.target.value) })}
              />
            </label>
            <label>
              Presupuesto (USD)
              <input
                type="number"
                min={10000}
                step={1000}
                value={form.budget}
                onChange={(event) => setForm({ ...form, budget: Number(event.target.value) })}
              />
            </label>
            <div className="span-2">
              <button className="primary" type="submit" disabled={creating}>
                {creating ? 'Generando propuesta…' : 'Crear y generar propuesta'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="muted">Cargando proyectos…</p>
        ) : projects.length === 0 ? (
          <div className="card empty">
            <h3>Todavía no hay proyectos</h3>
            <p>Cree el primero para que el motor genere una propuesta inicial.</p>
          </div>
        ) : (
          <div className="grid">
            {projects.map((project) => (
              <article key={project.id} className="card project-card" onClick={() => onOpen(project.id)}>
                <header>
                  <h3>{project.name}</h3>
                  <span className={`badge ${project.status}`}>
                    {STATUS_LABEL[project.status] ?? project.status}
                  </span>
                </header>
                <p className="muted">
                  {project.levels} planta(s) · {project.bedrooms} dormitorios · {project.bathrooms} baños
                </p>
                <dl>
                  <div>
                    <dt>Estilo</dt>
                    <dd>{STYLES.find((style) => style.id === project.style)?.label ?? project.style}</dd>
                  </div>
                  <div>
                    <dt>Versión</dt>
                    <dd>{project.currentVersion}</dd>
                  </div>
                  <div>
                    <dt>Presupuesto</dt>
                    <dd>USD {Number(project.budget).toLocaleString('en-US')}</dd>
                  </div>
                </dl>
                <footer>
                  <span className="muted small">
                    Actualizado {new Date(project.updatedAt).toLocaleDateString('es-PE')}
                  </span>
                  <span className="link">Abrir diseñador →</span>
                </footer>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
