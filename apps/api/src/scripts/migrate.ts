import 'reflect-metadata';
import { loadConfig } from '../config';
import { createDatabase, runMigrations } from '../db/database';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = await createDatabase(config);
  try {
    const applied = await runMigrations(db);
    if (applied.length === 0) {
      console.log('Sin migraciones pendientes.');
    } else {
      console.log(`Migraciones aplicadas: ${applied.join(', ')}`);
    }
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error('Error al migrar la base de datos:', error);
  process.exit(1);
});
