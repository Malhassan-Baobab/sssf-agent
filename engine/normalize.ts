/**
 * Deterministic Emirati/Gulf-first text normalization and canonical parsing.
 * This is the ONLY place dialect tokens become canonical values for
 * eligibility-critical slots (yes/no, gender, intent, numbers). The model must
 * never set these from free text. Extensible: add tokens to the lexicons below.
 *
 * HARD RULE: "هي"/"هو" as bare tokens are AFFIRMATIONS only — never a gender
 * value for the user. User gender comes only from an explicit first-person
 * gender word or the answer to the gender question.
 */

const AR_INDIC = '٠١٢٣٤٥٦٧٨٩';
const AR_INDIC_EXT = '۰۱۲۳۴۵۶۷۸۹'; // extended (Persian) forms, just in case

/** Convert Arabic-Indic digits to ASCII, strip tatweel/diacritics, collapse space. */
export function normalizeText(raw: string): string {
  let s = (raw ?? '').toString();
  // Arabic-Indic → ASCII digits
  s = s.replace(/[٠-٩]/g, (d) => String(AR_INDIC.indexOf(d)));
  s = s.replace(/[۰-۹]/g, (d) => String(AR_INDIC_EXT.indexOf(d)));
  // strip tatweel and Arabic diacritics (harakat)
  s = s.replace(/ـ/g, '').replace(/[ً-ْٰ]/g, '');
  // normalize alef variants and common letter forms for matching
  s = s.replace(/[آأإ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  return s.replace(/\s+/g, ' ').trim();
}

/** Lowercased, normalized form for token matching. */
function key(raw: string): string {
  return normalizeText(raw).toLowerCase();
}

// --- Lexicons (normalized: alef→ا, ى→ي, ة→ه, no diacritics) ---
const YES = new Set(
  ['نعم', 'اجل', 'هي', 'هيه', 'اي', 'أي', 'ايوه', 'ايوا', 'اه', 'بلي', 'صح', 'زين', 'تمام', 'اكيد', 'ايون', 'ok', 'okay', 'yes', 'yep', 'yeah', 'y', 'sure'].map(key)
);
const NO = new Set(['لا', 'لأ', 'كلا', 'مب', 'مو', 'ماني', 'ما', 'ابد', 'no', 'nope', 'n'].map(key));
// Gender words — deliberately EXCLUDE هي/هو (those are affirmations/pronouns, never user gender).
const MALE = new Set(['ذكر', 'رجل', 'ريال', 'رجال', 'راجل', 'راعي', 'ولد', 'صبي', 'ضكر', 'male', 'man', 'm', 'boy'].map(key));
const FEMALE = new Set(['انثي', 'انثى', 'امراه', 'امرأه', 'حرمه', 'مره', 'حريم', 'بنت', 'female', 'woman', 'f', 'girl'].map(key));

/** yes/no from dialect; null if not a yes/no token. */
export function parseYesNo(raw: string): 'yes' | 'no' | null {
  const k = key(raw);
  if (!k) return null;
  // exact token, or a short phrase whose tokens are all yes / contain a yes head
  const toks = k.split(' ');
  if (toks.some((t) => NO.has(t)) && !toks.some((t) => YES.has(t))) return 'no';
  if (toks.some((t) => YES.has(t))) return 'yes';
  if (YES.has(k)) return 'yes';
  if (NO.has(k)) return 'no';
  return null;
}

/**
 * Gender from an explicit gender word. Returns null for anything else —
 * critically for "هي"/"هو", numbers, yes/no, or gibberish.
 * Recognizes first-person self-correction ("أنا ذكر/ريال/أنثى/حرمة").
 */
export function parseGender(raw: string): 'male' | 'female' | null {
  const k = key(raw);
  if (!k) return null;
  const toks = k.split(/[\s,،]+/);
  for (const t of toks) {
    if (MALE.has(t)) return 'male';
    if (FEMALE.has(t)) return 'female';
  }
  return null;
}

const RESIGN_VERB = /(ابا|أبا|ابغي|ابغى|ابي|بغيت|ودي|اريد|انوي|ناوي)/;
const RESIGN_OBJ = /(استقيل|استقاله|استقالة|اعتزل|اترك العمل|اطلع من الدوام)/;

/** Detect resignation intent from a Gulf phrase like "ابا أستقيل". */
export function parseResignIntent(raw: string): boolean {
  const k = key(raw);
  return (RESIGN_VERB.test(k) && RESIGN_OBJ.test(k)) || /\bاستقاله\b|\bاستقيل\b/.test(k);
}

/** First integer found (after Arabic-Indic conversion); null if none. */
export function extractNumber(raw: string): number | null {
  const m = normalizeText(raw).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
