/** Chinese line breaking for @react-pdf (Issue #33, Phase 2). Pure functions, no React.
 *
 *  @react-pdf only breaks lines at ASCII spaces and hyphenation points, and inserts "-" at a hyphenation break.
 *  Chinese has no spaces, so the hyphenation callback returns every CJK character as its own piece, separated by
 *  empty pieces (zero-width glue: a break with no hyphen). Closing punctuation sticks to the character before it and
 *  opening punctuation to the one after it, so no line starts with "，" or ends with "（". */

const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/;
const CLOSE = /[，。、；：！？）」』】》〉”’%‰·…— ,.;:!?)\]}]/;
const OPEN = /[（「『【《〈“‘([{]/;

export const hasCjk = (s: string) => CJK.test(s);

/** Break pieces for one "word" (react-pdf splits on ASCII spaces first). */
export function cjkPieces(word: string): string[] {
  if (!CJK.test(word)) return [word];
  const out: string[] = [];
  let buf = "";
  for (const c of word) {
    if (CLOSE.test(c) && !buf && out.length) {
      out[out.length - 1] += c;
    } else if (CJK.test(c) && !OPEN.test(c) && !CLOSE.test(c)) {
      const glued = buf && OPEN.test(buf[buf.length - 1]);
      if (buf && !glued) out.push(buf);
      out.push((glued ? buf : "") + c);
      buf = "";
    } else if (c === " ") {
      out.push(buf + c);
      buf = "";
    } else {
      buf += c;
    }
  }
  if (buf) out.push(buf);
  return out.flatMap((x) => [x, ""]);
}

/** In text with Chinese, spaces become no-break spaces so lines fill by character instead of breaking early at the
 *  one space in a sentence ("下颌角 118.5°"); the pieces above still allow a break right after each one. */
export const prepare = (s: string) => (CJK.test(s) ? s.replace(/ /g, " ") : s);
