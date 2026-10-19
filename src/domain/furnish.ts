import { FURNITURE_CATALOG } from './catalog';
import type { IdGen } from './ids';
import type { FurnitureItem, FurnitureType, Requirements, Room } from './types';

/**
 * Amoblamiento automático determinista.
 * Las posiciones se calculan en coordenadas locales del ambiente y se recortan
 * para que ningún mueble sobresalga del mismo.
 */
export function furnishRoom(room: Room, req: Requirements, nextId: IdGen): FurnitureItem[] {
  const items: FurnitureItem[] = [];
  const W = room.rect.w;
  const H = room.rect.h;
  const area = W * H;

  const extents = (type: FurnitureType, rotation: number) => {
    const spec = FURNITURE_CATALOG[type];
    const rotated = Math.abs(rotation % 180) === 90;
    return rotated ? { w: spec.depth, d: spec.width } : { w: spec.width, d: spec.depth };
  };

  const put = (
    type: FurnitureType,
    centerX: number,
    centerY: number,
    rotation = 0,
  ): FurnitureItem | null => {
    const spec = FURNITURE_CATALOG[type];
    const { w, d } = extents(type, rotation);
    if (w + 0.1 > W || d + 0.1 > H) return null;
    if (spec.unique && items.some((i) => i.type === type)) return null;
    const x = Math.min(Math.max(centerX, w / 2 + 0.05), W - w / 2 - 0.05);
    const y = Math.min(Math.max(centerY, d / 2 + 0.05), H - d / 2 - 0.05);
    const item: FurnitureItem = {
      id: nextId('FURN'),
      type,
      roomId: room.id,
      x: room.rect.x + x,
      y: room.rect.y + y,
      rotation,
      width: spec.width,
      depth: spec.depth,
      height: spec.height,
    };
    items.push(item);
    return item;
  };

  const wide = W >= H;

  switch (room.type) {
    case 'bedroom': {
      const master = area >= 12;
      const bed: FurnitureType = master ? 'bed_double' : 'bed_single';
      const bedSpec = FURNITURE_CATALOG[bed];
      if (wide) {
        put(bed, 0.1 + bedSpec.depth / 2, H / 2, 90);
        put('nightstand', 0.1 + bedSpec.depth / 2, H / 2 + bedSpec.width / 2 + 0.35, 90);
        put('wardrobe', W - 0.4, H / 2, 90);
      } else {
        put(bed, W / 2, 0.1 + bedSpec.depth / 2, 0);
        put('nightstand', W / 2 + bedSpec.width / 2 + 0.4, 0.35, 0);
        put('wardrobe', W / 2, H - 0.4, 0);
      }
      break;
    }
    case 'living': {
      if (wide) {
        put('sofa', 0.55, H / 2, 90);
        put('coffee_table', Math.min(W / 2, 2.1), H / 2, 0);
        put('tv_unit', W - 0.35, H / 2, 270);
      } else {
        put('sofa', W / 2, 0.55, 0);
        put('coffee_table', W / 2, Math.min(H / 2, 2.1), 0);
        put('tv_unit', W / 2, H - 0.35, 0);
      }
      put('plant', 0.4, 0.4, 0);
      break;
    }
    case 'dining': {
      const chairs = Math.min(6, Math.max(4, req.familySize));
      put('dining_table', W / 2, H / 2, wide ? 0 : 90);
      const table = FURNITURE_CATALOG.dining_table;
      if (wide) {
        for (let i = 0; i < chairs; i += 1) {
          const side = i < chairs / 2 ? -1 : 1;
          const perSide = Math.ceil(chairs / 2);
          const index = i % perSide;
          const offsetX = W / 2 + (index - (perSide - 1) / 2) * 0.75;
          put('chair', offsetX, H / 2 + side * (table.depth / 2 + 0.35), 0);
        }
      } else {
        for (let i = 0; i < chairs; i += 1) {
          const side = i < chairs / 2 ? -1 : 1;
          const perSide = Math.ceil(chairs / 2);
          const index = i % perSide;
          const offsetY = H / 2 + (index - (perSide - 1) / 2) * 0.75;
          put('chair', W / 2 + side * (table.width / 2 + 0.35), offsetY, 90);
        }
      }
      break;
    }
    case 'kitchen': {
      const counterY = H - 0.4;
      put('kitchen_counter', W / 2, counterY, 0);
      put('fridge', 0.45, 0.45, 0);
      put('stove', Math.min(W - 1.2, 1.4), counterY, 0);
      put('sink', Math.min(W - 0.6, 2.4), counterY, 0);
      if (req.features.includes('island') && area >= 9) {
        put('kitchen_island', W / 2, H / 2, 0);
      }
      break;
    }
    case 'bathroom': {
      put('toilet', 0.45, H - 0.45, 0);
      put('washbasin', W - 0.45, H - 0.4, 180);
      if (area >= 5.5 && W >= 1.7) {
        put('bathtub', W / 2, 0.55, 0);
        put('shower', 0.6, 0.6, 0);
      } else {
        put('shower', 0.6, 0.6, 0);
      }
      break;
    }
    case 'garage': {
      const cars = Math.max(1, req.parkingSpaces);
      for (let i = 0; i < cars; i += 1) {
        const spacing = (W - 0.5) / cars;
        put('car', 0.25 + spacing * (i + 0.5), H / 2 + (H > 5 ? 0.4 : 0), wide ? 90 : 0);
      }
      break;
    }
    case 'terrace': {
      put('dining_table', W / 2, H / 2, 0);
      put('plant', 0.5, 0.5, 0);
      put('plant', W - 0.5, 0.5, 0);
      break;
    }
    case 'study': {
      put('desk', W / 2, H - 0.45, 0);
      put('bookshelf', 0.45, H / 2, 90);
      put('chair', W / 2, H / 2, 0);
      break;
    }
    case 'laundry': {
      put('washing_machine', 0.45, H - 0.45, 0);
      put('sink', W - 0.5, H - 0.4, 0);
      break;
    }
    case 'hall': {
      put('plant', 0.45, 0.45, 0);
      break;
    }
    default:
      break;
  }

  return items;
}
