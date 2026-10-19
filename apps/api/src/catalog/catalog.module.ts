import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { STYLE_PROFILES, FURNITURE_CATALOG, ROOM_DEFAULTS } from '@domus/domain';
import { Repository } from '../db/repository';

@ApiTags('Catálogo')
@ApiBearerAuth()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly repository: Repository) {}

  @Get('materials')
  @ApiOperation({ summary: 'Catálogo de materiales y acabados' })
  materials(@Query('category') category?: string) {
    return this.repository.listMaterials(category);
  }

  @Get('furniture')
  @ApiOperation({ summary: 'Catálogo de mobiliario' })
  furniture() {
    return this.repository.listFurniture();
  }

  @Get('suppliers')
  @ApiOperation({ summary: 'Proveedores registrados' })
  suppliers() {
    return this.repository.listSuppliers();
  }

  @Get('styles')
  @ApiOperation({ summary: 'Estilos arquitectónicos disponibles' })
  styles() {
    return Object.values(STYLE_PROFILES).map((profile) => ({
      id: profile.id,
      label: profile.label,
      description: profile.description,
      palette: profile.palette,
      defaultFloorMaterialId: profile.floorMaterialId,
      defaultFacadeMaterialId: profile.facadeMaterialId,
      floorToCeilingWindows: profile.floorToCeilingWindows,
    }));
  }

  @Get('rooms')
  @ApiOperation({ summary: 'Tipologías de ambiente y superficies mínimas de referencia' })
  rooms() {
    return Object.entries(ROOM_DEFAULTS).map(([type, defaults]) => ({ type, ...defaults }));
  }

  @Get('furniture-types')
  @ApiOperation({ summary: 'Tipos de mobiliario admitidos por el motor' })
  furnitureTypes() {
    return Object.entries(FURNITURE_CATALOG).map(([type, spec]) => ({ type, ...spec }));
  }
}

@Module({
  controllers: [CatalogController],
})
export class CatalogModule {}
