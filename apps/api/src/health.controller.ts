import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './auth/auth.guard';
import { APP_CONFIG } from './db/db.module';
import { Repository } from './db/repository';
import type { AppConfig } from './config';

@ApiTags('Estado')
@Controller()
export class HealthController {
  constructor(
    private readonly repository: Repository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Estado del servicio y de sus dependencias' })
  async health() {
    let database = 'ok';
    try {
      await this.repository.database.query('SELECT 1');
    } catch (error) {
      database = error instanceof Error ? `error: ${error.message}` : 'error';
    }
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      service: 'domus-ia-api',
      version: '0.1.0',
      database: { driver: this.repository.database.driver, status: database },
      languageModel: this.config.llm ? 'configurado' : 'modo reglas (sin proveedor externo)',
      timestamp: new Date().toISOString(),
    };
  }
}
