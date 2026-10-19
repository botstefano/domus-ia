import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DocumentsService } from './documents.service';

@ApiTags('Documentos')
@ApiBearerAuth()
@Controller('projects/:id')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('plan.svg')
  @Header('Content-Type', 'image/svg+xml')
  @ApiProduces('image/svg+xml')
  @ApiOperation({ summary: 'Planta arquitectónica preliminar en SVG, generada desde la geometría' })
  async plan(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('version') version?: string,
    @Query('level') level?: string,
  ): Promise<void> {
    const svg = await this.documents.planSvg(
      id,
      version ? Number(version) : undefined,
      level ? Number(level) : 0,
    );
    res.type('image/svg+xml').send(svg);
  }

  @Get('report.pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Ficha preliminar del proyecto en PDF' })
  async report(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('version') version?: string,
  ): Promise<void> {
    const pdf = await this.documents.reportPdf(id, version ? Number(version) : undefined);
    res
      .type('application/pdf')
      .setHeader('Content-Disposition', `inline; filename="ficha-${id}.pdf"`)
      .send(pdf);
  }

  @Get('export.json')
  @ApiOperation({ summary: 'Exportación completa del modelo, costos y validaciones' })
  export(
    @Param('id') id: string,
    @Query('version') version?: string,
  ) {
    return this.documents.exportJson(id, version ? Number(version) : undefined);
  }

  @Get('versions/:version/export.json')
  @ApiOperation({ summary: 'Exportación de una versión específica' })
  exportVersion(
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.documents.exportJson(id, version);
  }
}
