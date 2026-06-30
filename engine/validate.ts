/**
 * Deterministic input validation — runs BEFORE any eligibility/calc.
 * The model never overrides these results. Two outcomes:
 *  - reject: hard, impossible/illegal inputs — cannot proceed.
 *  - warnings: soft, implausible inputs — proceed only after explicit user
 *    confirmation (tools pass confirmedPlausibility:true to bypass).
 * Rules grounded in Law 5/2018: min subscription age 18 (Art. 3); service
 * cannot start before 18, so max YOS = age − 18; private-sector salary
 * bounds 4,000–70,000 (Art. 1 راتب حساب الاشتراك).
 */

import { parseGender } from './normalize.js';

export type Gender = 'male' | 'female';

export type Sector = 'government' | 'private';

export interface Profile {
  gender: Gender;
  age: number;
  /** ACTUAL subscription years (age-bounded). */
  yearsOfService: number;
  /** Purchased nominal service (Art. 20) — capped, NOT age-bounded. */
  purchasedYears: number;
  contributionSalary?: number;
  sector?: Sector;
}

const MAX_PURCHASE_MALE = 5; // Art. 20
const MAX_PURCHASE_FEMALE = 10;

export type Validated<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; reject: string[] };

const MIN_AGE = 18; // Art. 3
const MAX_AGE = 100;
const MAX_YOS_ABS = 50; // beyond this, confirm (implausible career)
const SALARY_MIN = 4000; // Art. 1 (private sector)
const SALARY_MAX = 70000;

/**
 * Normalize a free-text gender to male/female via the single deterministic
 * dialect parser (Emirati/Gulf-aware; tolerates typos; never maps هي/هو). null
 * if unclear.
 */
export function normalizeGender(raw: unknown): Gender | null {
  return parseGender(String(raw ?? ''));
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * Validate a pension/eligibility profile.
 * - yearsOfService is ACTUAL subscription years and is age-bounded (max = age − 18).
 * - purchasedYears (Art. 20 nominal service) is a SEPARATE input, capped 5/10,
 *   and is NOT age-bounded; it requires >= 20 actual years to be allowed.
 * - salary 4,000–70,000 bounds apply ONLY to the private sector (Art. 1).
 * Hard rejects (impossible/illegal) must be CORRECTED. Warnings (implausible but
 * possible) must be confirmed or corrected by the user.
 */
export function validateProfile(raw: {
  gender?: unknown;
  age?: unknown;
  yearsOfService?: unknown;
  purchasedYears?: unknown;
  contributionSalary?: unknown;
  sector?: unknown;
}): Validated<Profile> {
  const reject: string[] = [];
  const warnings: string[] = [];

  const gender = normalizeGender(raw.gender);
  if (!gender) reject.push('Gender is unclear — it must be male or female (ذكر/أنثى). Ask once more; if still unclear, offer a human officer.');

  const age = raw.age;
  let ageOk = false;
  if (!isNum(age) || !Number.isInteger(age)) reject.push('Age must be a whole number. Please correct it.');
  else if (age < MIN_AGE) reject.push(`Age must be at least ${MIN_AGE} — the minimum subscription age (Art. 3). Please correct it.`);
  else if (age > MAX_AGE) reject.push(`Age above ${MAX_AGE} is not valid. Please correct it.`);
  else ageOk = true;

  const yos = raw.yearsOfService;
  let yosOk = false;
  if (!isNum(yos)) reject.push('Years of service must be a number. Please correct it.');
  else if (yos < 0) reject.push('Years of service cannot be negative. Please correct it.');
  else if (ageOk) {
    const maxYos = (age as number) - MIN_AGE;
    if (yos > maxYos)
      reject.push(
        `Actual service years cannot exceed ${maxYos} at age ${age} — service cannot start before age ${MIN_AGE} (Art. 3). Please correct the years or the age. (Purchased/added service is entered separately.)`
      );
    else {
      yosOk = true;
      if (yos > MAX_YOS_ABS) warnings.push(`${yos} years of service is unusually long — please confirm it is correct, or correct it.`);
    }
  } else if (yos >= 0) {
    yosOk = true; // numeric & non-negative; age failed separately
  }

  // Purchased nominal service (Art. 20): capped, NOT age-bounded.
  let purchasedYears = 0;
  if (raw.purchasedYears !== undefined && raw.purchasedYears !== null && raw.purchasedYears !== '') {
    const p = raw.purchasedYears;
    const cap = gender === 'female' ? MAX_PURCHASE_FEMALE : MAX_PURCHASE_MALE;
    if (!isNum(p) || p < 0) reject.push('Purchased years cannot be negative. Please correct it.');
    else if (gender && p > cap) reject.push(`Purchased nominal service cannot exceed ${cap} years for ${gender} (Art. 20). Please correct it.`);
    else if (p > 0 && yosOk && isNum(yos) && (yos as number) < 20)
      reject.push('Purchasing nominal service requires at least 20 years of ACTUAL service (Art. 20). Please correct it.');
    else purchasedYears = isNum(p) ? p : 0;
  }

  const sector: Sector | undefined = raw.sector === 'government' ? 'government' : raw.sector === 'private' ? 'private' : undefined;

  let salary: number | undefined;
  if (raw.contributionSalary !== undefined && raw.contributionSalary !== null && raw.contributionSalary !== '') {
    const s = raw.contributionSalary;
    if (!isNum(s) || s <= 0) reject.push('Salary must be a number greater than zero. Please correct it.');
    else {
      salary = s;
      // 4,000–70,000 are the Art. 1 PRIVATE-sector bounds; do not flag government salaries.
      if (sector === 'private' && (s < SALARY_MIN || s > SALARY_MAX))
        warnings.push(`Salary ${s} is outside the private-sector range (${SALARY_MIN}–${SALARY_MAX}, Art. 1) — please confirm it is correct, or correct it.`);
    }
  }

  if (reject.length) return { ok: false, reject };
  return { ok: true, value: { gender: gender!, age: age as number, yearsOfService: yos as number, purchasedYears, contributionSalary: salary, sector }, warnings };
}

export interface PurchaseProfile {
  kind: 'purchase' | 'addition';
  gender: Gender;
  years: number;
  contributionSalary: number;
  yearsOfService?: number;
}

/** Validate a purchase/addition request. */
export function validatePurchase(raw: {
  kind?: unknown;
  gender?: unknown;
  years?: unknown;
  contributionSalary?: unknown;
  yearsOfService?: unknown;
  sector?: unknown;
}): Validated<PurchaseProfile> {
  const reject: string[] = [];
  const warnings: string[] = [];

  const kind = raw.kind === 'addition' ? 'addition' : raw.kind === 'purchase' ? 'purchase' : null;
  if (!kind) reject.push('Specify whether this is a purchase or an addition of service.');

  const gender = normalizeGender(raw.gender);
  if (!gender) reject.push('Gender is unclear — it must be male or female (ذكر/أنثى).');

  const years = raw.years;
  if (!isNum(years) || years <= 0) reject.push('Number of years to buy/add must be greater than zero. Please correct it.');
  else if (years > MAX_YOS_ABS) reject.push('Number of years looks out of range. Please correct it.');

  const sector: Sector | undefined = raw.sector === 'government' ? 'government' : raw.sector === 'private' ? 'private' : undefined;
  const s = raw.contributionSalary;
  let salary = 0;
  if (!isNum(s) || s <= 0) reject.push('Salary must be a number greater than zero. Please correct it.');
  else {
    salary = s;
    if (sector === 'private' && (s < SALARY_MIN || s > SALARY_MAX)) warnings.push(`Salary ${s} is outside the private-sector range (${SALARY_MIN}–${SALARY_MAX}, Art. 1) — please confirm or correct.`);
  }

  let yos: number | undefined;
  if (raw.yearsOfService !== undefined && raw.yearsOfService !== null && raw.yearsOfService !== '') {
    if (!isNum(raw.yearsOfService) || raw.yearsOfService < 0 || raw.yearsOfService > 60) reject.push('Current years of service looks out of range.');
    else yos = raw.yearsOfService;
  }

  if (reject.length) return { ok: false, reject };
  return { ok: true, value: { kind: kind!, gender: gender!, years: years as number, contributionSalary: salary, yearsOfService: yos }, warnings };
}

/**
 * Full name: letters only (Arabic or Latin), at least two parts, each >= 2.
 * Rejects "idontknow", single tokens, anything with digits/symbols.
 */
export function validateName(name: string): boolean {
  const n = (name ?? '').trim();
  return /^[A-Za-z؀-ۿ]{2,}(?:[\s'’-]+[A-Za-z؀-ۿ]{2,})+$/.test(n);
}

/**
 * Normalize+validate a UAE mobile: local 05XXXXXXXX or intl +9715XXXXXXXX
 * (with/without 00/971, spaces/dashes). Returns +9715XXXXXXXX or null.
 */
export function normalizeUaeMobile(mobile: string): string | null {
  let d = (mobile ?? '').replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(d)) return null;
  d = d.replace(/^\+/, '').replace(/^00/, '');
  const local = d.startsWith('971') ? d.slice(3) : d;
  if (!/^0?5\d{8}$/.test(local)) return null;
  return '+971' + local.replace(/^0/, '');
}
