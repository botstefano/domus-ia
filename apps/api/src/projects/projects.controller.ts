import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../auth/auth.guard';
import { ProjectsService } from './projects.service';
import {
  ApprovalDto,
  CreateProjectDto,
  InstructionDto,
  RestoreDto,
  UpdateStatusDto,
} from './dto';

@ApiTags('Proyectos')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @Roles('admin', 'architect', 'advisor', 'client')
  @ApiOperation({ summary: 'Crea un proyecto, genera la primera propuesta y devuelve el detalle' })
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: AuthUser) {
    return this.projects.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Lista los proyectos, opcionalmente filtrados por estado' })
  list(@Query('status') status?: string) {
    return this.projects.list(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle del proyecto con la versión vigente y su historial' })
  detail(@Param('id') id: string) {
    return this.projects.detail(id);
  }

  @Patch(':id/status')
  @Roles('admin', 'architect', 'advisor')
  @ApiOperation({ summary: 'Actualiza el estado del proyecto' })
  setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projects.setStatus(id, dto, user);
  }

  @Post(':id/generate')
  @Roles('admin', 'architect', 'advisor', 'client')
  @ApiOperation({ summary: 'Genera una nueva propuesta a partir de los requisitos vigentes' })
  generate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.projects.generate(id, user);
  }

  @Post(':id/instructions')
  @ApiOperation({ summary: 'Interpreta una instrucción en lenguaje natural y aplica los cambios' })
  instruct(
    @Param('id') id: string,
    @Body() dto: InstructionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projects.instruct(id, dto.text, user);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Lista las versiones del diseño' })
  versions(@Param('id') id: string) {
    return this.projects.versions(id);
  }

  @Get(':id/versions/:version')
  @ApiOperation({ summary: 'Devuelve una versión con su modelo, costos y validaciones' })
  version(@Param('id') id: string, @Param('version', ParseIntPipe) version: number) {
    return this.projects.version(id, version);
  }

  @Get(':id/compare/:from/:to')
  @ApiOperation({ summary: 'Compara dos versiones del diseño' })
  compare(
    @Param('id') id: string,
    @Param('from', ParseIntPipe) from: number,
    @Param('to', ParseIntPipe) to: number,
  ) {
    return this.projects.compare(id, from, to);
  }

  @Post(':id/restore')
  @Roles('admin', 'architect', 'advisor', 'client')
  @ApiOperation({ summary: 'Restaura una versión anterior como una versión nueva' })
  restore(@Param('id') id: string, @Body() dto: RestoreDto, @CurrentUser() user: AuthUser) {
    return this.projects.restore(id, dto.version, user);
  }

  @Get(':id/changes')
  @ApiOperation({ summary: 'Historial de cambios del proyecto' })
  changes(@Param('id') id: string) {
    return this.projects.changes(id);
  }

  @Post(':id/approvals')
  @Roles('admin', 'architect')
  @ApiOperation({ summary: 'Registra la revisión profesional de una versión' })
  approve(
    @Param('id') id: string,
    @Body() dto: ApprovalDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projects.approve(id, dto, user);
  }

  @Get(':id/approvals')
  @ApiOperation({ summary: 'Lista las revisiones profesionales del proyecto' })
  approvals(@Param('id') id: string) {
    return this.projects.approvals(id);
  }
}
