/**
 * Input validation for the calc tool boundary. The orchestrator passes
 * model-supplied inputs here before any computation, so a typo or an
 * out-of-range value becomes a clarifying question instead of a garbage number.
 * Bounds are deliberately permissive — they catch nonsense, not edge cases.
 */
import { z } from 'zod';

export const calcInputSchema = z.object({
  caseType: z.enum(['resignation', 'retirement_age', 'death', 'total_disability', 'unfit', 'dismissal', 'other']),
  gender: z.enum(['male', 'female']),
  age: z.number().int('Age must be a whole number.').min(18, 'Age must be at least 18.').max(120, 'Age looks out of range.'),
  yearsOfService: z.number().min(0, 'Years of service cannot be negative.').max(60, 'Years of service looks out of range.'),
  contributionSalary: z
    .number()
    .positive('Salary must be greater than zero.')
    .max(500000, 'Salary looks out of range — please re-check.'),
  hasChildrenUnder18: z.boolean().optional(),
  isWorkInjury: z.boolean().optional(),
});

export const purchaseInputSchema = z.object({
  kind: z.enum(['purchase', 'addition']),
  contributionSalary: z.number().positive('Salary must be greater than zero.').max(500000, 'Salary looks out of range.'),
  years: z.number().positive('Years must be greater than zero.').max(40, 'Years looks out of range.'),
  gender: z.enum(['male', 'female']),
  yearsOfService: z.number().min(0).max(60).optional(),
});

export const retirementInputSchema = z.object({
  gender: z.enum(['male', 'female']),
  age: z.number().int('Age must be a whole number.').min(18, 'Age must be at least 18.').max(120, 'Age looks out of range.'),
  yearsOfService: z.number().min(0, 'Years of service cannot be negative.').max(60, 'Years of service looks out of range.'),
  contributionSalary: z.number().positive().max(500000).optional(),
  hasChildrenUnder18: z.boolean().optional(),
});

export interface ValidationFailure {
  ok: false;
  issues: string[];
}
export interface ValidationOk<T> {
  ok: true;
  value: T;
}

export function validateCalcInput(input: unknown): ValidationOk<z.infer<typeof calcInputSchema>> | ValidationFailure {
  const r = calcInputSchema.safeParse(input);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, issues: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}

export function validatePurchaseInput(
  input: unknown
): ValidationOk<z.infer<typeof purchaseInputSchema>> | ValidationFailure {
  const r = purchaseInputSchema.safeParse(input);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, issues: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}

export function validateRetirementInput(
  input: unknown
): ValidationOk<z.infer<typeof retirementInputSchema>> | ValidationFailure {
  const r = retirementInputSchema.safeParse(input);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, issues: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}

/**
 * Validate a person's full name: letters only (Arabic or Latin), at least two
 * parts (first + last), each >= 2 letters. Rejects placeholders like
 * "idontknow", single tokens, and anything with digits/symbols.
 */
export function validateName(name: string): boolean {
  const n = (name ?? '').trim();
  return /^[A-Za-z؀-ۿ]{2,}(?:[\s'’-]+[A-Za-z؀-ۿ]{2,})+$/.test(n);
}

/**
 * Normalize and validate a UAE mobile number. Accepts local (05XXXXXXXX) or
 * international (+9715XXXXXXXX / 009715XXXXXXXX / 9715XXXXXXXX), with spaces,
 * dashes, parentheses. Returns the canonical +9715XXXXXXXX, or null if invalid.
 * Rejects "1234", letters, and wrong-length numbers.
 */
export function normalizeUaeMobile(mobile: string): string | null {
  let d = (mobile ?? '').replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(d)) return null; // contains letters/symbols
  d = d.replace(/^\+/, '').replace(/^00/, '');
  const local = d.startsWith('971') ? d.slice(3) : d;
  // local must be 05XXXXXXXX (10) or 5XXXXXXXX (9): optional 0, then 5 + 8 digits.
  if (!/^0?5\d{8}$/.test(local)) return null;
  return '+971' + local.replace(/^0/, '');
}
