import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/auth.guard';
import { Repository } from '../db/repository';

@ApiTags('Auditoría')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly repository: Repository) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'Últimos eventos de auditoría registrados' })
  list(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 100;
    return this.repository.listAudit(Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 500) : 100);
  }
}

@Module({
  controllers: [AuditController],
})
export class AuditModule {}
