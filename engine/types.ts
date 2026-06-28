/**
 * Deterministic calc engine — typed I/O.
 * All amounts come from these functions, never from model inference.
 * Every result carries the law article(s) it implements.
 */

export type Gender = 'male' | 'female';

/**
 * End-of-service / pension case per Art. 19. For the pilot we model the cases
 * the calculator covers; the orchestrator collects and confirms these inputs.
 */
export type CaseType =
  | 'resignation' // استقالة (Art. 19 ج/د/ه)
  | 'retirement_age' // بلوغ سن الإحالة (Art. 19 ب)
  | 'death' // وفاة (Art. 19 أ / 22)
  | 'total_disability' // عجز كلي (Art. 19 أ / 22)
  | 'unfit' // عدم لياقة صحية (Art. 19 أ)
  | 'dismissal' // فصل/عزل تأديبي (Art. 19 و)
  | 'other'; // غير ذلك (Art. 19 ي)

export interface CalcInput {
  caseType: CaseType;
  gender: Gender;
  age: number; // years
  yearsOfService: number; // actual contribution years (may include added/purchased)
  contributionSalary: number; // راتب حساب المعاش (monthly, AED)
  hasChildrenUnder18?: boolean; // relevant for female resignation (Art. 19 ه)
  isWorkInjury?: boolean; // Art. 22 — assume 35 years
}

export interface PurchaseInput {
  contributionSalary: number;
  years: number; // years to purchase (Art. 20) or add (Art. 6/7)
  gender: Gender;
  yearsOfService?: number; // for purchase eligibility check (>= 20)
  kind: 'purchase' | 'addition';
}

export type Outcome = 'pension' | 'pension_reduced' | 'pension_and_reward' | 'eos' | 'not_eligible';

export interface Citation {
  authority: string; // 'Law 5/2018'
  article: string; // 'Art. 23'
  note?: string;
}

export interface CalcResult {
  outcome: Outcome;
  /** Monthly pension in AED (0 when EoS/not eligible). */
  monthlyPension: number;
  /** Lump-sum end-of-service gratuity in AED (0 when pension). */
  endOfService: number;
  /** Lump-sum reward for service beyond 35 years (Art. 23). */
  reward: number;
  /** True when the pension was raised to the Art. 26 minimum. */
  raisedToMinimum: boolean;
  /** Human-facing explanation (bilingual-ready key facts). */
  explanation: string;
  citations: Citation[];
  /** Echo of the inputs used, for read-back confirmation. */
  inputs: CalcInput;
}

export interface PurchaseResult {
  eligible: boolean;
  cost: number; // AED
  explanation: string;
  citations: Citation[];
  inputs: PurchaseInput;
}

/** Versioned config loaded from Supabase calc_* tables (or the in-code default). */
export interface CalcConfig {
  version: string;
  minPension: number; // Art. 26
  minBeneficiaryShare: number; // Art. 26
  pensionBasePct: number; // Art. 23 — 60 at 15 yrs
  pensionStepPct: number; // Art. 23 — +2/yr
  pensionCapPct: number; // Art. 23 — 100
  pensionBaseYears: number; // 15
  pensionCapYears: number; // 35
  eosTier1Months: number; // Art. 43 — 1.5 (yrs 1-5)
  eosTier2Months: number; // 2 (yrs 6-10)
  eosTier3Months: number; // 3 (yrs >10)
  rewardMonthsPerYear: number; // Art. 23 — 1 (yrs > 35)
  purchaseRate: number; // Art. 20 — 0.20
  purchaseMonths: number; // Art. 20 — 12
  minYearsForPurchase: number; // Art. 20 — 20
  maxPurchaseMale: number; // 5
  maxPurchaseFemale: number; // 10
  retirementAgeMale: number; // Art. 1 — 60
  retirementAgeFemale: number; // Art. 1 — 55
  workInjuryAssumedYears: number; // Art. 22 — 35
  /** Early-retirement reduction %: gender -> sorted [ageMin, pct] tiers. */
  agePct: { male: Array<[number, number]>; female: Array<[number, number]> };
}
