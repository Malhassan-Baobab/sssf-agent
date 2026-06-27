-- Seed: calc config final_v1 (from Final Version الحاسبة الصورة الأخيرة.xlsx)
insert into calc_config_version (version, source_file, notes, is_active)
values (
  'final_v1',
  'Final Version الحاسبة الصورة الأخيرة.xlsx',
  'Production calculator ported to versioned config. Authoritative source for all calc constants.',
  true
)
on conflict (version) do nothing;

-- YOS% table: 15 years = 60%, +2% per year, cap at 35 years = 100% (Art. 23)
insert into yos_percentage (config_version, years, pct) values
  ('final_v1', 15, 60), ('final_v1', 16, 62), ('final_v1', 17, 64),
  ('final_v1', 18, 66), ('final_v1', 19, 68), ('final_v1', 20, 70),
  ('final_v1', 21, 72), ('final_v1', 22, 74), ('final_v1', 23, 76),
  ('final_v1', 24, 78), ('final_v1', 25, 80), ('final_v1', 26, 82),
  ('final_v1', 27, 84), ('final_v1', 28, 86), ('final_v1', 29, 88),
  ('final_v1', 30, 90), ('final_v1', 31, 92), ('final_v1', 32, 94),
  ('final_v1', 33, 96), ('final_v1', 34, 98), ('final_v1', 35, 100)
on conflict (config_version, years) do nothing;

-- Age% table — male
insert into age_percentage (config_version, gender, age_min, age_max, pct) values
  ('final_v1', 'male', 38, 44,   40),
  ('final_v1', 'male', 45, 49,   50),
  ('final_v1', 'male', 50, 54,   60),
  ('final_v1', 'male', 55, null, 100)
on conflict (config_version, gender, age_min) do nothing;

-- Age% table — female
insert into age_percentage (config_version, gender, age_min, age_max, pct) values
  ('final_v1', 'female', 38, 44,   40),
  ('final_v1', 'female', 45, 49,   50),
  ('final_v1', 'female', 50, null, 100)
on conflict (config_version, gender, age_min) do nothing;

-- Constants
insert into calc_constant (config_version, key, value, unit, article, description) values
  ('final_v1', 'min_pension',            17500, 'AED',          'Art. 26', 'Minimum monthly pension'),
  ('final_v1', 'min_beneficiary_share',  1000,  'AED',          'Art. 26', 'Minimum monthly share per beneficiary'),
  ('final_v1', 'pension_base_pct',       60,    '%',            'Art. 23', 'Base pension % at minimum YOS (15 years)'),
  ('final_v1', 'pension_step_pct',       2,     '%/year',       'Art. 23', 'Additional % per year of service above 15'),
  ('final_v1', 'pension_cap_pct',        100,   '%',            'Art. 23', 'Maximum pension % of contribution salary'),
  ('final_v1', 'eos_tier1_months',       1.5,   'months/year',  'Art. 43', 'EoS gratuity multiplier: years 1–5'),
  ('final_v1', 'eos_tier2_months',       2,     'months/year',  'Art. 43', 'EoS gratuity multiplier: years 6–10'),
  ('final_v1', 'eos_tier3_months',       3,     'months/year',  'Art. 43', 'EoS gratuity multiplier: years above 10'),
  ('final_v1', 'reward_months_per_year', 1,     'months/year',  'Art. 23', 'Additional reward for YOS > 35'),
  ('final_v1', 'purchase_rate',          0.20,  'fraction',     'Art. 20', 'Annual salary fraction per year of service purchase'),
  ('final_v1', 'purchase_months',        12,    'months',       'Art. 20', 'Number of monthly instalments for service purchase'),
  ('final_v1', 'min_years_for_purchase', 20,    'years',        'Art. 20', 'Minimum YOS to be eligible for service purchase'),
  ('final_v1', 'max_purchase_male',      5,     'years',        'Art. 20', 'Maximum purchasable nominal service — male'),
  ('final_v1', 'max_purchase_female',    10,    'years',        'Art. 20', 'Maximum purchasable nominal service — female'),
  ('final_v1', 'retirement_age_male',    60,    'years',        'Art. 1',  'Normal retirement age — male'),
  ('final_v1', 'retirement_age_female',  55,    'years',        'Art. 1',  'Normal retirement age — female'),
  ('final_v1', 'deduction_pct',          0.10,  'fraction',     'Art. 24', 'Deduction for cases و/ي with YOS < 25 years'),
  ('final_v1', 'natural_death_comp',     60000, 'AED',          'Art. 57', 'Lump-sum compensation on natural death'),
  ('final_v1', 'work_injury_comp',       100000,'AED',          'Art. 58', 'Lump-sum compensation on work-injury death')
on conflict (config_version, key) do nothing;
