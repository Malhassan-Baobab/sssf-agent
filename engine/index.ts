/**
 * Public surface of the deterministic calc engine.
 * The orchestrator imports from here; it never does arithmetic itself.
 */
export * from './types.js';
export { DEFAULT_CONFIG, loadConfig } from './config.js';
export {
  calculate,
  calculatePurchase,
  pensionPercent,
  applyFloor,
  endOfServiceGratuity,
  reward,
  earlyReductionPercent,
  determineEligibility,
} from './calc.js';
export { analyzeRetirement } from './retirement.js';
export type { RetirementInput, RetirementAnalysis, Milestone } from './retirement.js';
export {
  validateProfile,
  validatePurchase,
  normalizeGender,
  validateName,
  normalizeUaeMobile,
} from './validate.js';
export type { Profile, PurchaseProfile, Validated } from './validate.js';
export {
  normalizeText,
  parseYesNo,
  parseGender,
  parseResignIntent,
  extractNumber,
} from './normalize.js';
export { classifyIntent } from './intent.js';
export type { Intent, IntentResult } from './intent.js';
export {
  emptyState,
  interpretReply,
  applyGenderSelfCorrection,
  setSlot,
  QUESTIONS,
} from './slots.js';
export type { SlotState, PendingQuestion, Interpretation } from './slots.js';
