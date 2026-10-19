import type { DesignModel } from '@domus/domain';
import { parseInstruction } from './nlu';
import type { InterpretationContext, InterpretationOptions, LlmConfig, ParsedIntent } from './types';

const KNOWN_OPERATIONS = new Set([
  'resize_room',
  'add_room',
  'remove_room',
  'add_window',
  'windows_floor_to_ceiling',
  'add_door',
  'move_door',
  'set_room_floor',
  'set_room_color',
  'set_facade_color',
  'set_facade_material',
  'set_roof_material',
  'set_style',
  'add_furniture',
  'remove_furniture',
  'add_level',
  'reduce_budget',
]);

const OPERATION_DOCS = `
Operaciones permitidas (campo "op") y sus parámetros:
- resize_room: { roomId, targetArea }                 // superficie objetivo en m2
- add_room: { type, level, targetArea }               // type: bedroom|bathroom|study|kitchen|dining|living|laundry|storage|terrace|garage
- remove_room: { roomId }
- add_window: { roomId, width?, height?, sill? }
- windows_floor_to_ceiling: { scope: "all"|"level"|"room", roomId?, level? }
- add_door: { roomId, toRoomId? }
- move_door: { doorId, delta }                        // delta en metros, negativo = izquierda
- set_room_floor: { roomId, materialId }
- set_room_color: { roomId, color }                   // color hex #rrggbb
- set_facade_color: { color }
- set_facade_material: { materialId }
- set_roof_material: { materialId }
- set_style: { style: "modern"|"minimalist"|"classic"|"mediterranean"|"industrial"|"nordic" }
- add_furniture: { roomId, type }
- remove_furniture: { roomId, type }
- add_level: {}
- reduce_budget: { percent }                           // 0-1
`;

export function buildSystemPrompt(model?: DesignModel): string {
  const modelSummary = model
    ? model.building.levels
        .map((level) => {
          const rooms = level.rooms
            .map(
              (room) =>
                `${room.id} (${room.type}, ${room.name}, ${(room.rect.w * room.rect.h).toFixed(1)} m2)`,
            )
            .join('; ');
          return `Planta ${level.index}: ${rooms}`;
        })
        .join('\n')
    : 'Todavía no existe un modelo generado.';

  return `Eres el intérprete de instrucciones de un sistema de diseño arquitectónico.
Tu única tarea es convertir la instrucción del cliente en operaciones geométricas
estructuradas. No inventes ambientes ni identificadores: usa solo los existentes.

Modelo actual:
${modelSummary}

${OPERATION_DOCS}

Responde EXCLUSIVAMENTE con un objeto JSON con este formato:
{
  "intent": "generate" | "modify" | "compare" | "clarify" | "unknown",
  "operations": [ ... ],
  "requirements": { "style": ..., "levels": 2, "bedrooms": 3, "bathrooms": 2, "parkingSpaces": 1, "budget": 150000, "familySize": 4, "features": [...] },
  "terrain": { "width": 10, "depth": 20 },
  "clarifications": ["..."],
  "explanation": "explicación breve en español",
  "confidence": 0.0-1.0
}

Reglas:
- Si la instrucción pide generar una vivienda nueva, usa "generate" y llena "requirements".
- Si pide cambiar algo del modelo existente, usa "modify" y usa identificadores reales.
- Si falta información imprescindible, agrega preguntas en "clarifications".
- No devuelvas texto fuera del JSON.`;
}

function coerceIntent(raw: unknown): ParsedIntent {
  if (!raw || typeof raw !== 'object') throw new Error('Respuesta del modelo vacía o inválida.');
  const data = raw as Record<string, unknown>;
  const intent = data.intent;
  if (typeof intent !== 'string' || !['generate', 'modify', 'compare', 'clarify', 'unknown'].includes(intent)) {
    throw new Error('La intención devuelta por el modelo no es válida.');
  }
  const operations = Array.isArray(data.operations)
    ? data.operations.filter(
        (operation): operation is Record<string, unknown> =>
          !!operation &&
          typeof operation === 'object' &&
          KNOWN_OPERATIONS.has(String((operation as Record<string, unknown>).op)),
      )
    : [];
  const clarifications = Array.isArray(data.clarifications)
    ? data.clarifications.filter((value): value is string => typeof value === 'string')
    : [];
  const confidence = typeof data.confidence === 'number' ? Math.max(0, Math.min(1, data.confidence)) : 0.6;

  return {
    intent: intent as ParsedIntent['intent'],
    operations: operations as unknown as ParsedIntent['operations'],
    requirements: (data.requirements as ParsedIntent['requirements']) ?? undefined,
    terrain: (data.terrain as ParsedIntent['terrain']) ?? undefined,
    clarifications,
    explanation:
      typeof data.explanation === 'string' && data.explanation.length > 0
        ? data.explanation
        : 'Instrucción interpretada con el modelo de lenguaje.',
    confidence,
    source: 'llm',
    unresolved: [],
    notes: ['Interpretación generada por un modelo de lenguaje y validada por el orquestador.'],
  };
}

/**
 * Interpreta una instrucción usando un modelo de lenguaje con salida JSON.
 * Lanza una excepción si la respuesta no cumple el contrato; el orquestador
 * cae entonces a las reglas deterministas.
 */
export async function interpretWithLlm(
  text: string,
  model: DesignModel | undefined,
  config: LlmConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ParsedIntent> {
  if (!config.apiKey) throw new Error('No hay credenciales del modelo de lenguaje configuradas.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 20000);

  try {
    const response = await fetchImpl(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt(model) },
          { role: 'user', content: text },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`El proveedor de IA respondió ${response.status}.`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('El proveedor de IA no devolvió contenido.');
    return coerceIntent(JSON.parse(content));
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Punto de entrada del orquestador: usa el modelo de lenguaje cuando está
 * configurado y cae a las reglas deterministas ante cualquier fallo.
 */
export async function interpret(
  text: string,
  context: InterpretationContext = {},
  options: InterpretationOptions = {},
): Promise<ParsedIntent> {
  const rules = parseInstruction(text, context);
  if (!options.llm || !options.llm.apiKey) return rules;

  try {
    return await interpretWithLlm(text, context.model, options.llm, options.fetchImpl ?? fetch);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ...rules,
      notes: [
        ...rules.notes,
        `No se pudo usar el modelo de lenguaje (${reason}); se aplicó la interpretación determinista por reglas.`,
      ],
    };
  }
}

/** Resumen legible de la interpretación, listo para mostrar en el chat. */
export function summarizeIntent(intent: ParsedIntent): string {
  const lines = [intent.explanation];
  if (intent.clarifications.length > 0) {
    lines.push('', 'Necesito confirmar:');
    for (const question of intent.clarifications) lines.push(`- ${question}`);
  }
  if (intent.operations.length > 0) {
    lines.push('', `Operaciones a aplicar: ${intent.operations.length}.`);
  }
  return lines.join('\n');
}
