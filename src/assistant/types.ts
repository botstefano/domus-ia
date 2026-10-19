import type { Operation, Requirements, Terrain } from '@domus/domain';

export type IntentKind = 'generate' | 'modify' | 'compare' | 'clarify' | 'unknown';

export interface ParsedIntent {
  intent: IntentKind;
  /** Operaciones geométricas estructuradas que deben aplicarse al modelo. */
  operations: Operation[];
  /** Requisitos extraídos cuando la intención es generar una vivienda nueva. */
  requirements?: Partial<Requirements>;
  /** Terreno detectado en el texto (dimensiones o superficie). */
  terrain?: Partial<Terrain>;
  /** Preguntas que el asistente debe formular antes de continuar. */
  clarifications: string[];
  /** Explicación en lenguaje natural de lo que se entendió. */
  explanation: string;
  confidence: number;
  source: 'rules' | 'llm';
  /** Fragmentos que no se pudieron interpretar. */
  unresolved: string[];
  notes: string[];
}

export interface InterpretationContext {
  /** Modelo vigente; permite resolver "la cocina" a un identificador concreto. */
  model?: import('@domus/domain').DesignModel;
  /** Fuerza el modo de interpretación. */
  mode?: 'auto' | 'generate' | 'modify';
}

export interface LlmConfig {
  /** Endpoint compatible con la API de chat completions (OpenAI, Azure, local). */
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

export interface InterpretationOptions {
  llm?: LlmConfig | null;
  fetchImpl?: typeof fetch;
}

export const EMPTY_INTENT: ParsedIntent = {
  intent: 'unknown',
  operations: [],
  clarifications: [],
  explanation: 'No se pudo interpretar la instrucción.',
  confidence: 0,
  source: 'rules',
  unresolved: [],
  notes: [],
};
