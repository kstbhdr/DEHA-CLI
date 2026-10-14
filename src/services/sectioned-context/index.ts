/**
 * Bölümlü agent context'i — dışa açık API.
 * Tasarım: 1) Görev  2) Plan/Brain  3) Değişiklikler  4) Tool günlüğü
 */

import type { DehaConfig } from '../../config';
import { getMaxContextTokens } from '../token-counter';
import { computeOutputReserve, estimateTextTokens, parseSectionRatios } from './budget';
import { TurnContextAssembler } from './assembler';

export { TurnContextAssembler } from './assembler';
export type { BuildStats, AssemblerMessage } from './assembler';
export { BRAIN_TOOL, executeBrainTool, renderBrain } from './brain';
export { addTaskFollowUp } from './task-anchor';
export { computeSectionBudgets, parseSectionRatios, DEFAULT_SECTION_RATIOS } from './budget';
export { getWorkspace, resetWorkspace } from './store';
export { summarizeToolResult } from './tool-log';
export { recordChange, renderChanges } from './change-ledger';

/** Sistem prompt'una eklenen bölüm kuralları (sabit metin → önbellek dostu). */
export const SECTIONED_CONTEXT_PROMPT = `

[CONTEXT LAYOUT — DEHA]
Your context is rebuilt every step from four sections:
1. <task> — the user's original request + follow-up instructions. This is THE job. Never drop it, never claim the user's message is empty.
2. <brain> (at the very end) — your own persistent plan/notes. Maintain it with the \`brain\` tool:
   - For multi-step work, start with brain set_plan; mark steps doing/done with update_step.
   - Record important findings (add_finding) and decisions with reasons (add_decision).
   - EVERY approach that failed → add_dead_end with why. Before trying something, check dead ends and do not repeat them.
   - When brain says it is full, condense with brain rewrite.
3. <work_log> "Yapılan değişiklikler" — automatic ledger of files you changed.
4. <work_log> "Araç çağrıları" — one-line summaries of older tool calls; the latest rounds follow in full.
Older tool output may be summarized to save context — trust the summaries and the brain instead of re-running the same commands.`;

export function isSectionedContextEnabled(): boolean {
  return process.env.DEHA_SECTIONED_CONTEXT !== '0';
}

function activeModel(config: DehaConfig): string {
  switch (config.provider) {
    case 'claude': return config.claudeModel || '';
    case 'openai': return config.openaiModel || '';
    case 'deepseek': return config.deepseekModel || '';
    case 'ollama': return config.ollamaModel || '';
    case 'openrouter': return config.openrouterModel || '';
    case 'xai': return config.xaiModel || '';
    default: return '';
  }
}

export function resolveTotalContextTokens(config: DehaConfig): number {
  return config.maxContextTokens > 0 ? config.maxContextTokens : getMaxContextTokens(config.provider, activeModel(config));
}

export function createTurnAssembler(config: DehaConfig, tools: unknown[], format: 'openai' | 'claude'): TurnContextAssembler {
  const totalContext = resolveTotalContextTokens(config);
  return new TurnContextAssembler({
    format,
    totalContext,
    outputReserve: computeOutputReserve(totalContext, config.toolMaxTokens || config.maxTokens),
    toolSchemaTokens: estimateTextTokens(JSON.stringify(tools ?? [])),
    ratios: parseSectionRatios(process.env.DEHA_CTX_RATIOS),
  });
}
