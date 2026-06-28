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
