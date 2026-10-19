import { describe, expect, it } from 'vitest';
import {
  DEMO_INSTRUCTION,
  DEMO_MODIFICATION,
  DEMO_REQUIREMENTS,
  DEMO_TERRAIN,
  generateDesign,
} from '@domus/domain';
import { interpret, parseInstruction, summarizeIntent } from '../src';

const model = generateDesign({
  projectId: 'PRJ-DEMO',
  requirements: DEMO_REQUIREMENTS,
  terrain: DEMO_TERRAIN,
});

function kitchenId(): string {
  const kitchen = model.building.levels[0].rooms.find((room) => room.type === 'kitchen');
  if (!kitchen) throw new Error('Sin cocina');
  return kitchen.id;
}

describe('parseInstruction - generación', () => {
  it('extrae requisitos completos de una descripción de vivienda', () => {
    const intent = parseInstruction(DEMO_INSTRUCTION);
    expect(intent.intent).toBe('generate');
    expect(intent.requirements?.levels).toBe(2);
    expect(intent.requirements?.bedrooms).toBe(3);
    expect(intent.requirements?.bathrooms).toBe(2);
    expect(intent.requirements?.parkingSpaces).toBe(1);
    expect(intent.requirements?.style).toBe('modern');
    expect(intent.requirements?.features).toContain('garden');
    expect(intent.requirements?.features).toContain('terrace');
    expect(intent.terrain?.width).toBe(10);
    expect(intent.terrain?.depth).toBe(20);
    expect(intent.confidence).toBeGreaterThan(0.6);
    expect(intent.source).toBe('rules');
  });

  it('detecta información faltante y formula preguntas', () => {
    const intent = parseInstruction('Diseña una casa minimalista');
    expect(intent.intent).toBe('generate');
    expect(intent.clarifications.length).toBeGreaterThanOrEqual(3);
    expect(intent.clarifications.join(' ')).toContain('dormitorios');
    expect(intent.clarifications.join(' ')).toContain('terreno');
  });

  it('interpreta la superficie del terreno expresada solo como área', () => {
    const intent = parseInstruction('Quiero una casa de un piso de 120 m2 con dos dormitorios');
    expect(intent.intent).toBe('generate');
    expect(intent.terrain?.width).toBeGreaterThan(0);
    expect(intent.terrain?.depth).toBeGreaterThan(0);
    expect(intent.requirements?.levels).toBe(1);
  });
});

describe('parseInstruction - modificaciones', () => {
  const context = { model };

  it('interpreta "amplía la cocina a 16 m2" como resize_room', () => {
    const intent = parseInstruction('Amplía la cocina a 16 m2', context);
    expect(intent.intent).toBe('modify');
    expect(intent.operations).toHaveLength(1);
    expect(intent.operations[0]).toEqual({
      op: 'resize_room',
      roomId: kitchenId(),
      targetArea: 16,
    });
  });

  it('interpreta "cambia la fachada a un estilo minimalista"', () => {
    const intent = parseInstruction('Cambia la fachada a un estilo minimalista', context);
    expect(intent.operations[0]).toEqual({ op: 'set_style', style: 'minimalist' });
  });

  it('interpreta "agrega una habitación en el segundo piso"', () => {
    const intent = parseInstruction('Agrega una habitación en el segundo piso', context);
    expect(intent.intent).toBe('modify');
    const operation = intent.operations[0];
    expect(operation.op).toBe('add_room');
    if (operation.op === 'add_room') {
      expect(operation.type).toBe('bedroom');
      expect(operation.level).toBe(1);
      expect(operation.targetArea).toBeGreaterThan(5);
    }
  });

  it('interpreta "cambia las ventanas por ventanales de piso a techo"', () => {
    const intent = parseInstruction('Cambia las ventanas por ventanales de piso a techo', context);
    expect(intent.operations[0]).toEqual({ op: 'windows_floor_to_ceiling', scope: 'all' });
  });

  it('interpreta "sustituye el piso de cerámica por porcelanato"', () => {
    const intent = parseInstruction('Sustituye el piso de cerámica por porcelanato', context);
    expect(intent.operations.length).toBeGreaterThan(3);
    for (const operation of intent.operations) {
      expect(operation.op).toBe('set_room_floor');
      if (operation.op === 'set_room_floor') {
        expect(operation.materialId).toBe('floor.porcelain.matte');
      }
    }
  });

  it('interpreta "agrega una isla central a la cocina"', () => {
    const intent = parseInstruction('Agrega una isla central a la cocina', context);
    expect(intent.operations[0]).toEqual({
      op: 'add_furniture',
      roomId: kitchenId(),
      type: 'kitchen_island',
    });
  });

  it('interpreta "cambia el color de las paredes a blanco"', () => {
    const intent = parseInstruction('Cambia el color de las paredes a blanco', context);
    expect(intent.operations.length).toBeGreaterThan(3);
    expect(intent.operations.every((operation) => operation.op === 'set_room_color')).toBe(true);
    if (intent.operations[0].op === 'set_room_color') {
      expect(intent.operations[0].color).toBe('#f3f1ec');
    }
  });

  it('interpreta "mueve la puerta principal hacia la izquierda"', () => {
    const intent = parseInstruction('Mueve la puerta principal hacia la izquierda', context);
    expect(intent.operations[0].op).toBe('move_door');
    if (intent.operations[0].op === 'move_door') {
      expect(intent.operations[0].delta).toBeLessThan(0);
      expect(intent.operations[0].doorId).toMatch(/^OPEN-/);
    }
  });

  it('interpreta la reducción de presupuesto', () => {
    const intent = parseInstruction('Reduce el presupuesto utilizando materiales más económicos', context);
    expect(intent.operations[0].op).toBe('reduce_budget');
  });

  it('interpreta una comparación de versiones', () => {
    const intent = parseInstruction('Compara esta propuesta con una alternativa de menor costo', context);
    expect(intent.intent).toBe('compare');
    expect(intent.operations).toHaveLength(0);
  });

  it('separa dos instrucciones unidas por "y"', () => {
    const intent = parseInstruction('Amplía la sala y reduce el tamaño del comedor', context);
    expect(intent.operations).toHaveLength(2);
    expect(intent.operations.every((operation) => operation.op === 'resize_room')).toBe(true);
    const [first, second] = intent.operations;
    if (first.op === 'resize_room' && second.op === 'resize_room') {
      const living = model.building.levels[0].rooms.find((room) => room.type === 'living');
      const dining = model.building.levels[0].rooms.find((room) => room.type === 'dining');
      expect(first.roomId).toBe(living?.id);
      expect(second.roomId).toBe(dining?.id);
      expect(first.targetArea).toBeGreaterThan(second.targetArea);
    }
  });

  it('interpreta la modificación compuesta del escenario de demostración', () => {
    const intent = parseInstruction(DEMO_MODIFICATION, context);
    expect(intent.intent).toBe('modify');
    const kinds = intent.operations.map((operation) => operation.op);
    expect(kinds).toContain('resize_room');
    expect(kinds).toContain('add_furniture');
    expect(kinds).toContain('set_facade_color');
    expect(intent.notes.length).toBeGreaterThan(0);
    expect(intent.explanation).toContain('isla');
  });

  it('pide aclaración si el ambiente no existe en el modelo', () => {
    const intent = parseInstruction('Amplía la terraza a 30 m2', {
      model: generateDesign({
        projectId: 'PRJ-1',
        requirements: { ...DEMO_REQUIREMENTS, levels: 1, features: [] },
        terrain: DEMO_TERRAIN,
      }),
    });
    expect(intent.operations).toHaveLength(0);
    expect(intent.clarifications.join(' ').toLowerCase()).toContain('terraza');
  });

  it('devuelve unknown para instrucciones no reconocidas', () => {
    const intent = parseInstruction('Hola, ¿cómo estás?', context);
    expect(intent.intent).toBe('unknown');
    expect(intent.clarifications.length).toBeGreaterThan(0);
  });
});

describe('adaptador de modelo de lenguaje', () => {
  const config = { baseUrl: 'https://llm.example/v1', apiKey: 'test', model: 'demo' };

  it('usa la respuesta JSON validada del proveedor', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'modify',
                operations: [{ op: 'set_style', style: 'minimalist' }],
                clarification: [],
                clarifications: [],
                explanation: 'Se aplicará el estilo minimalista.',
                confidence: 0.9,
              }),
            },
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const intent = await interpret('ponla minimalista', { model }, { llm: config, fetchImpl });
    expect(intent.source).toBe('llm');
    expect(intent.intent).toBe('modify');
    expect(intent.operations).toEqual([{ op: 'set_style', style: 'minimalist' }]);
  });

  it('descarta operaciones desconocidas devueltas por el modelo', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'modify',
                operations: [{ op: 'delete_universe' }, { op: 'add_level' }],
                explanation: 'x',
                confidence: 0.5,
              }),
            },
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const intent = await interpret('agrega un piso', { model }, { llm: config, fetchImpl });
    expect(intent.operations).toEqual([{ op: 'add_level' }]);
  });

  it('cae a las reglas deterministas si el proveedor falla', async () => {
    const fetchImpl = (async () => {
      throw new Error('sin red');
    }) as unknown as typeof fetch;

    const intent = await interpret('Amplía la cocina a 16 m2', { model }, { llm: config, fetchImpl });
    expect(intent.source).toBe('rules');
    expect(intent.operations[0].op).toBe('resize_room');
    expect(intent.notes.join(' ')).toContain('determinista');
  });

  it('cae a las reglas si la respuesta no es JSON válido', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'no es json' } }] }),
    })) as unknown as typeof fetch;

    const intent = await interpret('cambia el color de las paredes a gris', { model }, { llm: config, fetchImpl });
    expect(intent.source).toBe('rules');
    expect(intent.notes.join(' ')).toContain('determinista');
  });
});

describe('summarizeIntent', () => {
  it('incluye explicación y preguntas pendientes', () => {
    const intent = parseInstruction('Diseña una casa minimalista');
    const summary = summarizeIntent(intent);
    expect(summary).toContain('Necesito confirmar');
    expect(summary.length).toBeGreaterThan(40);
  });
});
