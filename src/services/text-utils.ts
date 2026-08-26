/**
 * `String.prototype.slice` operates on UTF-16 code units, so cutting at an
 * arbitrary offset can split an astral-plane character (emoji, rare CJK) in
 * half and leave a lone surrogate at the cut edge. `JSON.stringify` happily
 * encodes that as e.g. `\uD83D` with no pairing low surrogate — most
 * server-side JSON parsers reject that outright ("lone leading surrogate in
 * hex escape"), which breaks the *entire* request, not just the truncated
 * message. Every place that truncates tool output / conversation history
 * before it becomes API message content must use this instead of `.slice`.
 */
export function safeSlice(text: string, start: number, end?: number): string {
  let sliced = end === undefined ? text.slice(start) : text.slice(start, end);

  if (sliced.length > 0 && isLowSurrogate(sliced.charCodeAt(0))) {
    sliced = sliced.slice(1);
  }
  if (sliced.length > 0 && isHighSurrogate(sliced.charCodeAt(sliced.length - 1))) {
    sliced = sliced.slice(0, -1);
  }

  return sliced;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Hosted providers (Anthropic/OpenAI/OpenRouter) generate tool-call arguments
 * through constrained/grammar-based decoding, so the JSON they emit is always
 * spec-valid. Local models (LM Studio, llama.cpp server, ...) usually don't
 * have that guarantee — the single most common failure is a multi-line shell
 * or Python command written with *literal* newlines inside the JSON string
 * value instead of an escaped `\n`. Per the JSON spec, a raw control
 * character (U+0000–U+001F) inside a string is invalid, so `JSON.parse`
 * rejects the whole tool call outright — the call then either vanishes
 * silently (inline-text fallback parsers) or gets counted as "malformed"
 * and retried (structured tool_calls path), burning rounds without ever
 * running the command the model actually asked for.
 *
 * This walks the text tracking whether it's inside a `"..."` string literal
 * (respecting `\"` and `\\` escapes) and escapes raw control characters only
 * there, leaving already-valid JSON untouched.
 */
export function repairJsonControlChars(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      const code = text.charCodeAt(i);
      if (code < 0x20) {
        out += CONTROL_CHAR_ESCAPES[ch] ?? `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }
      out += ch;
      continue;
    }

    if (ch === '"') inString = true;
    out += ch;
  }

  return out;
}

const CONTROL_CHAR_ESCAPES: Record<string, string> = {
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\b': '\\b',
  '\f': '\\f',
};

/**
 * Local models writing an inline pseudo tool-call (`[Tool Call: **x**({...})]`
 * etc.) don't always emit strict JSON even when the call itself is complete
 * (not truncated) — the three next most common deviations, roughly in order
 * of how often they show up:
 *   - trailing commas: `{"a": 1,}` (fine in JS/Python, invalid JSON)
 *   - unquoted object keys: `{a: 1}` (JS-object style)
 *   - single-quoted strings: `{'a': 'b'}` (Python-dict style)
 * These are applied as a widening chain of best-effort repairs, each tried
 * only after the stricter one fails, so a request that's already valid JSON
 * (the hosted-provider common case) never pays for any of this.
 */
function stripTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, '$1');
}

function quoteUnquotedKeys(text: string): string {
  return text.replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3');
}

/**
 * Converts Python-dict-style single-quoted strings to JSON double-quoted
 * strings. Walks the text tracking whether it's inside a single- or
 * double-quoted string (respecting backslash escapes in both), so it doesn't
 * touch already-valid JSON string content and correctly escapes any literal
 * `"` that ends up inside a converted string.
 */
function convertSingleQuotesToJson(text: string): string {
  let out = '';
  let state: 'none' | 'double' | 'single' = 'none';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (state === 'none') {
      if (ch === '"') { state = 'double'; out += ch; continue; }
      if (ch === "'") { state = 'single'; out += '"'; continue; }
      out += ch;
      continue;
    }

    if (state === 'double') {
      if (ch === '\\') { out += ch + (text[i + 1] ?? ''); i++; continue; }
      if (ch === '"') { state = 'none'; out += ch; continue; }
      out += ch;
      continue;
    }

    // state === 'single'
    if (ch === '\\') {
      const next = text[i + 1];
      out += next === "'" ? "'" : ch + (next ?? '');
      i++;
      continue;
    }
    if (ch === "'") { state = 'none'; out += '"'; continue; }
    if (ch === '"') { out += '\\"'; continue; }
    out += ch;
  }

  return out;
}

/**
 * `JSON.parse`, falling back through a chain of increasingly-lenient repairs
 * for model-emitted JSON: raw control chars in strings, trailing commas,
 * unquoted keys, and single-quoted (Python-dict style) strings. Each repair
 * is tried only after the stricter attempt fails, so valid JSON is returned
 * unmodified. Throws the original strict-parse error if nothing works.
 */
export function safeJsonParse(text: string): unknown {
  const repaired = repairJsonControlChars(text);
  const noTrailingCommas = stripTrailingCommas(repaired);
  const attempts = [
    text,
    repaired,
    noTrailingCommas,
    quoteUnquotedKeys(noTrailingCommas),
    quoteUnquotedKeys(stripTrailingCommas(convertSingleQuotesToJson(repaired))),
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Last-mile safety net: scans a whole string for any lone (unpaired)
 * surrogate — regardless of how it got there (truncation we missed, a tool's
 * own output, an SSE chunk boundary splitting a multi-byte char) — and
 * replaces it with U+FFFD so `JSON.stringify` can never again produce a body
 * an upstream JSON parser rejects with "lone leading surrogate in hex escape".
 * Applied where `Message[]` is converted into the actual wire format, right
 * before it becomes a request body.
 */
export function sanitizeLoneSurrogates(text: string): string {
  if (!text || !/[\ud800-\udfff]/.test(text)) return text;

  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (isHighSurrogate(code)) {
      const next = text.charCodeAt(i + 1);
      if (isLowSurrogate(next)) {
        out += text[i] + text[i + 1];
        i++;
      } else {
        out += '�';
      }
    } else if (isLowSurrogate(code)) {
      out += '�';
    } else {
      out += text[i];
    }
  }
  return out;
}
