/**
 * Validation against Calc_TestCases.xlsx (the oracle).
 * Expected values here are LAW-CORRECT (Law 5/2018), derived by decoding the
 * Final Version calculator formulas. Where the spreadsheet's own
 * Expected/Actual columns disagree with the law, the law wins and the
 * divergence is noted — these are flagged for officer review (see Notion 04/06).
 *
 * Run: npx tsx engine/calc.test.ts
 */
import { calculate, calculatePurchase } from './calc.js';
import { analyzeRetirement } from './retirement.js';
import type { CalcInput, Gender } from './types.js';

interface PensionCase {
  id: string;
  gender: Gender;
  age: number;
  years: number;
  salary: number;
  kids?: boolean;
  expect: { outcome: string; pension?: number; eos?: number; reward?: number };
  note?: string;
}

const PENSION: PensionCase[] = [
  { id: 'TC01', gender: 'male', age: 30, years: 5, salary: 10000, expect: { outcome: 'eos', eos: 75000 } },
  { id: 'TC02', gender: 'female', age: 40, years: 10, salary: 12000, expect: { outcome: 'eos', eos: 210000 } },
  { id: 'TC03', gender: 'male', age: 35, years: 15, salary: 15000, expect: { outcome: 'eos', eos: 487500 }, note: 'sheet Expected 450000 is wrong; Actual 487500 matches Art.43' },
  { id: 'TC04', gender: 'male', age: 30, years: 0.5, salary: 10000, expect: { outcome: 'not_eligible' } },
  { id: 'TC05', gender: 'female', age: 40, years: 14, salary: 12000, expect: { outcome: 'eos', eos: 354000 }, note: 'sheet Expected 420000 wrong; Actual 354000 matches Art.43' },
  { id: 'TC06', gender: 'female', age: 55, years: 18, salary: 15000, kids: true, expect: { outcome: 'pension', pension: 17500 }, note: 'floored Art.26; sheet Expected 10500 ignores floor' },
  { id: 'TC07', gender: 'male', age: 60, years: 20, salary: 20000, expect: { outcome: 'pension', pension: 17500 }, note: '70%×20000=14000 floored to 17500' },
  { id: 'TC08', gender: 'female', age: 50, years: 25, salary: 18000, expect: { outcome: 'pension', pension: 17500 }, note: '80%×18000=14400 floored' },
  { id: 'TC09', gender: 'male', age: 55, years: 18, salary: 15000, expect: { outcome: 'eos', eos: 622500 }, note: 'male resign needs 20 yrs; 18<20 → EoS' },
  { id: 'TC10', gender: 'female', age: 45, years: 18, salary: 15000, kids: false, expect: { outcome: 'eos', eos: 622500 }, note: 'no kids + <20yr → EoS; sheet Actual pension=17500 is a BUG' },
  { id: 'TC11', gender: 'male', age: 50, years: 20, salary: 20000, expect: { outcome: 'pension_reduced', pension: 10500 }, note: '60% age-reduction × floored 17500' },
  { id: 'TC12', gender: 'female', age: 45, years: 22, salary: 22000, kids: false, expect: { outcome: 'pension_reduced', pension: 8750 }, note: '50% × floored 17500' },
  { id: 'TC13', gender: 'male', age: 50, years: 25, salary: 20000, expect: { outcome: 'pension_reduced', pension: 10500 }, note: '60% × floored 17500' },
  { id: 'TC14', gender: 'female', age: 45, years: 22, salary: 22000, kids: true, expect: { outcome: 'pension', pension: 17500 }, note: 'Art.19(ه): kids, ≥15yr, age≥45 → full, floored' },
  { id: 'TC15', gender: 'male', age: 55, years: 25, salary: 20000, expect: { outcome: 'pension', pension: 17500 }, note: '80%×20000=16000 floored' },
  { id: 'TC16', gender: 'female', age: 60, years: 40, salary: 25000, expect: { outcome: 'pension_and_reward', pension: 25000, reward: 125000 }, note: '100% (no floor) + reward 5×25000' },
  { id: 'TC17', gender: 'male', age: 65, years: 37, salary: 30000, expect: { outcome: 'pension_and_reward', pension: 30000, reward: 60000 }, note: '100% + reward 2×30000' },
];

const PURCHASE = [
  { id: 'AP01', salary: 10000, years: 5, expect: 120000 },
  { id: 'AP02', salary: 15000, years: 10, expect: 360000 },
  { id: 'AP03', salary: 12000, years: 3, expect: 86400 },
  { id: 'AP04', salary: 20000, years: 12, expect: 576000 },
  { id: 'AP05', salary: 18000, years: 6, expect: 259200 },
];

// Purchase/addition eligibility (Art. 20 / 6-7) — beyond the pure cost formula.
interface PurchaseElig {
  id: string;
  kind: 'purchase' | 'addition';
  gender: Gender;
  years: number;
  yearsOfService?: number;
  salary: number;
  expectEligible: boolean;
  expectCost: number;
}
const PURCHASE_ELIG: PurchaseElig[] = [
  { id: 'PE01', kind: 'purchase', gender: 'male', years: 5, yearsOfService: 22, salary: 12000, expectEligible: true, expectCost: 144000 },
  { id: 'PE02', kind: 'purchase', gender: 'male', years: 6, yearsOfService: 22, salary: 12000, expectEligible: false, expectCost: 172800 }, // > 5 male max
  { id: 'PE03', kind: 'purchase', gender: 'female', years: 10, yearsOfService: 25, salary: 15000, expectEligible: true, expectCost: 360000 },
  { id: 'PE04', kind: 'purchase', gender: 'female', years: 11, yearsOfService: 25, salary: 15000, expectEligible: false, expectCost: 396000 }, // > 10 female max
  { id: 'PE05', kind: 'purchase', gender: 'male', years: 3, yearsOfService: 18, salary: 10000, expectEligible: false, expectCost: 72000 }, // < 20 yrs service
  { id: 'PE06', kind: 'addition', gender: 'male', years: 4, salary: 10000, expectEligible: true, expectCost: 96000 }, // addition has no purchase caps
];

let pass = 0;
let fail = 0;
const fails: string[] = [];

for (const t of PURCHASE_ELIG) {
  const r = calculatePurchase({
    kind: t.kind,
    contributionSalary: t.salary,
    years: t.years,
    gender: t.gender,
    yearsOfService: t.yearsOfService,
  });
  if (r.eligible === t.expectEligible && r.cost === t.expectCost) pass++;
  else {
    fail++;
    fails.push(`${t.id}: got {eligible:${r.eligible}, cost:${r.cost}} expected {eligible:${t.expectEligible}, cost:${t.expectCost}}`);
  }
}

for (const t of PENSION) {
  const input: CalcInput = {
    caseType: 'resignation',
    gender: t.gender,
    age: t.age,
    yearsOfService: t.years,
    contributionSalary: t.salary,
    hasChildrenUnder18: t.kids,
  };
  const r = calculate(input);
  const okOutcome = r.outcome === t.expect.outcome;
  const okPension = t.expect.pension == null || r.monthlyPension === t.expect.pension;
  const okEos = t.expect.eos == null || r.endOfService === t.expect.eos;
  const okReward = t.expect.reward == null || r.reward === t.expect.reward;
  if (okOutcome && okPension && okEos && okReward) {
    pass++;
  } else {
    fail++;
    fails.push(
      `${t.id}: got {outcome:${r.outcome}, pension:${r.monthlyPension}, eos:${r.endOfService}, reward:${r.reward}} ` +
        `expected {outcome:${t.expect.outcome}, pension:${t.expect.pension ?? '-'}, eos:${t.expect.eos ?? '-'}, reward:${t.expect.reward ?? '-'}}`
    );
  }
}

for (const t of PURCHASE) {
  const r = calculatePurchase({
    contributionSalary: t.salary,
    years: t.years,
    gender: 'male',
    kind: 'addition',
  });
  if (r.cost === t.expect) pass++;
  else {
    fail++;
    fails.push(`${t.id}: got cost ${r.cost} expected ${t.expect}`);
  }
}

// Retirement planning (deterministic) — eligibility timing & purchase insight.
interface RetCase {
  id: string;
  i: { gender: Gender; age: number; yearsOfService: number; hasChildrenUnder18?: boolean };
  now: boolean;
  nowType: string;
  fy?: number; // soonest future milestone years
  fType?: string; // its type
  ret: 'pension' | 'gratuity';
}
const RET: RetCase[] = [
  { id: 'RT01 M44/20', i: { gender: 'male', age: 44, yearsOfService: 20 }, now: true, nowType: 'reduced', fy: 11, fType: 'full', ret: 'pension' },
  { id: 'RT02 M55/19', i: { gender: 'male', age: 55, yearsOfService: 19 }, now: false, nowType: 'none', fy: 1, fType: 'full', ret: 'pension' },
  { id: 'RT03 M60/15', i: { gender: 'male', age: 60, yearsOfService: 15 }, now: true, nowType: 'full', ret: 'pension' },
  { id: 'RT04 M60/14', i: { gender: 'male', age: 60, yearsOfService: 14 }, now: false, nowType: 'gratuity_only', fy: 1, fType: 'full', ret: 'gratuity' },
  { id: 'RT05 F50/20', i: { gender: 'female', age: 50, yearsOfService: 20 }, now: true, nowType: 'full', ret: 'pension' },
  { id: 'RT06 F49/20', i: { gender: 'female', age: 49, yearsOfService: 20 }, now: true, nowType: 'reduced', fy: 1, fType: 'full', ret: 'pension' },
  { id: 'RT07 M30/5', i: { gender: 'male', age: 30, yearsOfService: 5 }, now: false, nowType: 'none', fy: 15, fType: 'reduced', ret: 'pension' },
  { id: 'RT08 M38/20', i: { gender: 'male', age: 38, yearsOfService: 20 }, now: true, nowType: 'reduced', fy: 17, fType: 'full', ret: 'pension' },
  { id: 'RT09 M37/20', i: { gender: 'male', age: 37, yearsOfService: 20 }, now: false, nowType: 'none', fy: 1, fType: 'reduced', ret: 'pension' },
  { id: 'RT10 F44/15+kids', i: { gender: 'female', age: 44, yearsOfService: 15, hasChildrenUnder18: true }, now: false, nowType: 'none', fy: 1, fType: 'full', ret: 'pension' },
  { id: 'RT11 F45/15+kids', i: { gender: 'female', age: 45, yearsOfService: 15, hasChildrenUnder18: true }, now: true, nowType: 'full', ret: 'pension' },
  { id: 'RT12 F45/15 noKids', i: { gender: 'female', age: 45, yearsOfService: 15 }, now: false, nowType: 'none', fy: 5, fType: 'full', ret: 'pension' },
];
for (const t of RET) {
  const a = analyzeRetirement(t.i);
  const fut = a.milestones.filter((m) => m.yearsFromNow > 0)[0];
  const ok =
    a.eligibleNow === t.now &&
    a.nowType === t.nowType &&
    (t.fy == null || fut?.yearsFromNow === t.fy) &&
    (t.fType == null || fut?.type === t.fType) &&
    a.guaranteedAtRetirementAge.outcome === t.ret;
  if (ok) pass++;
  else {
    fail++;
    fails.push(`${t.id}: now=${a.eligibleNow}/${t.now} type=${a.nowType}/${t.nowType} fut=${fut?.yearsFromNow}:${fut?.type}/${t.fy ?? '-'}:${t.fType ?? '-'} ret=${a.guaranteedAtRetirementAge.outcome}/${t.ret}`);
  }
}

console.log(`Calc engine validation: ${pass} passed, ${fail} failed (of ${pass + fail}) — incl. purchase/addition eligibility + retirement planning.`);
if (fails.length) {
  console.log('\nFailures:');
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
} else {
  console.log('All deterministic calc cases match the law-correct oracle. ✓');
}
