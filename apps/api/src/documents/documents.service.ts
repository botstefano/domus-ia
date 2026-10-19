import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { estimateCost, renderPlanSvg, summarizeRooms, type DesignModel } from '@domus/domain';
import { APP_CONFIG } from '../db/db.module';
import { Repository, type ProjectRow, type VersionRow } from '../db/repository';
import type { AppConfig } from '../config';

/** Generación de documentos preliminares (planos, fichas y exportaciones). */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly repository: Repository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async load(projectId: string, version?: number): Promise<{
    project: ProjectRow;
    version: VersionRow;
  }> {
    const project = await this.repository.getProject(projectId);
    if (!project) throw new NotFoundException(`No existe el proyecto ${projectId}.`);
    const row = version
      ? await this.repository.getVersion(projectId, version)
      : await this.repository.latestVersion(projectId);
    if (!row) throw new NotFoundException('El proyecto no tiene versiones de diseño.');
    return { project, version: row };
  }

  async planSvg(projectId: string, version: number | undefined, level = 0): Promise<string> {
    const { version: row } = await this.load(projectId, version);
    return renderPlanSvg(row.model, level, {
      width: 1200,
      includeFurniture: true,
      includeDimensions: true,
      includeTitle: true,
    });
  }

  async exportJson(projectId: string, version?: number): Promise<unknown> {
    const { project, version: row } = await this.load(projectId, version);
    return {
      generatedAt: new Date().toISOString(),
      notice:
        'Documento preliminar generado automáticamente. Requiere revisión y validación de un profesional habilitado antes de su uso constructivo.',
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        style: project.style,
        budget: Number(project.budget),
      },
      version: {
        number: row.version,
        label: row.label,
        createdAt: row.created_at,
      },
      model: row.model,
      summary: summarizeRooms(row.model),
      cost: row.cost,
      validation: row.validation,
    };
  }

  /** Ficha del proyecto en PDF: datos, cuadro de áreas, presupuesto y validaciones. */
  async reportPdf(projectId: string, version?: number): Promise<Buffer> {
    const { project, version: row } = await this.load(projectId, version);
    const model: DesignModel = row.model;
    const summary = summarizeRooms(model);
    const cost = row.cost ?? estimateCost(model);
    const built = summary.reduce((acc, room) => acc + room.area, 0);

    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    doc.fontSize(20).fillColor('#1f2937').text('Ficha preliminar del proyecto');
    doc.moveDown(0.2);
    doc.fontSize(11).fillColor('#6b7280').text(`${project.name} · Versión ${row.version}`);
    doc.text(`Generado: ${new Date().toLocaleString('es-PE')}`);
    doc.moveDown();

    doc.fontSize(13).fillColor('#111827').text('Datos generales');
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#374151');
    const terrain = model.terrain;
    doc.text(`Estilo: ${model.requirements.style}`);
    doc.text(`Niveles: ${model.requirements.levels}`);
    doc.text(`Dormitorios: ${model.requirements.bedrooms} · Baños: ${model.requirements.bathrooms}`);
    doc.text(`Terreno: ${terrain.width} × ${terrain.depth} m (${(terrain.width * terrain.depth).toFixed(1)} m²)`);
    doc.text(`Huella edificada: ${model.building.footprint.w} × ${model.building.footprint.h} m`);
    doc.text(`Área construida: ${built.toFixed(1)} m²`);
    doc.text(`Presupuesto declarado: USD ${Number(project.budget).toLocaleString('en-US')}`);
    doc.text(`Estimación preliminar: USD ${cost.total.toLocaleString('en-US')}`);
    doc.moveDown();

    doc.fontSize(13).fillColor('#111827').text('Cuadro de áreas');
    doc.moveDown(0.3);
    const columns = [180, 60, 70, 90, 60, 60];
    const headers = ['Ambiente', 'Nivel', 'Área (m²)', 'Dimensiones', 'Puertas', 'Ventanas'];
    let x = doc.page.margins.left;
    const startY = doc.y;
    doc.fontSize(9).fillColor('#111827');
    headers.forEach((header, index) => {
      doc.text(header, x, startY, { width: columns[index], continued: false });
      x += columns[index];
    });
    doc.moveDown(0.4);
    doc.fillColor('#374151');
    for (const room of summary.slice(0, 40)) {
      const y = doc.y;
      let cellX = doc.page.margins.left;
      const cells = [
        room.name,
        String(room.level + 1),
        room.area.toFixed(1),
        `${room.width.toFixed(2)} × ${room.depth.toFixed(2)} m`,
        String(room.doors),
        String(room.windows),
      ];
      cells.forEach((cell, index) => {
        doc.text(cell, cellX, y, { width: columns[index] });
        cellX += columns[index];
      });
      doc.y = y + 13;
      if (doc.y > doc.page.height - 120) {
        doc.addPage();
      }
    }

    doc.moveDown();
    doc.fontSize(13).fillColor('#111827').text('Presupuesto estimado (USD)');
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#374151');
    for (const line of cost.lines.slice(0, 18)) {
      doc.text(`${line.description}: ${line.quantity} ${line.unit} × ${line.unitCost.toFixed(2)} = ${line.total.toFixed(0)}`);
      if (doc.y > doc.page.height - 100) doc.addPage();
    }
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#111827');
    doc.text(`Subtotal: USD ${cost.subtotal.toFixed(0)}`);
    doc.text(`Contingencia: USD ${cost.contingency.toFixed(0)}`);
    doc.text(`Total estimado: USD ${cost.total.toFixed(0)}`);
    doc.moveDown();

    const issues = [...row.validation.errors, ...row.validation.warnings].slice(0, 12);
    if (issues.length > 0) {
      doc.fontSize(13).fillColor('#111827').text('Observaciones de validación');
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#374151');
      for (const issue of issues) {
        doc.text(`• [${issue.severity}] ${issue.message}`);
      }
      doc.moveDown();
    }

    doc.fontSize(8).fillColor('#9ca3af').text(
      'Documento preliminar generado automáticamente. No constituye un proyecto constructivo ni sustituye la revisión de un arquitecto o ingeniero habilitado.',
      { align: 'left' },
    );

    doc.end();
    return finished;
  }
}
