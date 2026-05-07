import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { getConfig } from '../config';
import { logger } from "../services/logger";
import { sendMessage, Message } from '../services/ai-service';

// ─── deha diff ───────────────────────────────────────────────────────────────

export function showDiff(): void {
  try {
    // Git repo kontrolü
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore', cwd: '.' });
  } catch {
    logger.write(chalk.yellow('Bu bir git reposu değil. LINTEN: Mevcut değişiklikler gösterilemiyor.'));
    return;
  }

  // Staged + unstaged diff
  let diff = '';
  try {
    diff = execSync('git diff HEAD', { encoding: 'utf-8', cwd: '.' }).trim();
  } catch {
    // İlk commit'ten önce HEAD olmayabilir
    try {
      diff = execSync('git diff', { encoding: 'utf-8', cwd: '.' }).trim();
    } catch { /* */ }
  }

  if (!diff) {
    logger.write(chalk.dim('Hiçbir değişiklik yok.'));
    return;
  }

  // Syntax highlighting + satır numarası
  const lines = diff.split('\n');
  const maxLineNum = String(lines.length).length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = String(i + 1).padStart(maxLineNum, ' ');
    if (line.startsWith('+')) {
      logger.write(chalk.green(`${lineNum} ${line}`));
    } else if (line.startsWith('-')) {
      logger.write(chalk.red(`${lineNum} ${line}`));
    } else if (line.startsWith('@@')) {
      logger.write(chalk.cyan(`${lineNum} ${line}`));
    } else if (line.startsWith('diff --git') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) {
      logger.write(chalk.bold.white(`${lineNum} ${line}`));
    } else {
      logger.write(chalk.dim(`${lineNum} ${line}`));
    }
  }

  // Özet
  const added = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
  const removed = diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---')).length;
  const files = diff.match(/^diff --git a\/(.+?) b\/(.+?)$/gm)?.length ?? 0;
  logger.write(chalk.dim(`\n${files} dosya, +${added} / -${removed} satır`));
}

// ─── deha review ─────────────────────────────────────────────────────────────

export async function reviewDiff(): Promise<void> {
  let diff = '';
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore', cwd: '.' });
    diff = execSync('git diff HEAD', { encoding: 'utf-8', cwd: '.' }).trim();
    if (!diff) {
      try {
        diff = execSync('git diff --cached', { encoding: 'utf-8', cwd: '.' }).trim();
      } catch { /* */ }
    }
  } catch {
    logger.write(chalk.yellow('Git reposu bulunamadı.'));
    return;
  }

  if (!diff) {
    logger.write(chalk.dim('Review edilecek değişiklik yok.'));
    return;
  }

  logger.write(chalk.cyan('🔍 Diff AI ile review ediliyor...\n'));

  const config = getConfig();
  const messages: Message[] = [
    {
      role: 'user',
      content: `Aşağıdaki kod diff pull request review'i yap. Şu başlıkları kullan:
- **Özet**: Değişiklik ne işe yarıyor?
- **Code Quality**: Kod kalitesi, naming, consistency
- **Potential Bugs**: Olası hatalar veya edge case'ler
- **Improvements**: İyileştirme önerileri
- **Score**: 1-10 arası puan

Her madde için dosya adı ve satır numarası belirt.

\`\`\`diff
${diff.slice(0, 15000)}
\`\`\``,
    },
  ];

  try {
    const review = await sendMessage(messages, config);
    logger.write(review);
  } catch (err: unknown) {
    logger.error(chalk.red('Review hatası: '), err instanceof Error ? err.message : String(err));
  }
}
