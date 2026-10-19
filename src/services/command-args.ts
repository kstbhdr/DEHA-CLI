/** Tokenize an argument list without evaluating shell syntax. */
export function parseCommandArgs(command: string): string[] {
  const args: string[] = []; let token = ''; let quote = ''; let started = false;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (char === '\\' && quote !== "'" && i + 1 < command.length &&
        (command[i + 1] === '"' || (!quote && /\s/.test(command[i + 1])))) {
      token += command[++i]; started = true;
    } else if (quote) {
      if (char === quote) quote = ''; else token += char;
    } else if (char === '"' || char === "'") { quote = char; started = true; }
    else if (/\s/.test(char)) {
      if (started) { args.push(token); token = ''; started = false; }
    } else { token += char; started = true; }
  }
  if (quote) throw new Error('Komutta kapanmamış tırnak var');
  if (started) args.push(token);
  return args;
}
