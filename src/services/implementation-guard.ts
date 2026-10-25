import * as path from 'path';
import { getActiveTask, updateActiveTask, ActiveTaskContext } from './session-memory';

type State = NonNullable<ActiveTaskContext['implementation']>;
const READ_TOOLS = new Set(['read_file', 'cat', 'list_dir', 'ls', 'search_in_files', 'grep', 'find_files', 'diff_files', 'web_search', 'crawl_url']);
const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'insert_lines', 'delete_lines']);
export const IMPLEMENTATION_GUARD_PROMPT = `
[IMPLEMENTATION EXECUTION POLICY]
This task requires implementation, not an unlimited architecture audit. The CLI enforces a bounded discovery phase; tool results and <task> report its state. After discovery is exhausted, broad/repeated inspections and brain view/set_plan are rejected. Implement the next minimal, testable part using evidence already gathered. Do not bypass a rejection through a shell alias or Python.
You may read an exact file/range needed for the next edit or a concrete runtime error: read_file with a specific path and a purpose explaining that edit/error. Two focused reads are allowed initially and after each successful code/data file edit. Use read_file to check whether a new file exists; a missing file may be created with write_file. No need to repeat directory discovery before creating it.
Write working notes if requested, but notes/plan updates alone do not count as implementation. Mark completed brain steps with update_step. Never create dummy files merely to satisfy the policy. If the next real edit is impossible, report ONE concrete missing file/function/error as a blocker. Do not claim the requested implementation or benchmark is complete based only on setup/tests of the old code.`;

export function discoveryBudget(request: string): number {
  // Only an explicit tool-call quantity near an implementation milestone is
  // treated as a contract; arbitrary numbers in the task are not budgets.
  const english = /(?:no more than|not[^\n.]{0,20}more than|at most|max(?:imum)?|do not spend more than)\s+(\d{1,3})\s+(?:additional\s+)?tool\s*[- ]?calls?[^\n.]{0,120}(?:before|implement|creat)/i.exec(request);
  const turkish = /(?:en fazla|en çok)\s+(\d{1,3})\s+(?:ek\s+)?(?:araç|tool)\s+(?:çağrısı|çağrısından|call)/i.exec(request);
  const explicit = english?.[1] || turkish?.[1];
  const configured = Number.parseInt(process.env.DEHA_DISCOVERY_CALLS || '', 10);
  const base = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 100) : 12;
  return explicit ? Math.min(base, Math.max(1, Number(explicit))) : base;
}

export function requiresImplementation(request: string): boolean {
  if (/\b(?:read.only|review.only|analysis.only|no code changes|do not (?:edit|modify|write) (?:any )?files)\b|(?:sadece|yalnızca)\s+(?:incele|oku|analiz)/i.test(request)) return false;
  return /\b(?:implement(?:ation)?|build|fix|refactor|create[^\n.]{0,70}(?:file|interface|benchmark))\b|kod\s+(?:yaz|oluştur)|(?:uygula|düzelt|geliştir)/i.test(request);
}

function inspection(name: string, input: Record<string, unknown>): boolean {
  if (READ_TOOLS.has(name)) return true;
  if (name === 'brain') return ['view', 'set_plan'].includes(String(input.action));
  if (name === 'fetch_url') return !input.method || String(input.method).toUpperCase() === 'GET';
  if (name === 'git') return /^\s*(?:git\s+)?(?:status|log|show|diff|ls-files|blame)\b/.test(String(input.command));
  if (['run_shell', 'run_terminal', 'start_job', 'run_python'].includes(name)) {
    const cmd = String(input.command || input.code || '');
    // These patterns identify ordinary scans, not every possible shell program.
    // Leave writes/builds/tests available; their success is not counted as a
    // file edit unless a file tool actually confirms an edit.
    if (/(?:\b(?:mkdir|touch|cp|mv|rm|tee|npm|pytest|make|pip|rsync)\b|write_file|write_text|write_bytes|writeFile|open\([^\n]*['"](?:w|a|x)['"]|(?<![<>&])>(?![>&]))/.test(cmd)) return false;
    return /\b(?:ls|cat|head|tail|sed|grep|find|wc|du|stat|tree|inspect|getsource|listdir|walk|read_text|readFile)\b/.test(cmd);
  }
  return false;
}

export class ImplementationGuard {
  private state: State;
  constructor(budget: number) {
    const prior = getActiveTask()?.implementation;
    this.state = prior?.version === 1 ? { ...prior, budget: Math.min(prior.budget, budget), changedFiles: [...prior.changedFiles] }
      : { version: 1, phase: 'discovery', budget, discoveryCalls: 0, focusedReads: 2, deniedCalls: 0, changedFiles: [] };
    if (this.state.discoveryCalls >= this.state.budget) this.state.phase = 'implementation';
    this.save();
  }
  private save(): void { updateActiveTask({ implementation: { ...this.state, changedFiles: [...this.state.changedFiles] } }); }
  get shouldStop(): boolean { return this.state.deniedCalls >= 6; }
  get stopMessage(): string {
    return `[DEHA: Keşif bütçesi (${this.state.budget} çağrı) doldu; model ${this.state.deniedCalls} kez uygulama aşamasına geçme kuralını izlemedi. ` +
      `Görev tamamlanmadı. Doğrulanan kod/veri değişikliği: ${this.state.changedFiles.length}. Görev ve mevcut kanıtlar korunuyor.]`;
  }
  before(name: string, input: Record<string, unknown>): string | undefined {
    if (!inspection(name, input)) return;
    if (this.state.phase === 'discovery' && this.state.discoveryCalls < this.state.budget) {
      this.state.discoveryCalls++;
      if (this.state.discoveryCalls >= this.state.budget) this.state.phase = 'implementation';
      this.save(); return;
    }
    const purpose = typeof input.purpose === 'string' ? input.purpose.trim() : '';
    const focusedFile = ['read_file', 'cat'].includes(name) && typeof input.path === 'string' && !!input.path.trim();
    if (focusedFile && purpose.length >= 12 && this.state.focusedReads > 0) {
      this.state.focusedReads--; this.save(); return;
    }
    this.state.deniedCalls++; this.save();
    return 'HATA: [DISCOVERY LIMIT] Inspection was NOT executed. Discovery budget is exhausted. ' +
      'Do the next real implementation step using existing evidence, or identify one concrete blocker. ' +
      `For an exact pre-edit/error read use read_file(path, purpose); focused reads remaining: ${this.state.focusedReads}. ` +
      'Working notes and plan rewrites do not restart discovery. Do not bypass through another inspection tool.';
  }
  after(name: string, input: Record<string, unknown>, result: string): string | undefined {
    if (/^(?:HATA:|ERROR:|FAILED\b)/i.test(result.trim()) || result.includes('[DISCOVERY LIMIT]')) return;
    if (WRITE_TOOLS.has(name) && typeof input.path === 'string') {
      // Markdown notes are useful memory, but cannot unlock another scan loop.
      const extension = path.extname(input.path).toLowerCase();
      if (!['.md', '.txt', '.log'].includes(extension)) {
        if (!this.state.changedFiles.includes(input.path)) this.state.changedFiles.push(input.path);
        this.state.changedFiles = this.state.changedFiles.slice(-80);
        this.state.phase = 'implementation'; this.state.focusedReads = 2; this.state.deniedCalls = 0; this.save();
      }
    }
    if (this.state.phase === 'implementation' && inspection(name, input)) {
      return `[IMPLEMENTATION PHASE] Discovery is finished (${this.state.discoveryCalls}/${this.state.budget}). ` +
        `Implement now or name one concrete blocker. ${this.state.focusedReads} focused read_file calls with a specific purpose remain; broad scans are disabled.`;
    }
  }
}

export function createImplementationGuard(userMessage: string): ImplementationGuard | undefined {
  if (process.env.DEHA_IMPLEMENTATION_GUARD === '0') return;
  const original = getActiveTask()?.originalUserRequest || userMessage;
  if (!requiresImplementation(original + '\n' + userMessage)) return;
  return new ImplementationGuard(discoveryBudget(userMessage + '\n' + original));
}
