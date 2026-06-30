/**
 * Deterministic-first intent classification. Keyword/lexicon match; returns
 * null when ambiguous so the orchestrator can fall back to the model (which
 * must then CONFIRM with the user before acting).
 */
import { normalizeText, parseResignIntent } from './normalize.js';

export type Intent =
  | 'resign'
  | 'calc_pension'
  | 'calc_eos'
  | 'policy_question'
  | 'certificate_request'
  | 'greeting'
  | 'abuse'
  | 'out_of_scope'
  | 'answer_to_pending_question';

export interface IntentResult {
  intent: Intent | null;
  confident: boolean;
}

const ABUSE = /(حمار|كلب|غبي|لعن|تبا|تباً|خرا|قذر|حقير|وسخ|كس|زبر|نذل|سافل|fuck|shit|stupid|idiot|damn|bastard|asshole)/i;
const CERT = /(شهاده|شهادة|certificate|افاده|إفادة|راتب.*شهاده|salary letter)/i;
// Arabic greeting prefix (no \b — JS word boundaries don't apply to Arabic) OR latin with boundary.
const GREET_AR = /^(مرحبا|اهلا|السلام|هلا|هاي|هالو|صباح|مساء|سلام|اهلين|هلو)/;
const GREET_EN = /^(hi|hello|hey|salam|good morning|good evening)\b/i;
const EOS = /(مكافاه|مكافأة|نهايه الخدمه|نهاية الخدمة|gratuity|end.?of.?service|end of service)/i;
const PENSION_CALC = /(احسب|حساب|كم).*(معاش|راتب تقاعد)|كم معاشي|معاشي التقاعدي|pension.*(calc|estimate|how much)|how much.*pension/i;
const POLICY_Q = /(متى|كيف|هل|ما هي|ماهي|كم|شروط|يحق|اشتراك|مستحق|من هم|why|when|how|what|who|condition|eligib)/i;

/** Classify a fresh user message. */
export function classifyIntent(raw: string): IntentResult {
  const s = normalizeText(raw);
  if (!s) return { intent: null, confident: false };
  if (ABUSE.test(s)) return { intent: 'abuse', confident: true };
  if (parseResignIntent(raw)) return { intent: 'resign', confident: true };
  if (CERT.test(s)) return { intent: 'certificate_request', confident: true };
  if (EOS.test(s)) return { intent: 'calc_eos', confident: true };
  if (PENSION_CALC.test(s)) return { intent: 'calc_pension', confident: true };
  if (GREET_AR.test(s) || GREET_EN.test(s)) return { intent: 'greeting', confident: true };
  if (POLICY_Q.test(s)) return { intent: 'policy_question', confident: false }; // likely, but let RAG/model confirm
  return { intent: null, confident: false };
}
