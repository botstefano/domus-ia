import type { LlmConfig } from '@domus/assistant';

export type DbDriver = 'pglite' | 'postgres';

export interface AppConfig {
  port: number;
  dbDriver: DbDriver;
  databaseUrl: string;
  pgliteDir: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  webOrigin: string;
  llm: LlmConfig | null;
  storageDir: string;
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): AppConfig {
  const driver = (process.env.DB_DRIVER ?? 'pglite') as DbDriver;
  const llmKey = process.env.LLM_API_KEY;
  return {
    port: num(process.env.PORT, 3000),
    dbDriver: driver === 'postgres' ? 'postgres' : 'pglite',
    databaseUrl:
      process.env.DATABASE_URL ??
      'postgresql://domus:domus@localhost:5432/domus?schema=public',
    pgliteDir: process.env.PGLITE_DIR ?? 'data/pglite',
    jwtSecret: process.env.JWT_SECRET ?? 'cambiar-esta-clave-en-produccion',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    llm: llmKey
      ? {
          baseUrl: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
          apiKey: llmKey,
          model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
          timeoutMs: num(process.env.LLM_TIMEOUT_MS, 20000),
        }
      : null,
    storageDir: process.env.STORAGE_DIR ?? 'data/documents',
  };
}
