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
