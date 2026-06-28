-- 0004_seed_knowledge.sql
-- Seeds topics, the service/form catalog, service<->topic links, and the
-- article cross-reference graph extracted from Law 5/2018 by reading the text.
-- Chunk<->topic tagging happens post-ingestion (needs chunk ids) via scripts/tag-topics.ts.

-- ===== Topics =====
insert into topic (key, title_ar, title_en, description) values
  ('definitions',         'التعريفات',                'Definitions',            'Defined terms in Art. 1 (salary bases, insured, service period, disability, etc.)'),
  ('contributions',       'الاشتراكات',               'Contributions',          'Subscription rates, registration, payment timing, late fees (Arts. 3–18)'),
  ('service_addition',    'ضم مدة الخدمة',            'Service addition',       'Annexing prior service periods (Arts. 6–9, 55) — Form 3'),
  ('service_purchase',    'شراء مدة اعتبارية',        'Service purchase',       'Buying nominal service (Art. 20) — Form 4'),
  ('pension_eligibility', 'استحقاق المعاش',           'Pension eligibility',    'When a pension is due, by case/gender/age/years (Arts. 19, 21, 22)'),
  ('pension_calc',        'حساب المعاش',              'Pension calculation',    'Pension formula, deductions, minimum (Arts. 23–26)'),
  ('beneficiaries',       'المستحقون',                'Beneficiaries',          'Survivor shares, suspension/restoration of shares (Arts. 27–40)'),
  ('eos_gratuity',        'مكافأة نهاية الخدمة',      'End-of-service gratuity','Gratuity when no pension is due (Arts. 41–44)'),
  ('pension_suspension',  'وقف وإسقاط المعاش',        'Suspension & forfeiture','Forfeiture/suspension of pension or gratuity (Arts. 45–48, 60, 64)'),
  ('death_disability',    'الوفاة والعجز',            'Death & disability',     'Work-injury/natural death compensation, missing insured (Arts. 21, 22, 56–59)'),
  ('penalties',           'الجزاءات',                 'Penalties',              'Violations and fines (Arts. 49–51)'),
  ('exceptional',         'معاشات استثنائية',         'Exceptional pensions',   'Exceptional pensions/gratuities and fund obligations (Arts. 52–54)')
on conflict (key) do nothing;

-- ===== Service / form catalog =====
insert into service (key, title_ar, title_en, service_type, description, legal_basis, calc_type, required_inputs, required_attachments, source_path) values
  (
    'form_3_service_addition',
    'نموذج رقم 3 — طلب ضم مدد خدمة سابقة',
    'Form 3 — Request to annex prior service',
    'form',
    'Annex prior service (federal/local government, military, prior employer, pre-nationality service) to actual service for pension/gratuity calculation. Insured pays own + employer share at the contribution salary on the request date; instalments allowed (≥ ¼ contribution salary, not past retirement age).',
    array['Law 5/2018, Art. 6','Law 5/2018, Art. 7','Law 5/2018, Art. 9'],
    'addition',
    '{"fields":["job_title","employee_no","id_number","birth_date","hire_date","current_employer","prior_periods:[{employer,from,to,contribution_salary,amount}]"]}'::jsonb,
    '["ID card","registration extract at appointment","salary-detail certificate at request date","CV at appointment","service certificate from prior entity (colored)","end-of-service gratuity certificate from prior pension fund"]'::jsonb,
    'corpus/raw/نموذج رقم 3 ضم خدمة للصندوق.pdf'
  ),
  (
    'form_4_purchase',
    'نموذج رقم 4 — طلب شراء مدة خدمة اعتبارية',
    'Form 4 — Request to purchase nominal service',
    'form',
    'Purchase nominal service added to actual service. Eligibility: ≥20 years of service; max 5 years (men) / 10 years (women). Cost = contribution salary × 20% × years × 12. Insured bears own + employer share; lump sum or instalments (not past retirement age).',
    array['Law 5/2018, Art. 20'],
    'purchase',
    '{"fields":["employer_name","basic_salary","cost_of_living_allowance","social_allowance_children","social_allowance_citizen","other_continuous_allowances","contribution_date","years_to_purchase","gender"]}'::jsonb,
    '["ID card","salary-detail certificate at request date"]'::jsonb,
    'corpus/raw/نموذج رقم 4 شراء مدة خدمة اعتبارية.pdf'
  )
on conflict (key) do nothing;

-- ===== Service <-> topic =====
insert into service_topic (service_key, topic_key) values
  ('form_3_service_addition','service_addition'),
  ('form_3_service_addition','pension_calc'),
  ('form_4_purchase','service_purchase'),
  ('form_4_purchase','pension_calc')
on conflict do nothing;

-- ===== Article cross-reference graph (Law 5/2018) =====
-- Captured from the law text; document_id resolved by doc_key at seed time.
insert into article_xref (document_id, from_article, to_article, relation, note)
select sd.id, x.from_article, x.to_article, x.relation, x.note
from (values
  ('2',  '70',  'depends_on',       'Scope tied to Emiri Decree 70/2017'),
  ('7',  '6',   'depends_on',       'Conditions for annexing the periods listed in Art. 6'),
  ('9',  '4',   'references',       'Contribution shares per Art. 4 for pre-nationality service'),
  ('19', '40',  'references',       'Combining pension/salary exceptions'),
  ('22', '19',  'references',       'Work-injury death/disability assumes 35 years vs Art. 19 base'),
  ('24', '22',  'exception_to',     'Deduction does not affect Art. 22 cases'),
  ('24', '19',  'depends_on',       'Applies to clauses (و) and (ي) of Art. 19'),
  ('30', '27',  'references',       'Share transfer per Table 1 (Art. 27)'),
  ('31', '27',  'references',       'Grandchildren shares per Table 1'),
  ('36', '32',  'depends_on',       'Sibling entitlement under Arts. 32 & 33 limits'),
  ('36', '33',  'depends_on',       'Sibling entitlement under Arts. 32 & 33 limits'),
  ('38', '26',  'references',       'Redistribution within shares of Art. 26'),
  ('40', '39',  'exception_to',     'Exceptions to the no-double-pension rule (Art. 39)'),
  ('46', '45',  'references',       'Disciplinary forfeiture context (Art. 45)'),
  ('55', '40',  'depends_on',       'Re-employment of pensioner subject to Art. 40'),
  ('59', '58',  'depends_on',       'Right to full compensation alongside Art. 58'),
  ('20', '20',  'defines_term_for', 'Service purchase basis — Form 4')
) as x(from_article, to_article, relation, note)
cross join source_documents sd
where sd.doc_key = 'law_5_2018_ar'
on conflict do nothing;
