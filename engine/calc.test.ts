/**
 * Calc engine validation.
 * ORACLE = the production calculator `Final Version الحاسبة الصورة الأخيرة.xlsx`
 * (+ Calc.xlsx logic), recomputed from its formulas and cross-checked to
 * Law 5/2018. The superseded `Calc_TestCases.xlsx` is NOT used as the oracle
 * (its Expected/Actual columns contain errors; see Notion 03). The case IDs
 * below are local labels, not references to that file. Every expected value
 * here is a Final Version recomputation.
 *
 * Run: npx tsx engine/calc.test.ts
 */
import { calculate, calculatePurchase } from './calc.js';
import { analyzeRetirement } from './retirement.js';
import { validateName, normalizeUaeMobile } from './validate.js';
import type { CalcInput, Gender } from './types.js';

interface PensionCase {
  id: string;
  gender: Gender;
  age: number;
  years: number;
  salary: number;
  kids?: boolean;
  expect: { outcome: string; pension?: number; eos?: number; reward?: number; earlyReduced?: number };
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
  { id: 'TC11', gender: 'male', age: 50, years: 20, salary: 20000, expect: { outcome: 'pension_reduced', pension: 17500, earlyReduced: 10500 }, note: 'monthlyPension=floored full 17500; early amount 10500 (60% age-reduction)' },
  { id: 'TC12', gender: 'female', age: 45, years: 22, salary: 22000, kids: false, expect: { outcome: 'pension_reduced', pension: 17500, earlyReduced: 8750 }, note: 'monthlyPension=17500; early amount 8750 (50%)' },
  { id: 'TC13', gender: 'male', age: 50, years: 25, salary: 20000, expect: { outcome: 'pension_reduced', pension: 17500, earlyReduced: 10500 }, note: 'monthlyPension=17500; early amount 10500 (60%)' },
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
  const okEarly = t.expect.earlyReduced == null || r.earlyReducedPension === t.expect.earlyReduced;
  if (okOutcome && okPension && okEos && okReward && okEarly) {
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
  now: boolean; // pensionPayableNow
  shortfall: number; // yearsShortfall (0 when payable now)
  ret: 'pension' | 'gratuity';
}
const RET: RetCase[] = [
  { id: 'RT01 M44/20', i: { gender: 'male', age: 44, yearsOfService: 20 }, now: true, shortfall: 0, ret: 'pension' },
  { id: 'RT02 M55/19', i: { gender: 'male', age: 55, yearsOfService: 19 }, now: false, shortfall: 1, ret: 'pension' },
  { id: 'RT03 M60/15', i: { gender: 'male', age: 60, yearsOfService: 15 }, now: true, shortfall: 0, ret: 'pension' },
  { id: 'RT04 M60/14', i: { gender: 'male', age: 60, yearsOfService: 14 }, now: false, shortfall: 1, ret: 'gratuity' },
  { id: 'RT05 F50/20', i: { gender: 'female', age: 50, yearsOfService: 20 }, now: true, shortfall: 0, ret: 'pension' },
  { id: 'RT06 F49/20', i: { gender: 'female', age: 49, yearsOfService: 20 }, now: true, shortfall: 0, ret: 'pension' },
  { id: 'RT07 M30/5', i: { gender: 'male', age: 30, yearsOfService: 5 }, now: false, shortfall: 15, ret: 'pension' },
  { id: 'RT08 M38/20', i: { gender: 'male', age: 38, yearsOfService: 20 }, now: true, shortfall: 0, ret: 'pension' },
  { id: 'RT09 M37/20', i: { gender: 'male', age: 37, yearsOfService: 20 }, now: true, shortfall: 0, ret: 'pension' },
  { id: 'RT10 F44/15+kids', i: { gender: 'female', age: 44, yearsOfService: 15, hasChildrenUnder18: true }, now: false, shortfall: 1, ret: 'pension' },
  { id: 'RT11 F45/15+kids', i: { gender: 'female', age: 45, yearsOfService: 15, hasChildrenUnder18: true }, now: true, shortfall: 0, ret: 'pension' },
  { id: 'RT12 F45/15 noKids', i: { gender: 'female', age: 45, yearsOfService: 15 }, now: false, shortfall: 5, ret: 'pension' },
];
for (const t of RET) {
  const a = analyzeRetirement(t.i);
  // No full/reduced labels anywhere, and no "type" field. (Age 38 may legitimately
  // appear as a person's real atAge — only the invented age-38 milestone was removed.)
  const noLabels = !JSON.stringify(a).match(/full pension|reduced pension|معاش (كامل|مخفض)|"type"/i);
  const ok =
    a.pensionPayableNow === t.now &&
    a.yearsShortfall === t.shortfall &&
    a.guaranteedAtRetirementAge.outcome === t.ret &&
    noLabels;
  if (ok) pass++;
  else {
    fail++;
    fails.push(`${t.id}: now=${a.pensionPayableNow}/${t.now} shortfall=${a.yearsShortfall}/${t.shortfall} ret=${a.guaranteedAtRetirementAge.outcome}/${t.ret} noLabels=${noLabels}`);
  }
}

// Deterministic input validation (must run before any calc).
import { validateProfile } from './validate.js';
interface VCase { id: string; raw: Record<string, unknown>; expectOk: boolean; rejectIncludes?: string }
const VAL: VCase[] = [
  { id: 'V1 age30/yos40 impossible', raw: { gender: 'male', age: 30, yearsOfService: 40 }, expectOk: false, rejectIncludes: '12' },
  { id: 'V2 age17 too young', raw: { gender: 'male', age: 17, yearsOfService: 0 }, expectOk: false, rejectIncludes: '18' },
  { id: 'V3 yos=age-18 boundary', raw: { gender: 'male', age: 30, yearsOfService: 12 }, expectOk: true },
  { id: 'V4 gender bisexual', raw: { gender: 'bisexual', age: 40, yearsOfService: 10 }, expectOk: false, rejectIncludes: 'male or female' },
  { id: 'V5 gender typo ضكر', raw: { gender: 'ضكر', age: 40, yearsOfService: 10 }, expectOk: true },
  { id: 'V6 salary 0', raw: { gender: 'male', age: 40, yearsOfService: 10, contributionSalary: 0 }, expectOk: false, rejectIncludes: 'greater than zero' },
  { id: 'V7 age 250 absurd', raw: { gender: 'male', age: 250, yearsOfService: 5 }, expectOk: false, rejectIncludes: '100' },
  { id: 'V8 yos 999', raw: { gender: 'female', age: 40, yearsOfService: 999 }, expectOk: false },
  { id: 'V9 valid+salary', raw: { gender: 'female', age: 50, yearsOfService: 25, contributionSalary: 20000 }, expectOk: true },
];
for (const t of VAL) {
  const r = validateProfile(t.raw);
  let ok = r.ok === t.expectOk;
  if (ok && !r.ok && t.rejectIncludes) ok = r.reject.some((m) => m.includes(t.rejectIncludes!));
  if (ok) pass++;
  else { fail++; fails.push(`${t.id}: ok=${r.ok}/${t.expectOk}` + (!r.ok ? ` reject=${JSON.stringify(r.reject)}` : '')); }
}

// Contact validation (escalation): name + UAE mobile.
const nameCases: Array<[string, boolean]> = [
  ['idontknow', false], ['abc050', false], ['Mo', false], ['John', false],
  ['Mohammed Ali', true], ['محمد علي', true], ['John Doe', true],
];
for (const [n, exp] of nameCases) {
  if (validateName(n) === exp) pass++;
  else { fail++; fails.push(`name "${n}": got ${validateName(n)} expected ${exp}`); }
}
const mobileCases: Array<[string, string | null]> = [
  ['1234', null], ['abc050', null], ['050123456789', null], ['05012345', null],
  ['0501234567', '+971501234567'], ['+971 50 123 4567', '+971501234567'],
  ['971501234567', '+971501234567'], ['00971501234567', '+971501234567'],
];
for (const [m, exp] of mobileCases) {
  if (normalizeUaeMobile(m) === exp) pass++;
  else { fail++; fails.push(`mobile "${m}": got ${normalizeUaeMobile(m)} expected ${exp}`); }
}

// --- PINNED injection scenario: the figure must be the Final Version's, not the model's.
// Final Version: male, retirement age, 25 years → 80% (60 + (25-15)*2); 80% × 30,000 = 24,000 (above the 17,500 floor).
{
  const r = calculate({ caseType: 'retirement_age', gender: 'male', age: 62, yearsOfService: 25, contributionSalary: 30000 });
  if (r.monthlyPension === 24000) pass++;
  else { fail++; fails.push(`PIN injection M/62/25y/30000: got ${r.monthlyPension} expected 24000 (Final Version)`); }
}

// --- Task 2: purchased/annexed service vs the age−18 guard.
{
  // age 40 / 22 actual + 5 purchased (credited 27) → ACCEPTED (purchase not age-bounded).
  const a = validateProfile({ gender: 'male', age: 40, yearsOfService: 22, purchasedYears: 5 });
  if (a.ok) pass++; else { fail++; fails.push(`PUR1 age40/22actual+5purchased should be accepted: ${JSON.stringify(a)}`); }
  // age 30 / 40 actual → still REJECTED by the age−18 guard.
  const b = validateProfile({ gender: 'male', age: 30, yearsOfService: 40 });
  if (!b.ok) pass++; else { fail++; fails.push('PUR2 age30/40actual should be rejected'); }
  // purchased years raise the pension % via credited years (20 actual + 5 = 25 → 80%).
  const withP = calculate({ caseType: 'retirement_age', gender: 'male', age: 60, yearsOfService: 20, purchasedYears: 5, contributionSalary: 30000 });
  const noP = calculate({ caseType: 'retirement_age', gender: 'male', age: 60, yearsOfService: 20, contributionSalary: 30000 });
  if (withP.monthlyPension === 24000 && noP.monthlyPension === 21000) pass++;
  else { fail++; fails.push(`PUR3 credited %: withPurchase=${withP.monthlyPension}(exp 24000) noPurchase=${noP.monthlyPension}(exp 21000)`); }
  // purchase without 20 actual years is rejected (Art. 20).
  const c2 = validateProfile({ gender: 'male', age: 45, yearsOfService: 10, purchasedYears: 3 });
  if (!c2.ok) pass++; else { fail++; fails.push('PUR4 purchase with <20 actual should be rejected'); }
}

// --- Task 3: salary bounds are private-sector only.
{
  const gov = validateProfile({ gender: 'male', age: 45, yearsOfService: 20, contributionSalary: 90000, sector: 'government' });
  const priv = validateProfile({ gender: 'male', age: 45, yearsOfService: 20, contributionSalary: 90000, sector: 'private' });
  const govOk = gov.ok && gov.warnings.length === 0;
  const privFlagged = priv.ok && priv.warnings.some((w) => /private-sector range/.test(w));
  if (govOk && privFlagged) pass++;
  else { fail++; fails.push(`SECTOR: govWarnings=${gov.ok ? gov.warnings.length : 'reject'} privFlagged=${privFlagged}`); }
}

console.log(`Calc engine validation: ${pass} passed, ${fail} failed (of ${pass + fail}) — Final Version oracle; incl. purchase split, sector bounds, validation, retirement, contact.`);
if (fails.length) {
  console.log('\nFailures:');
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
} else {
  console.log('All deterministic calc cases match the law-correct oracle. ✓');
}
