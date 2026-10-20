/**
 * 2. Bölüm — Plan / Second Brain.
 *
 * Model bu bölümü `brain` aracıyla KENDİSİ yönetir: plan adımları, bulgular,
 * kararlar ve en önemlisi "çıkmaz sokaklar" (denenmiş ve işe yaramamış
 * yaklaşımlar). ARC gibi uzun işlerde modelin aynı şeyi tekrar tekrar
 * denemesini engelleyen kısım budur.
 */

import type { ToolDefinition } from '../ai-service';
import { BrainState, StepStatus, getWorkspace, saveWorkspace, writeBrainFile } from './store';
import { estimateTextTokens, oneLine, tokensToChars } from './budget';

export const BRAIN_TOOL: ToolDefinition = {
  name: 'brain',
  description: [
    'Your persistent second brain for the current work (survives context trimming and restarts).',
    'Use it to keep a plan, record findings/decisions, and — most importantly — record dead ends so you never retry a failed approach.',
    'Actions: set_plan(steps[]), add_step(text), update_step(index, status, text?), set_criteria(text),',
    'add_finding(text), add_decision(text), add_dead_end(text), rewrite(section, items[]) to condense a section, view.',
    'Statuses: todo | doing | done | blocked. Step index is 1-based. Use update_step to mark progress. Replacing a plan retains matching step statuses; do not restart completed discovery.',
  ].join(' '),
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['set_plan', 'add_step', 'update_step', 'set_criteria', 'add_finding', 'add_decision', 'add_dead_end', 'rewrite', 'view'],
        description: 'Operation to perform',
      },
      steps: { type: 'array', items: { type: 'string' }, description: 'set_plan: ordered plan steps' },
      index: { type: 'number', description: 'update_step: 1-based step number' },
      status: { type: 'string', enum: ['todo', 'doing', 'done', 'blocked'], description: 'update_step: new status' },
      text: { type: 'string', description: 'Text for add_* / set_criteria / update_step' },
      section: { type: 'string', enum: ['findings', 'decisions', 'dead_ends', 'steps'], description: 'rewrite: section to replace' },
      items: { type: 'array', items: { type: 'string' }, description: 'rewrite: condensed replacement items' },
    },
    required: ['action'],
  },
};

const STATUS_MARK: Record<StepStatus, string> = { todo: '[ ]', doing: '[~]', done: '[x]', blocked: '[!]' };
const VALID_STATUS = new Set<StepStatus>(['todo', 'doing', 'done', 'blocked']);
const MAX_ITEM_CHARS = 600;

function clean(text: unknown): string {
  return String(text ?? '').trim().slice(0, MAX_ITEM_CHARS);
}

function planSteps(items: string[], previous: BrainState['steps']): BrainState['steps'] {
  const parse = (text: string) => {
    const mark = /^\[([x~! ])\]\s*/i.exec(text);
    const doneSuffix = /\s+[-—:]\s*(DONE|TAMAMLANDI)\s*$/i.test(text);
    const label = text.replace(/^\[[x~! ]\]\s*/i, '').replace(/\s+[-—:]\s*(DONE|TAMAMLANDI)\s*$/i, '').trim();
    const explicit: StepStatus | undefined = doneSuffix || mark?.[1].toLowerCase() === 'x' ? 'done'
      : mark?.[1] === '~' ? 'doing' : mark?.[1] === '!' ? 'blocked' : mark ? 'todo' : undefined;
    return { label, explicit, key: label.toLowerCase().replace(/\s+/g, ' ') };
  };
  const statuses = new Map(previous.map(s => [parse(s.text).key, s.status]));
  return items.map(text => { const p = parse(text); return { text: p.label, status: p.explicit ?? statuses.get(p.key) ?? 'todo' }; });
}

export function executeBrainTool(input: Record<string, unknown>): string {
  const ws = getWorkspace();
  const b = ws.brain;
  const action = String(input.action ?? 'view');
  let msg: string;

  switch (action) {
    case 'set_plan': {
      const steps = Array.isArray(input.steps) ? input.steps.map(clean).filter(Boolean) : [];
      if (steps.length === 0) return 'HATA: set_plan için steps[] gerekli.';
      b.steps = planSteps(steps, b.steps);
      msg = `Plan kaydedildi (${steps.length} adım).`;
      break;
    }
    case 'add_step': {
      const text = clean(input.text);
      if (!text) return 'HATA: add_step için text gerekli.';
      b.steps.push({ text, status: 'todo' });
      msg = `Adım ${b.steps.length} eklendi.`;
      break;
    }
    case 'update_step': {
      const idx = Number(input.index) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx >= b.steps.length) return `HATA: geçersiz adım numarası (1..${b.steps.length}).`;
      const status = String(input.status ?? '') as StepStatus;
      if (input.status !== undefined && !VALID_STATUS.has(status)) return 'HATA: status todo|doing|done|blocked olmalı.';
      if (input.status !== undefined) b.steps[idx].status = status;
      if (input.text) b.steps[idx].text = clean(input.text);
      msg = `Adım ${idx + 1} → ${b.steps[idx].status}.`;
      break;
    }
    case 'set_criteria': {
      b.criteria = clean(input.text);
      msg = 'Kabul kriteri kaydedildi.';
      break;
    }
    case 'add_finding':
    case 'add_decision':
    case 'add_dead_end': {
      const text = clean(input.text);
      if (!text) return `HATA: ${action} için text gerekli.`;
      const list = action === 'add_finding' ? b.findings : action === 'add_decision' ? b.decisions : b.deadEnds;
      if (!list.includes(text)) list.push(text);
      msg = action === 'add_dead_end' ? 'Çıkmaz sokak kaydedildi — bu yaklaşım tekrar denenmeyecek.' : 'Kaydedildi.';
      break;
    }
    case 'rewrite': {
      const items = Array.isArray(input.items) ? input.items.map(clean).filter(Boolean) : [];
      const section = String(input.section ?? '');
      if (section === 'findings') b.findings = items;
      else if (section === 'decisions') b.decisions = items;
      else if (section === 'dead_ends') b.deadEnds = items;
      else if (section === 'steps') b.steps = planSteps(items, b.steps);
      else return 'HATA: section findings|decisions|dead_ends|steps olmalı.';
      msg = `${section} yeniden yazıldı (${items.length} öğe).`;
      break;
    }
    case 'view':
      return renderBrain(b, 50_000) || '(brain boş)';
    default:
      return `HATA: bilinmeyen brain action: ${action}`;
  }

  b.updatedAt = new Date().toISOString();
  saveWorkspace(ws);
  writeBrainFile(`# DEHA Brain\n\n> Güncelleme: ${b.updatedAt}\n\n${renderBrain(b, 1_000_000)}\n`);
  return msg;
}

function renderSteps(steps: BrainState['steps'], collapseDone: boolean): string[] {
  if (steps.length === 0) return [];
  const lines: string[] = ['## Plan'];
  if (collapseDone) {
    const done = steps.map((s, i) => ({ s, i })).filter(x => x.s.status === 'done');
    if (done.length > 0) lines.push(`✓ ${done.length} adım tamamlandı: ${oneLine(done.map(x => `${x.i + 1}. ${x.s.text}`).join('; '), 400)}`);
    steps.forEach((s, i) => { if (s.status !== 'done') lines.push(`${STATUS_MARK[s.status]} ${i + 1}. ${s.text}`); });
  } else {
    steps.forEach((s, i) => lines.push(`${STATUS_MARK[s.status]} ${i + 1}. ${s.text}`));
  }
  return lines;
}

function renderList(title: string, items: string[], itemChars: number, keepLast?: number): string[] {
  if (items.length === 0) return [];
  const shown = keepLast !== undefined && items.length > keepLast ? items.slice(-keepLast) : items;
  const lines = [title];
  if (shown.length < items.length) lines.push(`(${items.length - shown.length} eski öğe gizlendi — brain rewrite ile sadeleştir)`);
  for (const it of shown) lines.push(`- ${itemChars > 0 ? oneLine(it, itemChars) : it}`);
  return lines;
}

/**
 * Brain'i bütçeye sığacak şekilde render eder. Sıkıştırma sırası:
 * tamamlanan adımlar tek satıra iner → bulgu/karar öğeleri kısalır → eski bulgu
 * ve kararlar gizlenir → en son çıkmaz sokaklar bile kısaltılır. Çıkmaz sokaklar
 * en son feda edilen kısımdır.
 */
export function renderBrain(b: BrainState, budgetTokens: number): string {
  const maxChars = tokensToChars(budgetTokens);
  const levels: Array<() => string[]> = [
    () => [...renderSteps(b.steps, false), ...crit(b), ...renderList('## Bulgular', b.findings, 0), ...renderList('## Kararlar', b.decisions, 0), ...deadEnds(b, 0)],
    () => [...renderSteps(b.steps, true), ...crit(b), ...renderList('## Bulgular', b.findings, 240), ...renderList('## Kararlar', b.decisions, 240), ...deadEnds(b, 300)],
    () => [...renderSteps(b.steps, true), ...crit(b), ...renderList('## Bulgular', b.findings, 160, 15), ...renderList('## Kararlar', b.decisions, 160, 10), ...deadEnds(b, 200)],
    () => [...renderSteps(b.steps, true), ...crit(b), ...renderList('## Bulgular', b.findings, 120, 6), ...renderList('## Kararlar', b.decisions, 120, 4), ...deadEnds(b, 140, 30)],
    () => [...renderSteps(b.steps, true), ...crit(b), ...renderList('## Bulgular', b.findings, 100, 3), ...deadEnds(b, 100, 12)],
  ];
  let out = '';
  for (let i = 0; i < levels.length; i++) {
    out = levels[i]().join('\n');
    if (out.length <= maxChars) {
      if (i >= 2) out += `\n(brain bütçesi dolu — gereksiz öğeleri \`brain rewrite\` ile birleştir)`;
      return out;
    }
  }
  return out.slice(0, maxChars);
}

function crit(b: BrainState): string[] {
  return b.criteria ? ['## Kabul kriteri', b.criteria] : [];
}

function deadEnds(b: BrainState, itemChars: number, keepLast?: number): string[] {
  return renderList('## Çıkmaz sokaklar — TEKRAR DENEME', b.deadEnds, itemChars, keepLast);
}

export function brainIsEmpty(b: BrainState): boolean {
  return b.steps.length === 0 && b.findings.length === 0 && b.decisions.length === 0 && b.deadEnds.length === 0 && !b.criteria;
}

export function brainTokens(b: BrainState): number {
  return estimateTextTokens(renderBrain(b, 1_000_000));
}
