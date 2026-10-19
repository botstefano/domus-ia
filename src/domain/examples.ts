import type { Requirements, Terrain } from './types';

/** Terreno de demostración: 10 x 20 m (200 m2) con retiros normativos típicos. */
export const DEMO_TERRAIN: Terrain = {
  width: 10,
  depth: 20,
  setbacks: { front: 2, back: 2, left: 1.5, right: 1.5 },
  orientation: 'south',
  slope: 0,
};

/** Requisitos de demostración del escenario principal del MVP. */
export const DEMO_REQUIREMENTS: Requirements = {
  style: 'modern',
  levels: 2,
  bedrooms: 3,
  bathrooms: 2,
  parkingSpaces: 1,
  budget: 185000,
  familySize: 4,
  features: ['garden', 'terrace', 'openKitchen', 'laundry'],
  notes: [
    'Casa de dos pisos sobre un terreno de 10 x 20 metros.',
    'Tres dormitorios, sala-comedor, cocina abierta, dos baños, cochera y jardín.',
    'Estilo moderno con presupuesto económico.',
  ],
};

/** Instrucción de ejemplo usada en pruebas y en la demo de la interfaz. */
export const DEMO_INSTRUCTION =
  'Quiero una casa moderna de dos pisos, con tres dormitorios, dos baños, una sala amplia, cocina abierta, comedor, jardín, cochera para un vehículo y una terraza en el segundo piso. El terreno mide 200 m².';

export const DEMO_MODIFICATION =
  'Quiero ampliar la cocina a 16 m2, agregar una isla central y cambiar la fachada a tonos blancos y grises.';
