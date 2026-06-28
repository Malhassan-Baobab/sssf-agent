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
