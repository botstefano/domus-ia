import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Pool, type PoolClient } from 'pg';
import type { AppConfig } from '../config';

/** Interfaz mínima de base de datos usada por la aplicación. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly driver: 'pglite' | 'postgres';
}

class PGliteDb implements Db {
  readonly driver = 'pglite' as const;

  constructor(private readonly client: PGlite) {}

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.client.query<T>(sql, params as never[]);
    return result.rows as T[];
  }

  async exec(sql: string): Promise<void> {
    await this.client.exec(sql);
  }

  async transaction<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    await this.client.exec('BEGIN');
    try {
      const result = await fn(this);
      await this.client.exec('COMMIT');
      return result;
    } catch (error) {
      await this.client.exec('ROLLBACK');
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

class PostgresDb implements Db {
  readonly driver = 'postgres' as const;

  constructor(private readonly pool: Pool) {}

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query(sql, params as never[]);
    return result.rows as T[];
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transaction<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    const wrapper: Db = {
      driver: 'postgres',
      query: async <R>(sql: string, params: unknown[] = []) => {
        const result = await client.query(sql, params as never[]);
        return result.rows as R[];
      },
      exec: async (sql: string) => {
        await client.query(sql);
      },
      transaction: (inner) => inner(wrapper),
      close: async () => undefined,
    };
    try {
      await client.query('BEGIN');
      const result = await fn(wrapper);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export async function createDatabase(config: AppConfig): Promise<Db> {
  if (config.dbDriver === 'postgres') {
    const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
    const db = new PostgresDb(pool);
    await db.query('SELECT 1');
    return db;
  }
  const dir = resolve(process.cwd(), config.pgliteDir);
  await fs.mkdir(dir, { recursive: true });
  const client = new PGlite(dir);
  await client.waitReady;
  return new PGliteDb(client);
}

export function migrationsDir(): string {
  return resolve(__dirname, '..', '..', 'migrations');
}

/** Aplica las migraciones pendientes (idempotente). */
export async function runMigrations(db: Db, dir = migrationsDir()): Promise<string[]> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const applied = new Set(
    (await db.query<{ name: string }>('SELECT name FROM schema_migrations')).map((row) => row.name),
  );
  const files = (await fs.readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
  const executed: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(join(dir, file), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    executed.push(file);
  }
  return executed;
}
