/**
 * Retirement planning (deterministic). For a currently-employed insured, works
 * out — using ONLY Law Art. 19 thresholds — whether a pension is payable now,
 * and the earliest future points when it becomes payable. It never invents
 * ages and never labels a pension "full" or "reduced".
 *
 * Art. 19 thresholds used (planning; death/disability/dismissal go through calculate()):
 *   - 20 years of service (resignation) → pension payable; if below the
 *     qualifying age (55 male / 50 female) a Board-set percentage applies until
 *     that age (Art. 19 ج/د). The qualifying age is reported as a separate point.
 *   - retirement age (60 male / 55 female) with >= 15 years (Art. 19 ب).
 *   - female with children under 18: age 45 with >= 15 years (Art. 19 ه).
 * The early-retirement age-percentage table is NOT an eligibility age — it only
 * affects the computed amount, which the calc engine returns on request.
 */
import type { CalcConfig } from './types.js';
import { DEFAULT_CONFIG } from './config.js';

export type Gender = 'male' | 'female';

export interface RetirementInput {
  gender: Gender;
  age: number;
  yearsOfService: number;
  hasChildrenUnder18?: boolean;
}

export interface Milestone {
  yearsFromNow: number;
  atAge: number;
  atYears: number;
  path: string; // article label
  note: string;
}

export interface RetirementAnalysis {
  inputs: RetirementInput;
  assumption: string;
  pensionPayableNow: boolean;
  statusNote: string;
  /** Min extra years of service still needed for any pension path (0 if payable now). */
  yearsShortfall: number | null;
  milestones: Milestone[];
  guaranteedAtRetirementAge: { atAge: number; yearsFromNow: number; willHave15Years: boolean; outcome: 'pension' | 'gratuity' };
  purchase: { availableNow: boolean; note: string };
  citations: string[];
}

const ceilGap = (target: number, current: number) => Math.max(0, Math.ceil(target - current));

export function analyzeRetirement(input: RetirementInput, c: CalcConfig = DEFAULT_CONFIG): RetirementAnalysis {
  const { gender, age, yearsOfService: years } = input;
  const retAge = gender === 'male' ? c.retirementAgeMale : c.retirementAgeFemale; // 60 / 55
  const qualAge = gender === 'male' ? 55 : 50; // Art. 19 ج/د resignation qualifying age
  const base = c.pensionBaseYears; // 15

  const milestones: Milestone[] = [];

  // Resignation: 20 years of service (Art. 19 ج/د).
  {
    const t = ceilGap(20, years);
    const atAge = age + t;
    const belowQual = atAge < qualAge;
    milestones.push({
      yearsFromNow: t,
      atAge,
      atYears: years + t,
      path: gender === 'male' ? 'Law 5/2018, Art. 19(ج)' : 'Law 5/2018, Art. 19(د)',
      note: belowQual
        ? `On completing 20 years of service you may retire with a pension; below age ${qualAge} a percentage set by the Board applies until you reach age ${qualAge} (Art. 19).`
        : `On completing 20 years of service (at age ${atAge}) you may retire with a pension (Art. 19).`,
    });
    // The qualifying age, when the Board percentage no longer applies.
    const tQual = Math.max(ceilGap(qualAge, age), ceilGap(20, years));
    if (tQual > t) {
      milestones.push({
        yearsFromNow: tQual,
        atAge: age + tQual,
        atYears: years + tQual,
        path: gender === 'male' ? 'Law 5/2018, Art. 19(ج)' : 'Law 5/2018, Art. 19(د)',
        note: `From age ${qualAge} with 20 years of service, the pension percentage is based on years of service (no Board percentage).`,
      });
    }
  }

  // Retirement age with >= 15 years (Art. 19 ب).
  {
    const t = Math.max(ceilGap(retAge, age), ceilGap(base, years));
    milestones.push({
      yearsFromNow: t,
      atAge: age + t,
      atYears: years + t,
      path: 'Law 5/2018, Art. 19(ب)',
      note: `At the retirement age (${retAge}) with at least ${base} years of service (Art. 19).`,
    });
  }

  // Female with children under 18: age 45 with >= 15 years (Art. 19 ه).
  if (gender === 'female' && input.hasChildrenUnder18) {
    const t = Math.max(ceilGap(45, age), ceilGap(base, years));
    milestones.push({
      yearsFromNow: t,
      atAge: age + t,
      atYears: years + t,
      path: 'Law 5/2018, Art. 19(ه)',
      note: `As a woman with children under 18: age 45 with at least ${base} years of service (Art. 19).`,
    });
  }

  milestones.sort((a, b) => a.yearsFromNow - b.yearsFromNow);

  // Is a pension payable today? (Art. 19 thresholds)
  const pensionNow =
    years >= 20 ||
    (age >= retAge && years >= base) ||
    (gender === 'female' && !!input.hasChildrenUnder18 && age >= 45 && years >= base);

  let statusNote: string;
  if (pensionNow) {
    statusNote =
      years >= 20 && age < qualAge
        ? `A pension is payable now (20 years of service). Below age ${qualAge}, a percentage set by the Board applies until you reach age ${qualAge} (Art. 19).`
        : 'A pension is payable now under Art. 19.';
  } else if (age >= retAge) {
    statusNote = `At/above the retirement age but with under ${base} years of service — an end-of-service gratuity is due, not a pension (Art. 41/43).`;
  } else {
    statusNote = 'A pension is not payable now under Art. 19.';
  }

  const futureMilestones = milestones.filter((m) => m.yearsFromNow > 0);
  const yearsShortfall = pensionNow ? 0 : futureMilestones.length ? futureMilestones[0].yearsFromNow : null;

  const tRet = ceilGap(retAge, age);
  const yearsAtRet = years + tRet;
  const guaranteedAtRetirementAge = {
    atAge: retAge,
    yearsFromNow: tRet,
    willHave15Years: yearsAtRet >= base,
    outcome: (yearsAtRet >= base ? 'pension' : 'gratuity') as 'pension' | 'gratuity',
  };

  const maxPurchase = gender === 'male' ? c.maxPurchaseMale : c.maxPurchaseFemale;
  const purchase = years >= c.minYearsForPurchase
    ? { availableNow: true, note: `You have ${years} years, so you may purchase up to ${maxPurchase} nominal year(s) (Art. 20); this can raise the pension percentage, not the qualifying age.` }
    : { availableNow: false, note: `Purchasing nominal service (Art. 20) requires at least ${c.minYearsForPurchase} years of service; you have ${years}.` };

  return {
    inputs: input,
    assumption: 'Assumes continued contribution — each future year adds one year of service and one year of age.',
    pensionPayableNow: pensionNow,
    statusNote,
    yearsShortfall,
    milestones,
    guaranteedAtRetirementAge,
    purchase,
    citations: ['Law 5/2018, Art. 19', 'Law 5/2018, Art. 20'],
  };
}
