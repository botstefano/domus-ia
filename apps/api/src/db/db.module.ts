import { Global, Module, OnModuleInit, Inject, Logger } from '@nestjs/common';
import { loadConfig, type AppConfig } from '../config';
import { createDatabase, runMigrations, type Db } from './database';
import { Repository } from './repository';

export const DB = 'DOMUS_DB';
export const APP_CONFIG = 'DOMUS_CONFIG';

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): AppConfig => loadConfig(),
    },
    {
      provide: DB,
      inject: [APP_CONFIG],
      useFactory: async (config: AppConfig): Promise<Db> => createDatabase(config),
    },
    {
      provide: Repository,
      inject: [DB],
      useFactory: (db: Db): Repository => new Repository(db),
    },
  ],
  exports: [DB, Repository, APP_CONFIG],
})
export class DbModule implements OnModuleInit {
  private readonly logger = new Logger(DbModule.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async onModuleInit(): Promise<void> {
    const applied = await runMigrations(this.db);
    if (applied.length > 0) {
      this.logger.log(`Migraciones aplicadas: ${applied.join(', ')}`);
    }
    this.logger.log(`Base de datos conectada (driver: ${this.db.driver}).`);
  }
}
