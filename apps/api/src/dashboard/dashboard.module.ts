import { Controller, Get, Inject, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { APP_CONFIG } from '../db/db.module';
import { Repository } from '../db/repository';
import type { AppConfig } from '../config';

@ApiTags('Panel de control')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly repository: Repository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: 'Indicadores calculados a partir de los datos registrados' })
  async summary() {
    const metrics = await this.repository.metrics();
    return {
      ...metrics,
      generatedAt: new Date().toISOString(),
      system: {
        database: this.repository.database.driver,
        languageModel: this.config.llm ? this.config.llm.model : 'no configurado (modo reglas)',
        engine: 'domus-parametric-engine/1.0',
      },
    };
  }
}

@Module({
  controllers: [DashboardController],
})
export class DashboardModule {}
