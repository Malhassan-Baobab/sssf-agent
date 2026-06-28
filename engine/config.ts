/**
 * Calc config. The DEFAULT_CONFIG mirrors the seeded `final_v1` rows
 * (db/migrations/0002_seed_calc.sql) and the Final Version calculator.
 * loadConfig() can hydrate from Supabase so the engine and DB never drift.
 */
import type { CalcConfig } from './types.js';

export const DEFAULT_CONFIG: CalcConfig = {
  version: 'final_v1',
  minPension: 17500,
  minBeneficiaryShare: 1000,
  pensionBasePct: 60,
  pensionStepPct: 2,
  pensionCapPct: 100,
  pensionBaseYears: 15,
  pensionCapYears: 35,
  eosTier1Months: 1.5,
  eosTier2Months: 2,
  eosTier3Months: 3,
  rewardMonthsPerYear: 1,
  purchaseRate: 0.2,
  purchaseMonths: 12,
  minYearsForPurchase: 20,
  maxPurchaseMale: 5,
  maxPurchaseFemale: 10,
  retirementAgeMale: 60,
  retirementAgeFemale: 55,
  workInjuryAssumedYears: 35,
  // From Final Version cells N36:N48 (female) and O36:O53 (male).
  agePct: {
    male: [
      [38, 40],
      [45, 50],
      [50, 60],
      [55, 100],
    ],
    female: [
      [38, 40],
      [45, 50],
      [50, 100],
    ],
  },
};

/**
 * Load the active config from Supabase calc_* tables. Falls back to
 * DEFAULT_CONFIG shape but with DB values, so a config bump is picked up
 * without code changes. Requires a Supabase client.
 */
export async function loadConfig(
  supabase: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          k: string,
          v: unknown
        ) => Promise<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
      };
    };
  },
  version = 'final_v1'
): Promise<CalcConfig> {
  const consts = await supabase.from('calc_constant').select('key,value').eq('config_version', version);
  if (consts.error || !consts.data) return { ...DEFAULT_CONFIG, version };
  const m = new Map(consts.data.map((r) => [r.key as string, Number(r.value)]));
  const ageRows = await supabase
    .from('age_percentage')
    .select('gender,age_min,pct')
    .eq('config_version', version);

  const cfg: CalcConfig = { ...DEFAULT_CONFIG, version };
  const set = (k: keyof CalcConfig, key: string) => {
    if (m.has(key)) (cfg[k] as number) = m.get(key)!;
  };
  set('minPension', 'min_pension');
  set('minBeneficiaryShare', 'min_beneficiary_share');
  set('pensionBasePct', 'pension_base_pct');
  set('pensionStepPct', 'pension_step_pct');
  set('pensionCapPct', 'pension_cap_pct');
  set('eosTier1Months', 'eos_tier1_months');
  set('eosTier2Months', 'eos_tier2_months');
  set('eosTier3Months', 'eos_tier3_months');
  set('rewardMonthsPerYear', 'reward_months_per_year');
  set('purchaseRate', 'purchase_rate');
  set('purchaseMonths', 'purchase_months');
  set('minYearsForPurchase', 'min_years_for_purchase');
  set('maxPurchaseMale', 'max_purchase_male');
  set('maxPurchaseFemale', 'max_purchase_female');
  set('retirementAgeMale', 'retirement_age_male');
  set('retirementAgeFemale', 'retirement_age_female');

  if (!ageRows.error && ageRows.data?.length) {
    const male: Array<[number, number]> = [];
    const female: Array<[number, number]> = [];
    for (const r of ageRows.data) {
      const tier: [number, number] = [Number(r.age_min), Number(r.pct)];
      (r.gender === 'male' ? male : female).push(tier);
    }
    male.sort((a, b) => a[0] - b[0]);
    female.sort((a, b) => a[0] - b[0]);
    if (male.length) cfg.agePct.male = male;
    if (female.length) cfg.agePct.female = female;
  }
  return cfg;
}
