import type {
  Comparison,
  InstructionResponse,
  ProjectDetail,
  ProjectSummary,
  User,
} from './types';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
const TOKEN_KEY = 'domus.token';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

export function setToken(token: string): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE}${path}`, { ...options, headers });
  const text = await response.text();
  let payload: unknown = text;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    /* respuesta no JSON */
  }
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'message' in payload
        ? String((payload as { message: unknown }).message)
        : `Error ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
}

export interface CreateProjectInput {
  name: string;
  clientName?: string;
  clientEmail?: string;
  style: string;
  levels: number;
  bedrooms: number;
  bathrooms: number;
  parkingSpaces: number;
  familySize: number;
  budget: number;
  features: string[];
  terrain: { width: number; depth: number; setbacks?: { front: number; back: number; left: number; right: number } };
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<User>('/auth/me'),

  projects: () => request<ProjectSummary[]>('/projects'),

  project: (id: string) => request<ProjectDetail>(`/projects/${id}`),

  createProject: (input: CreateProjectInput) =>
    request<ProjectDetail>('/projects', { method: 'POST', body: JSON.stringify(input) }),

  instruct: (id: string, text: string) =>
    request<InstructionResponse>(`/projects/${id}/instructions`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  restore: (id: string, version: number) =>
    request<InstructionResponse>(`/projects/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    }),

  compare: (id: string, from: number, to: number) =>
    request<Comparison>(`/projects/${id}/compare/${from}/${to}`),

  setStatus: (id: string, status: string) =>
    request<{ id: string; status: string }>(`/projects/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  planUrl: (id: string, version?: number, level = 0) =>
    `${BASE}/projects/${id}/plan.svg?level=${level}${version ? `&version=${version}` : ''}`,

  reportUrl: (id: string, version?: number) =>
    `${BASE}/projects/${id}/report.pdf${version ? `?version=${version}` : ''}`,

  exportUrl: (id: string, version?: number) =>
    `${BASE}/projects/${id}/export.json${version ? `?version=${version}` : ''}`,
};

/** Descarga un recurso protegido agregando el token en la cabecera. */
export async function download(path: string, filename: string): Promise<void> {
  const response = await fetch(path, {
    headers: { authorization: `Bearer ${getToken()}` },
  });
  if (!response.ok) throw new ApiError(`No se pudo descargar ${filename}`, response.status);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
