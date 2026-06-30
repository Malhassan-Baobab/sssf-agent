/**
 * Context-aware, deterministic slot-filling state machine.
 * Every reply is interpreted AGAINST the pending question. Eligibility-critical
 * slots (gender, yes/no, numbers) are set only from canonical deterministic
 * parses — never from an ambiguous token. Slots are STICKY: once set they are
 * not overwritten except by an explicit first-person self-correction.
 */
import { normalizeText, parseYesNo, parseGender, extractNumber } from './normalize.js';

export type Gender = 'male' | 'female';
export type EmploymentStatus = 'still_working' | 'ended';

export interface Slot<T> {
  value: T | null;
  confirmed: boolean;
}
export interface SlotState {
  intent: Slot<string>;
  employment_status: Slot<EmploymentStatus>;
  gender: Slot<Gender>;
  age: Slot<number>;
  years_of_service: Slot<number>;
  purchased_years: Slot<number>;
  sector: Slot<'government' | 'private'>;
  children_under_18: Slot<boolean>;
}

export function emptyState(): SlotState {
  const s = <T>(): Slot<T> => ({ value: null, confirmed: false });
  return {
    intent: s(), employment_status: s(), gender: s(), age: s(),
    years_of_service: s(), purchased_years: s(), sector: s(), children_under_18: s(),
  };
}

export type QuestionKind = 'yesno' | 'gender' | 'number' | 'either_or';
export interface PendingQuestion {
  slot: keyof SlotState;
  kind: QuestionKind;
  /** for either_or: option key → regex that matches it */
  options?: Array<{ key: string; match: RegExp }>;
}

export interface Interpretation {
  action: 'set' | 'reask';
  slot?: keyof SlotState;
  value?: unknown;
  reason?: string;
}

/**
 * Interpret a raw reply against the pending question.
 * Returns set{slot,value} or reask{reason}. Never guesses gender from a pronoun.
 */
export function interpretReply(pending: PendingQuestion, raw: string): Interpretation {
  switch (pending.kind) {
    case 'yesno': {
      const v = parseYesNo(raw);
      if (v === null) return { action: 'reask', reason: 'not_a_yes_no' };
      return { action: 'set', slot: pending.slot, value: v === 'yes' };
    }
    case 'gender': {
      const g = parseGender(raw);
      // "هي"/"هو"/numbers/yes-no are NOT gender → re-ask, never default female.
      if (g === null) return { action: 'reask', reason: 'not_a_gender_word' };
      return { action: 'set', slot: pending.slot, value: g };
    }
    case 'number': {
      const n = extractNumber(raw);
      if (n === null) return { action: 'reask', reason: 'not_a_number' };
      return { action: 'set', slot: pending.slot, value: n };
    }
    case 'either_or': {
      const s = normalizeText(raw).toLowerCase();
      for (const opt of pending.options ?? []) {
        if (opt.match.test(s)) return { action: 'set', slot: pending.slot, value: opt.key };
      }
      // A bare yes/no is not a valid answer to an either/or → re-ask to choose.
      return { action: 'reask', reason: 'must_choose_one_option' };
    }
  }
}

/**
 * Apply an explicit first-person self-correction of gender, regardless of the
 * pending question (e.g. user volunteers "أنا ريال"). Only an explicit gender
 * word changes a sticky gender slot.
 */
export function applyGenderSelfCorrection(state: SlotState, raw: string): boolean {
  const g = parseGender(raw);
  if (!g) return false;
  const norm = normalizeText(raw).toLowerCase();
  const toks = norm.split(/[\s,،]+/);
  // first-person markers (token-based; JS \b does not work for Arabic)
  const firstPerson = ['انا', 'اني', 'i', 'im', "i'm", 'me'].some((t) => toks.includes(t)) || /i am/.test(norm);
  if (firstPerson) {
    state.gender = { value: g, confirmed: true }; // explicit correction overrides sticky
    return true;
  }
  if (state.gender.value === null) {
    state.gender = { value: g, confirmed: true }; // first-time set (e.g. answering the gender question)
    return true;
  }
  return false;
}

/** Set a slot only if empty, or always for an explicit correction. Sticky by default. */
export function setSlot<K extends keyof SlotState>(
  state: SlotState,
  slot: K,
  value: NonNullable<SlotState[K]['value']>,
  opts: { confirmed?: boolean; correction?: boolean } = {}
): void {
  const cur = state[slot] as Slot<unknown>;
  if (cur.value !== null && cur.confirmed && !opts.correction) return; // sticky
  (state[slot] as Slot<unknown>) = { value, confirmed: opts.confirmed ?? cur.confirmed };
}

/** Standard pending questions for the calc/eligibility flow. */
export const QUESTIONS = {
  employment_status: {
    slot: 'employment_status' as const,
    kind: 'either_or' as const,
    options: [
      { key: 'still_working', match: /راس العمل|على راس|اعمل|موظف|مازال|مازلت|لسه|لازال|still|working|employed/ },
      { key: 'ended', match: /انتهت|تقاعد|استقل|استقال|خلصت|انهيت|ended|retired|resigned|left/ },
    ],
  },
  gender: { slot: 'gender' as const, kind: 'gender' as const },
  age: { slot: 'age' as const, kind: 'number' as const },
  years_of_service: { slot: 'years_of_service' as const, kind: 'number' as const },
  children_under_18: { slot: 'children_under_18' as const, kind: 'yesno' as const },
} satisfies Record<string, PendingQuestion>;
