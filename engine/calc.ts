/**
 * Deterministic SSSF calculations. Pure functions over (input, config).
 * Decoded from the Final Version calculator and cross-checked to Law 5/2018.
 * No I/O, no randomness — same inputs always yield the same result.
 */
import type {
  CalcConfig,
  CalcInput,
  CalcResult,
  Citation,
  PurchaseInput,
  PurchaseResult,
} from './types.js';
import { DEFAULT_CONFIG } from './config.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

const cite = (article: string, note?: string): Citation => ({
  authority: 'Law 5/2018',
  article,
  note,
});

/** Art. 23 pension % from years of service: 60% at 15 yrs, +2%/yr, cap 100%. */
export function pensionPercent(years: number, c: CalcConfig = DEFAULT_CONFIG): number {
  if (years >= c.pensionCapYears) return c.pensionCapPct;
  if (years < c.pensionBaseYears) return 0;
  return Math.min(
    c.pensionCapPct,
    c.pensionBasePct + (years - c.pensionBaseYears) * c.pensionStepPct
  );
}

/** Art. 26 floor: raise a positive pension to the minimum. */
export function applyFloor(
  pension: number,
  c: CalcConfig = DEFAULT_CONFIG
): { amount: number; raised: boolean } {
  if (pension > 0 && pension < c.minPension) return { amount: c.minPension, raised: true };
  return { amount: pension, raised: false };
}

/** Art. 43 end-of-service gratuity: 1.5 mo/yr (1-5), 2 mo/yr (6-10), 3 mo/yr (>10). */
export function endOfServiceGratuity(
  years: number,
  monthlySalary: number,
  c: CalcConfig = DEFAULT_CONFIG
): number {
  if (years < 1) return 0;
  const t1 = Math.min(years, 5) * c.eosTier1Months;
  const t2 = Math.min(Math.max(years - 5, 0), 5) * c.eosTier2Months;
  const t3 = Math.max(years - 10, 0) * c.eosTier3Months;
  return round2((t1 + t2 + t3) * monthlySalary);
}

/** Art. 23 reward for service beyond 35 years: 1 month salary per extra year. */
export function reward(years: number, monthlySalary: number, c: CalcConfig = DEFAULT_CONFIG): number {
  if (years <= c.pensionCapYears) return 0;
  return round2((years - c.pensionCapYears) * c.rewardMonthsPerYear * monthlySalary);
}

/** Early-retirement reduction % (Art. 19 ج/د) from the age tier table. */
export function earlyReductionPercent(
  gender: 'male' | 'female',
  age: number,
  c: CalcConfig = DEFAULT_CONFIG
): number {
  const tiers = c.agePct[gender];
  let pct = 0;
  for (const [ageMin, p] of tiers) if (age >= ageMin) pct = p;
  return pct; // 0 when below the lowest tier
}

interface Eligibility {
  outcome: 'pension' | 'pension_reduced' | 'eos' | 'not_eligible';
  citations: Citation[];
  reason: string;
}

/**
 * Art. 19 eligibility gate. Decides pension vs reduced-pension vs gratuity.
 * This is part of the deterministic layer — never a model judgement.
 */
export function determineEligibility(input: CalcInput, c: CalcConfig = DEFAULT_CONFIG): Eligibility {
  const { caseType, gender, age, yearsOfService: y, hasChildrenUnder18 } = input;

  if (y < 1 && caseType !== 'death' && caseType !== 'total_disability') {
    return { outcome: 'not_eligible', citations: [cite('Art. 41')], reason: 'Service under 1 year.' };
  }

  // Art. 19(أ) / Art. 22 — death, total disability, unfitness: pension at any service length.
  if (caseType === 'death' || caseType === 'total_disability' || caseType === 'unfit') {
    return {
      outcome: 'pension',
      citations: [cite('Art. 19', 'clause أ'), cite('Art. 22')],
      reason: 'Death / total disability / unfitness — pension regardless of years.',
    };
  }

  const retirementAge = gender === 'male' ? c.retirementAgeMale : c.retirementAgeFemale;

  // Art. 19(ب) — reaching retirement age with >= 15 years.
  if (caseType === 'retirement_age' || age >= retirementAge) {
    if (y >= c.pensionBaseYears) {
      return {
        outcome: 'pension',
        citations: [cite('Art. 19', 'clause ب')],
        reason: `Reached retirement age (${retirementAge}) with >= 15 years.`,
      };
    }
    return { outcome: 'eos', citations: [cite('Art. 41')], reason: 'Retirement age but < 15 years.' };
  }

  // Art. 19(ه) — female, has children under 18, >= 15 years, age >= 45.
  if (gender === 'female' && hasChildrenUnder18 && y >= c.pensionBaseYears && age >= 45) {
    return {
      outcome: 'pension',
      citations: [cite('Art. 19', 'clause ه')],
      reason: 'Female with children under 18, >= 15 years, age >= 45.',
    };
  }

  // Art. 19(ج/د) — resignation (and other) with >= 20 years.
  if (y >= 20) {
    const fullAge = gender === 'male' ? 55 : 50;
    if (age >= fullAge) {
      return {
        outcome: 'pension',
        citations: [cite('Art. 19', gender === 'male' ? 'clause ج' : 'clause د')],
        reason: `>= 20 years and age >= ${fullAge} — full pension.`,
      };
    }
    // Below the qualifying age → reduced % until age is reached (Board-set %).
    return {
      outcome: 'pension_reduced',
      citations: [cite('Art. 19', gender === 'male' ? 'clause ج' : 'clause د')],
      reason: `>= 20 years but age < ${fullAge} — reduced pension % until qualifying age.`,
    };
  }

  // Otherwise no pension is due → end-of-service gratuity (Art. 41).
  return { outcome: 'eos', citations: [cite('Art. 41')], reason: 'No pension case met — gratuity.' };
}

/** Full calculation: eligibility → pension/EoS/reward with citations. */
export function calculate(input: CalcInput, c: CalcConfig = DEFAULT_CONFIG): CalcResult {
  const salary = input.contributionSalary;
  // Art. 22 — work-injury death/disability is computed as 35 years of service.
  const years = input.isWorkInjury ? Math.max(input.yearsOfService, c.workInjuryAssumedYears) : input.yearsOfService;

  const elig = determineEligibility(input, c);
  const citations = [...elig.citations];
  let monthlyPension = 0;
  let endOfService = 0;
  let rewardAmt = 0;
  let raisedToMinimum = false;
  let outcome: CalcResult['outcome'] = elig.outcome;
  let explanation = elig.reason;

  if (elig.outcome === 'pension' || elig.outcome === 'pension_reduced') {
    const pct = pensionPercent(years, c);
    const floored = applyFloor(round2(salary * (pct / 100)), c);
    monthlyPension = floored.amount;
    raisedToMinimum = floored.raised;
    citations.push(cite('Art. 23', 'pension formula'));
    if (raisedToMinimum) citations.push(cite('Art. 26', 'minimum pension'));

    if (elig.outcome === 'pension_reduced') {
      const redPct = earlyReductionPercent(input.gender, input.age, c);
      monthlyPension = round2(monthlyPension * (redPct / 100));
      explanation += ` Reduction ${redPct}% for age ${input.age}.`;
    }

    // Art. 23 — reward for years beyond 35 (paid alongside the capped pension).
    rewardAmt = reward(years, salary, c);
    if (rewardAmt > 0) {
      outcome = 'pension_and_reward';
      citations.push(cite('Art. 23', 'reward beyond 35 years'));
    }
  } else if (elig.outcome === 'eos') {
    endOfService = endOfServiceGratuity(years, salary, c);
    citations.push(cite('Art. 43', 'end-of-service gratuity'));
  }

  return {
    outcome,
    monthlyPension,
    endOfService,
    reward: rewardAmt,
    raisedToMinimum,
    explanation,
    citations,
    inputs: input,
  };
}

/** Art. 20 — purchase of nominal service; Art. 6/7 — addition of prior service. */
export function calculatePurchase(input: PurchaseInput, c: CalcConfig = DEFAULT_CONFIG): PurchaseResult {
  const cost = round2(input.contributionSalary * c.purchaseRate * input.years * c.purchaseMonths);
  const citations: Citation[] =
    input.kind === 'purchase'
      ? [cite('Art. 20', 'purchase of nominal service')]
      : [cite('Art. 6'), cite('Art. 7'), cite('Art. 9')];

  if (input.kind === 'purchase') {
    const max = input.gender === 'male' ? c.maxPurchaseMale : c.maxPurchaseFemale;
    const reasons: string[] = [];
    let eligible = true;
    if (input.years > max) {
      eligible = false;
      reasons.push(`Max purchasable for ${input.gender} is ${max} years.`);
    }
    if (input.yearsOfService != null && input.yearsOfService < c.minYearsForPurchase) {
      eligible = false;
      reasons.push(`Requires >= ${c.minYearsForPurchase} years of service.`);
    }
    return {
      eligible,
      cost,
      explanation:
        (eligible ? 'Eligible. ' : 'Not eligible. ') +
        `Cost = salary ${input.contributionSalary} × ${c.purchaseRate} × ${input.years} yrs × ${c.purchaseMonths} = ${cost} AED.` +
        (reasons.length ? ' ' + reasons.join(' ') : ''),
      citations,
      inputs: input,
    };
  }

  return {
    eligible: true,
    cost,
    explanation: `Addition cost = salary ${input.contributionSalary} × ${c.purchaseRate} × ${input.years} yrs × ${c.purchaseMonths} = ${cost} AED.`,
    citations,
    inputs: input,
  };
}
