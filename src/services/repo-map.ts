import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

export interface RepoMapOptions {
  maxDepth?: number;
  excludeDirs?: string[];
}

export function generateRepoMap(dir: string, options: RepoMapOptions = {}): string {
  const { maxDepth = 3, excludeDirs = ['node_modules', '.git', 'dist', '.deha'] } = options;

  if (!fs.existsSync(dir)) return '';

  const lines: string[] = [];
  
  function walk(currentDir: string, depth: number) {
    if (depth > maxDepth) return;

    const items = fs.readdirSync(currentDir, { withFileTypes: true });
    
    // Sort: directories first, then files
    items.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const item of items) {
      if (excludeDirs.includes(item.name)) continue;

      const indent = '  '.repeat(depth);
      if (item.isDirectory()) {
        lines.push(`${indent}📁 ${item.name}/`);
        walk(path.join(currentDir, item.name), depth + 1);
      } else {
        // For files, maybe just show significant ones or just names
        const ext = path.extname(item.name);
        if (['.ts', '.js', '.md', '.json', '.py'].includes(ext)) {
           lines.push(`${indent}📄 ${item.name}`);
        }
      }
    }
  }

  lines.push(`Project Root: ${path.basename(dir)}`);
  walk(dir, 0);

  return lines.join('\n');
}
