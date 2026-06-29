/**
 * The typed tool boundary. The orchestrator can ONLY affect the world through
 * these tools: retrieve cited policy text, or run a deterministic calculation.
 * Schema-constrained I/O means the model cannot smuggle a number into a result.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { calculate, calculatePurchase, analyzeRetirement } from '../engine/index.js';
import { validateCalcInput, validatePurchaseInput, validateRetirementInput } from '../engine/validate.js';
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
  {
    name: 'analyze_retirement',
    description:
      "Retirement-eligibility PLANNER for a person who is still working. Use this when the user asks 'when can I retire', whether they qualify, or gives their gender/age/years (and optionally salary) WITHOUT saying their service already ended. Returns: whether they qualify for a pension today, the earliest dates/ages they qualify (and what's blocking it), what happens at retirement age, and whether buying nominal service helps. Use calculate_pension_or_eos instead only when the person's service has ALREADY ended and they want the final figure.",
    input_schema: {
      type: 'object',
      properties: {
        gender: { type: 'string', enum: ['male', 'female'] },
        age: { type: 'number', description: 'Current age in years.' },
        yearsOfService: { type: 'number', description: 'Current contribution years so far.' },
        contributionSalary: { type: 'number', description: 'Optional monthly salary, for an amount illustration.' },
        hasChildrenUnder18: { type: 'boolean', description: 'For women (Art. 19 ه path).' },
      },
      required: ['gender', 'age', 'yearsOfService'],
    },
  },
  {
    name: 'raise_support_request',
    description:
      "Create a callback request so an SSSF officer contacts the user. Use ONLY when you cannot answer/help from the corpus or tools AND the user has agreed to be contacted. Collect the user's full name and mobile number first (both REQUIRED). Do not call this for questions you can already answer.",
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "User's full name (required)." },
        mobile: { type: 'string', description: 'Mobile number (required).' },
        email: { type: 'string', description: 'Email (optional).' },
        topic: { type: 'string', description: 'Short subject of the request.' },
        details: { type: 'string', description: 'What the user needs / their question.' },
      },
      required: ['name', 'mobile'],
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
      const v = validateCalcInput(input);
      if (!v.ok) {
        return JSON.stringify({
          error: 'invalid_input',
          issues: v.issues,
          message: 'One or more inputs look out of range. Ask the user to re-check before computing.',
        });
      }
      return JSON.stringify(calculate(v.value));
    }

    case 'calculate_purchase_or_addition': {
      const v = validatePurchaseInput(input);
      if (!v.ok) {
        return JSON.stringify({
          error: 'invalid_input',
          issues: v.issues,
          message: 'One or more inputs look out of range. Ask the user to re-check before computing.',
        });
      }
      return JSON.stringify(calculatePurchase(v.value));
    }

    case 'analyze_retirement': {
      const v = validateRetirementInput(input);
      if (!v.ok) {
        return JSON.stringify({
          error: 'invalid_input',
          issues: v.issues,
          message: 'One or more inputs look out of range. Ask the user to re-check.',
        });
      }
      return JSON.stringify(analyzeRetirement(v.value));
    }

    case 'raise_support_request': {
      const name = String(input.name ?? '').trim();
      const mobile = String(input.mobile ?? '').trim();
      if (!name || !mobile) {
        return JSON.stringify({
          error: 'missing_contact',
          message: 'Name and mobile number are both required. Ask the user for the missing one before raising the request.',
        });
      }
      const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      const { data, error } = await supabase
        .from('support_request')
        .insert({
          channel: 'agent',
          name,
          mobile,
          email: input.email ? String(input.email) : null,
          topic: input.topic ? String(input.topic) : null,
          details: input.details ? String(input.details) : null,
        })
        .select('id')
        .single();
      if (error) {
        return JSON.stringify({ error: 'save_failed', message: 'Could not save the request. Apologize and suggest trying again later.' });
      }
      return JSON.stringify({
        ok: true,
        reference: `REQ-${data!.id}`,
        message: 'Request saved. Tell the user an officer will contact them, and give them the reference number.',
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
