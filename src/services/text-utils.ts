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

/** `JSON.parse`, falling back to `repairJsonControlChars` for model-emitted JSON with raw control chars in strings. */
export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(repairJsonControlChars(text));
  }
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
