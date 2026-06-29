/**
 * Retirement planning (deterministic). For a CURRENTLY EMPLOYED insured, given
 * current gender/age/years (+ optional salary), works out:
 *  - whether they could draw a pension today (and which Art. 19 path),
 *  - if not, what is blocking it and the earliest they qualify (assuming they
 *    keep working — age and service grow together),
 *  - whether purchasing nominal service (Art. 20) can help, within its limits.
 *
 * All thresholds come from the law/config — never model inference.
 * Paths covered (voluntary planning; death/disability/dismissal handled by calculate()):
 *   - Art. 19(ب): reach retirement age (M60/F55) with >= 15 years  -> full pension
 *   - Art. 19(ج/د): >= 20 years AND age >= 55 (M) / 50 (F)          -> full pension (early)
 *   - Art. 19(ج/د): >= 20 years, below that age (>= 38)             -> reduced pension until that age
 *   - Art. 19(ه): female with children < 18, >= 15 years, age >= 45 -> pension
 */
import type { CalcConfig, Gender } from './types.js';
import { DEFAULT_CONFIG } from './config.js';
import { pensionPercent, applyFloor, earlyReductionPercent } from './calc.js';

export interface RetirementInput {
  gender: Gender;
  age: number;
  yearsOfService: number;
  contributionSalary?: number;
  hasChildrenUnder18?: boolean;
}

export interface Milestone {
  yearsFromNow: number;
  atAge: number;
  atYears: number;
  type: 'full' | 'reduced';
  path: string; // citation/label
  note: string;
}

export interface RetirementAnalysis {
  inputs: RetirementInput;
  assumption: string;
  eligibleNow: boolean;
  nowType: 'full' | 'reduced' | 'gratuity_only' | 'none';
  nowNote: string;
  milestones: Milestone[]; // sorted by soonest; excludes paths already met (yearsFromNow 0 shown in eligibleNow)
  guaranteedAtRetirementAge: { atAge: number; yearsFromNow: number; willHave15Years: boolean; outcome: 'pension' | 'gratuity' };
  purchase: {
    availableNow: boolean;
    note: string;
    maxYears?: number;
    illustration?: string;
  };
  estimatedMonthlyPensionNow?: number;
  citations: string[];
}

const ceilGap = (target: number, current: number) => Math.max(0, Math.ceil(target - current));

export function analyzeRetirement(
  input: RetirementInput,
  c: CalcConfig = DEFAULT_CONFIG
): RetirementAnalysis {
  const { gender, age, yearsOfService: years } = input;
  const retAge = gender === 'male' ? c.retirementAgeMale : c.retirementAgeFemale;
  const earlyFullAge = gender === 'male' ? 55 : 50; // Art. 19(ج/د) full-pension age
  const lowestReductionAge = c.agePct[gender][0]?.[0] ?? 38; // below this, early reduction % = 0

  const milestones: Milestone[] = [];

  // Path (ب): retirement age with >= 15 years.
  {
    const t = Math.max(ceilGap(retAge, age), ceilGap(c.pensionBaseYears, years));
    milestones.push({
      yearsFromNow: t,
      atAge: age + t,
      atYears: years + t,
      type: 'full',
      path: 'Law 5/2018, Art. 19(ب)',
      note: `At retirement age ${retAge} with at least 15 years of service.`,
    });
  }
  // Path (ج/د) full: age >= earlyFullAge AND years >= 20.
  {
    const t = Math.max(ceilGap(earlyFullAge, age), ceilGap(20, years));
    milestones.push({
      yearsFromNow: t,
      atAge: age + t,
      atYears: years + t,
      type: 'full',
      path: gender === 'male' ? 'Law 5/2018, Art. 19(ج)' : 'Law 5/2018, Art. 19(د)',
      note: `Resignation with 20 years of service at age ${earlyFullAge} — full pension.`,
    });
  }
  // Path (ج/د) reduced: years >= 20, age >= lowestReductionAge, below earlyFullAge.
  {
    const t = Math.max(ceilGap(20, years), ceilGap(lowestReductionAge, age));
    const atAge = age + t;
    if (atAge < earlyFullAge) {
      milestones.push({
        yearsFromNow: t,
        atAge,
        atYears: years + t,
        type: 'reduced',
        path: gender === 'male' ? 'Law 5/2018, Art. 19(ج)' : 'Law 5/2018, Art. 19(د)',
        note: `Resignation with 20 years before age ${earlyFullAge} — a reduced pension is paid until age ${earlyFullAge}.`,
      });
    }
  }
  // Path (ه): female with children < 18, age >= 45, years >= 15.
  if (gender === 'female' && input.hasChildrenUnder18) {
    const t = Math.max(ceilGap(45, age), ceilGap(c.pensionBaseYears, years));
    milestones.push({
      yearsFromNow: t,
      atAge: age + t,
      atYears: years + t,
      type: 'full',
      path: 'Law 5/2018, Art. 19(ه)',
      note: 'Female with children under 18, 15 years of service, age 45.',
    });
  }

  milestones.sort((a, b) => a.yearsFromNow - b.yearsFromNow || (a.type === b.type ? 0 : a.type === 'full' ? -1 : 1));

  // Current status (if they resigned/retired today).
  const metNow = milestones.filter((m) => m.yearsFromNow === 0);
  const eligibleNow = metNow.length > 0;
  const bestNow = metNow.find((m) => m.type === 'full') ?? metNow[0];
  let nowType: RetirementAnalysis['nowType'] = 'none';
  let nowNote = '';
  if (eligibleNow) {
    nowType = bestNow.type;
    nowNote = `Eligible for a ${bestNow.type} pension now (${bestNow.path}).`;
  } else if (age >= retAge) {
    nowType = 'gratuity_only';
    nowNote = 'At/above retirement age but under 15 years — entitled to an end-of-service gratuity, not a pension.';
  } else {
    nowType = 'none';
    nowNote = 'Not yet eligible for a pension if service ended today.';
  }

  // What's guaranteed at retirement age.
  const tRet = ceilGap(retAge, age);
  const yearsAtRet = years + tRet;
  const guaranteedAtRetirementAge = {
    atAge: retAge,
    yearsFromNow: tRet,
    willHave15Years: yearsAtRet >= c.pensionBaseYears,
    outcome: (yearsAtRet >= c.pensionBaseYears ? 'pension' : 'gratuity') as 'pension' | 'gratuity',
  };

  // Purchase insight (Art. 20): requires >= 20 years of actual service to be eligible.
  const maxPurchase = gender === 'male' ? c.maxPurchaseMale : c.maxPurchaseFemale;
  const purchase: RetirementAnalysis['purchase'] = years >= c.minYearsForPurchase
    ? {
        availableNow: true,
        maxYears: maxPurchase,
        note: `You have ${years} years, so you may purchase up to ${maxPurchase} nominal year(s) (Art. 20). Purchase raises the pension percentage; it does not change the qualifying age.`,
      }
    : {
        availableNow: false,
        note: `Purchasing nominal service (Art. 20) requires at least ${c.minYearsForPurchase} years of service; you currently have ${years}.`,
      };

  // Optional amount illustration when salary is provided.
  let estimatedMonthlyPensionNow: number | undefined;
  if (input.contributionSalary && eligibleNow) {
    const pct = pensionPercent(years, c);
    let amt = applyFloor(Math.round(input.contributionSalary * (pct / 100) * 100) / 100, c).amount;
    if (bestNow.type === 'reduced') {
      amt = Math.round(amt * (earlyReductionPercent(gender, age, c) / 100) * 100) / 100;
    }
    estimatedMonthlyPensionNow = amt;
  }
  if (input.contributionSalary && purchase.availableNow) {
    const pctNow = pensionPercent(years, c);
    const pctAfter = pensionPercent(Math.min(years + maxPurchase, c.pensionCapYears), c);
    const cost = Math.round(input.contributionSalary * c.purchaseRate * maxPurchase * c.purchaseMonths * 100) / 100;
    const before = applyFloor(Math.round(input.contributionSalary * (pctNow / 100) * 100) / 100, c).amount;
    const after = applyFloor(Math.round(input.contributionSalary * (pctAfter / 100) * 100) / 100, c).amount;
    if (before === after) {
      purchase.illustration =
        before === c.minPension
          ? `Buying years would NOT increase your monthly pension — it is already at the legal minimum (${c.minPension} AED). Do not recommend purchasing for this purpose.`
          : `Buying years would not change your monthly pension on these inputs. Do not recommend it for this purpose.`;
    } else {
      purchase.illustration = `Buying ${maxPurchase} year(s) raises the full-pension basis from ~${before} to ~${after} AED/month (factor ${pctNow}% → ${pctAfter}%), cost ${cost} AED.`;
    }
  }

  return {
    inputs: input,
    assumption: 'Assumes you keep contributing — each future year adds one year of service and one year of age.',
    eligibleNow,
    nowType,
    nowNote,
    milestones,
    guaranteedAtRetirementAge,
    purchase,
    estimatedMonthlyPensionNow,
    citations: ['Law 5/2018, Art. 19', 'Law 5/2018, Art. 20', 'Law 5/2018, Art. 23', 'Law 5/2018, Art. 26'],
  };
}
