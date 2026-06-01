import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCommand } from './terminal';

const PYTHON_BIN = process.platform === 'win32' ? 'python' : 'python3';

// ─── Python versiyonunu bul ─────────────────────────────────────────────────

export async function detectPython(): Promise<string | null> {
  for (const bin of ['python3', 'python', 'py']) {
    try {
      const r = await runCommand(`${bin} --version`, { timeout: 5000 });
      if (r.exitCode === 0) return bin;
    } catch { /* dene */ }
  }
  return null;
}

// ─── Kod snippet çalıştır (geçici dosyaya yazar) ───────────────────────────

export async function runPythonCode(
  code: string,
  opts: {
    venvPath?: string;
    timeout?: number;
    installPackages?: string[];
    cwd?: string;
  } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const python = opts.venvPath
    ? path.join(opts.venvPath, process.platform === 'win32' ? 'Scripts/python' : 'bin/python')
    : PYTHON_BIN;

  // Gerekli paketleri kur
  if (opts.installPackages?.length) {
    await runCommand(`${python} -m pip install ${opts.installPackages.join(' ')} -q`, {
      timeout: 60_000,
    });
  }

  // Geçici dosyaya yaz
  const tmpFile = path.join(os.tmpdir(), `deha_py_${Date.now()}.py`);
  fs.writeFileSync(tmpFile, code, 'utf-8');

  try {
    return await runCommand(`${python} "${tmpFile}"`, {
      timeout: (opts.timeout ?? 30) * 1000,
      cwd: opts.cwd,
    });
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

// ─── Virtual environment oluştur ────────────────────────────────────────────

export async function createVenv(targetDir: string): Promise<string> {
  const venvPath = path.join(targetDir, '.venv');
  if (!fs.existsSync(venvPath)) {
    const r = await runCommand(`${PYTHON_BIN} -m venv "${venvPath}"`, { timeout: 30_000 });
    if (r.exitCode !== 0) throw new Error(`venv oluşturulamadı: ${r.stderr}`);
  }
  return venvPath;
}

// ─── requirements.txt varsa kur ─────────────────────────────────────────────

export async function installRequirements(venvPath: string, projectDir: string): Promise<string> {
  const reqFile = path.join(projectDir, 'requirements.txt');
  if (!fs.existsSync(reqFile)) return 'requirements.txt bulunamadı';

  const pip = path.join(
    venvPath,
    process.platform === 'win32' ? 'Scripts/pip' : 'bin/pip',
  );
  const r = await runCommand(`"${pip}" install -r "${reqFile}" -q`, { timeout: 120_000 });
  return r.exitCode === 0 ? 'Paketler kuruldu' : `Hata: ${r.stderr}`;
}

// ─── pytest çalıştır ────────────────────────────────────────────────────────

export async function runPytest(
  projectDir: string,
  opts: { venvPath?: string; pattern?: string } = {},
): Promise<string> {
  const pytest = opts.venvPath
    ? path.join(opts.venvPath, process.platform === 'win32' ? 'Scripts/pytest' : 'bin/pytest')
    : 'pytest';

  const pattern = opts.pattern ?? '';
  const r = await runCommand(`"${pytest}" ${pattern} -v --tb=short`, {
    cwd: projectDir,
    timeout: 120_000,
    stream: true,
  });

  return [
    r.stdout.trim(),
    r.stderr.trim() ? `STDERR:\n${r.stderr.trim()}` : '',
    `\nExit: ${r.exitCode}`,
  ].filter(Boolean).join('\n');
}

// ─── Tool versiyonu ─────────────────────────────────────────────────────────

export async function toolRunPython(input: {
  code?: string;
  file?: string;
  packages?: string[];
  cwd?: string;
  timeout?: number;
  use_venv?: boolean;
}): Promise<string> {
  let code = input.code ?? '';
  if (input.file) {
    if (!fs.existsSync(input.file)) return `Dosya bulunamadı: ${input.file}`;
    code = fs.readFileSync(input.file, 'utf-8');
  }
  if (!code) return 'code veya file gerekli';

  let venvPath: string | undefined;
  if (input.use_venv) {
    const cwd = input.cwd ?? process.cwd();
    venvPath = await createVenv(cwd);
  }

  const r = await runPythonCode(code, {
    venvPath,
    timeout: input.timeout ?? 30,
    installPackages: input.packages,
    cwd: input.cwd,
  });

  const out: string[] = [];
  if (r.stdout) out.push(`STDOUT:\n${r.stdout.trim()}`);
  if (r.stderr) out.push(`STDERR:\n${r.stderr.trim()}`);
  out.push(`EXIT: ${r.exitCode}`);
  return out.join('\n\n');
}
