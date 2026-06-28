/**
 * The typed tool boundary. The orchestrator can ONLY affect the world through
 * these tools: retrieve cited policy text, or run a deterministic calculation.
 * Schema-constrained I/O means the model cannot smuggle a number into a result.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { calculate, calculatePurchase } from '../engine/index.js';
import type { CalcInput, PurchaseInput } from '../engine/index.js';
import { Retriever } from './retriever.js';

export const toolDefs: Anthropic.Tool[] = [
  {
    name: 'search_policy',
    description:
      'Search the SSSF legal corpus (Law 5/2018) and FAQ for an answer. Returns cited article text plus cross-referenced articles and linked services. Use this for ANY question about rules, eligibility, beneficiaries, contributions, definitions, or procedures. Never answer a policy question without calling this first.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The user question, in Arabic or English.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'calculate_pension_or_eos',
    description:
      'Deterministically compute pension, end-of-service gratuity, early-retirement reduced pension, and reward. Call ONLY after collecting and reading back the inputs to the user. Returns amounts with the law articles applied. Do not compute any amount yourself.',
    input_schema: {
      type: 'object',
      properties: {
        caseType: {
          type: 'string',
          enum: ['resignation', 'retirement_age', 'death', 'total_disability', 'unfit', 'dismissal', 'other'],
          description: 'Reason service ended (Art. 19).',
        },
        gender: { type: 'string', enum: ['male', 'female'] },
        age: { type: 'number', description: 'Age in years.' },
        yearsOfService: { type: 'number', description: 'Contribution years (incl. added/purchased).' },
        contributionSalary: { type: 'number', description: 'راتب حساب المعاش, monthly AED.' },
        hasChildrenUnder18: { type: 'boolean', description: 'Female resignation case (Art. 19 ه).' },
        isWorkInjury: { type: 'boolean', description: 'Work-injury death/disability (Art. 22).' },
      },
      required: ['caseType', 'gender', 'age', 'yearsOfService', 'contributionSalary'],
    },
  },
  {
    name: 'calculate_purchase_or_addition',
    description:
      'Deterministically compute the cost of purchasing nominal service (Art. 20) or adding prior service (Art. 6/7). Call ONLY after reading back the inputs. Returns cost and eligibility with citations.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['purchase', 'addition'] },
        contributionSalary: { type: 'number', description: 'Monthly AED.' },
        years: { type: 'number', description: 'Years to purchase or add.' },
        gender: { type: 'string', enum: ['male', 'female'] },
        yearsOfService: { type: 'number', description: 'Current service years (purchase eligibility needs >= 20).' },
      },
      required: ['kind', 'contributionSalary', 'years', 'gender'],
    },
  },
];

export interface ToolContext {
  retriever: Retriever;
}

/** Execute a tool call and return the JSON-stringified result for the model. */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  switch (name) {
    case 'search_policy': {
      const bundle = await ctx.retriever.retrieve(String(input.query));
      if (!bundle.confident) {
        return JSON.stringify({
          confident: false,
          message:
            'No sufficiently relevant article was found in the corpus. Abstain and offer to connect a human officer.',
          topSimilarity: bundle.topSimilarity,
        });
      }
      return JSON.stringify({
        confident: true,
        articles: bundle.chunks.map((c) => ({
          citation: c.citation,
          articleTitle: c.articleTitle,
          clause: c.clause,
          content: c.content,
          via: c.via,
        })),
        faq: bundle.faq.map((f) => ({ q: f.question, a: f.answer, refs: f.articleRefs })),
        relatedServices: bundle.services,
      });
    }

    case 'calculate_pension_or_eos': {
      const result = calculate(input as unknown as CalcInput);
      return JSON.stringify(result);
    }

    case 'calculate_purchase_or_addition': {
      const result = calculatePurchase(input as unknown as PurchaseInput);
      return JSON.stringify(result);
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
