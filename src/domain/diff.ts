import { rectArea } from './geometry';
import type { DesignModel, ModelChange, ModelDiff, Room, Wall } from './types';

interface FlatModel {
  rooms: Room[];
  walls: Wall[];
}

function flatten(model: DesignModel): FlatModel {
  return {
    rooms: model.building.levels.flatMap((l) => l.rooms),
    walls: model.building.levels.flatMap((l) => l.walls),
  };
}

function openingsOf(walls: Wall[]) {
  return walls.flatMap((w) => w.openings);
}

/**
 * Diferencia estructurada entre dos versiones del modelo. Se usa para mostrar
 * al cliente qué cambió exactamente y para alimentar el historial.
 */
export function diffModels(before: DesignModel, after: DesignModel): ModelDiff {
  const changes: ModelChange[] = [];
  const a = flatten(before);
  const b = flatten(after);

  const beforeRooms = new Map(a.rooms.map((r) => [r.id, r]));
  const afterRooms = new Map(b.rooms.map((r) => [r.id, r]));

  for (const room of b.rooms) {
    const previous = beforeRooms.get(room.id);
    if (!previous) {
      changes.push({
        kind: 'room_added',
        elementId: room.id,
        label: `Se agregó ${room.name} (${rectArea(room.rect).toFixed(1)} m2)`,
        after: room.rect,
      });
      continue;
    }
    const areaBefore = rectArea(previous.rect);
    const areaAfter = rectArea(room.rect);
    if (Math.abs(areaBefore - areaAfter) > 0.05) {
      changes.push({
        kind: 'room_resized',
        elementId: room.id,
        label: `${room.name}: ${areaBefore.toFixed(1)} m2 -> ${areaAfter.toFixed(1)} m2`,
        before: previous.rect,
        after: room.rect,
      });
    }
    if (previous.floorMaterialId !== room.floorMaterialId) {
      changes.push({
        kind: 'room_floor',
        elementId: room.id,
        label: `${room.name}: piso cambiado a ${room.floorMaterialId}`,
        before: previous.floorMaterialId,
        after: room.floorMaterialId,
      });
    }
    if (previous.interiorColor !== room.interiorColor) {
      changes.push({
        kind: 'room_color',
        elementId: room.id,
        label: `${room.name}: color de muros ${previous.interiorColor} -> ${room.interiorColor}`,
        before: previous.interiorColor,
        after: room.interiorColor,
      });
    }
    if (previous.name !== room.name) {
      changes.push({
        kind: 'room_renamed',
        elementId: room.id,
        label: `Ambiente renombrado: ${previous.name} -> ${room.name}`,
        before: previous.name,
        after: room.name,
      });
    }
    const beforeFurniture = new Map(previous.furniture.map((f) => [f.id, f]));
    const afterFurniture = new Map(room.furniture.map((f) => [f.id, f]));
    for (const item of room.furniture) {
      if (!beforeFurniture.has(item.id)) {
        changes.push({
          kind: 'furniture_added',
          elementId: item.id,
          label: `${room.name}: se agregó ${item.type}`,
          after: item.type,
        });
      }
    }
    for (const item of previous.furniture) {
      if (!afterFurniture.has(item.id)) {
        changes.push({
          kind: 'furniture_removed',
          elementId: item.id,
          label: `${room.name}: se retiró ${item.type}`,
          before: item.type,
        });
      }
    }
  }

  for (const room of a.rooms) {
    if (!afterRooms.has(room.id)) {
      changes.push({
        kind: 'room_removed',
        elementId: room.id,
        label: `Se eliminó ${room.name}`,
        before: room.rect,
      });
    }
  }

  /* --------------------------------- Muros --------------------------------- */
  const beforeWalls = new Map(a.walls.map((w) => [w.id, w]));
  const afterWalls = new Map(b.walls.map((w) => [w.id, w]));
  let addedWalls = 0;
  let removedWalls = 0;
  for (const wall of b.walls) if (!beforeWalls.has(wall.id)) addedWalls += 1;
  for (const wall of a.walls) if (!afterWalls.has(wall.id)) removedWalls += 1;
  if (addedWalls > 0) {
    changes.push({ kind: 'wall_added', label: `${addedWalls} muro(s) agregado(s)` });
  }
  if (removedWalls > 0) {
    changes.push({ kind: 'wall_removed', label: `${removedWalls} muro(s) eliminado(s)` });
  }

  /* --------------------------------- Vanos --------------------------------- */
  const beforeOpenings = new Map(openingsOf(a.walls).map((o) => [o.id, o]));
  const afterOpenings = new Map(openingsOf(b.walls).map((o) => [o.id, o]));
  for (const opening of openingsOf(b.walls)) {
    if (!beforeOpenings.has(opening.id)) {
      changes.push({
        kind: 'opening_added',
        elementId: opening.id,
        label: `Se agregó ${opening.kind === 'door' ? 'puerta' : 'ventana'} (${opening.width.toFixed(
          2,
        )} m)`,
        after: opening,
      });
    }
  }
  for (const opening of openingsOf(a.walls)) {
    if (!afterOpenings.has(opening.id)) {
      changes.push({
        kind: 'opening_removed',
        elementId: opening.id,
        label: `Se retiró ${opening.kind === 'door' ? 'puerta' : 'ventana'} de ${opening.wallId}`,
        before: opening,
      });
    }
  }

  /* ---------------------------- Fachada y techo ---------------------------- */
  if (before.building.facadeColor !== after.building.facadeColor) {
    changes.push({
      kind: 'facade',
      label: `Color de fachada ${before.building.facadeColor} -> ${after.building.facadeColor}`,
      before: before.building.facadeColor,
      after: after.building.facadeColor,
    });
  }
  if (before.building.facadeMaterialId !== after.building.facadeMaterialId) {
    changes.push({
      kind: 'facade',
      label: `Material de fachada: ${after.building.facadeMaterialId}`,
      before: before.building.facadeMaterialId,
      after: after.building.facadeMaterialId,
    });
  }
  if (before.building.roof.materialId !== after.building.roof.materialId) {
    changes.push({
      kind: 'roof',
      label: `Material de cubierta: ${after.building.roof.materialId}`,
      before: before.building.roof.materialId,
      after: after.building.roof.materialId,
    });
  }
  if (after.building.levels.length !== before.building.levels.length) {
    changes.push({
      kind: 'level_added',
      label: `Niveles: ${before.building.levels.length} -> ${after.building.levels.length}`,
    });
  }

  const structural = changes.some((c) =>
    ['room_added', 'room_removed', 'room_resized', 'wall_added', 'wall_removed', 'level_added', 'opening_added', 'opening_removed'].includes(
      c.kind,
    ),
  );

  return {
    changes,
    summary: changes.map((c) => c.label),
    sameStructure: !structural,
  };
}
