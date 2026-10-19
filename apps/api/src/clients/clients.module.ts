import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../auth/auth.guard';
import { Repository } from '../db/repository';
import { CreateClientDto } from '../projects/dto';

@ApiTags('Clientes')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private readonly repository: Repository) {}

  @Get()
  @ApiOperation({ summary: 'Lista los clientes registrados' })
  list() {
    return this.repository.listClients();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un cliente' })
  async detail(@Param('id') id: string) {
    const client = await this.repository.getClient(id);
    if (!client) throw new NotFoundException(`No existe el cliente ${id}.`);
    return client;
  }

  @Post()
  @Roles('admin', 'architect', 'advisor')
  @ApiOperation({ summary: 'Registra un cliente' })
  async create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthUser) {
    const client = await this.repository.insertClient({
      id: randomUUID(),
      user_id: null,
      full_name: dto.fullName,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      notes: dto.notes ?? null,
    });
    await this.repository.insertAudit({
      id: randomUUID(),
      actor_id: user.id,
      action: 'client.create',
      entity: 'client',
      entity_id: client.id,
      payload: { fullName: client.full_name },
      ip: null,
    });
    return client;
  }
}

@Module({
  controllers: [ClientsController],
})
export class ClientsModule {}
