/**
 * The typed tool boundary. The orchestrator can ONLY affect the world through
 * these tools: retrieve cited policy text, or run a deterministic calculation.
 * Schema-constrained I/O means the model cannot smuggle a number into a result.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { calculate, calculatePurchase, analyzeRetirement } from '../engine/index.js';
import {
  validateProfile,
  validatePurchase,
  validateName,
  normalizeUaeMobile,
} from '../engine/validate.js';
import { Retriever } from './retriever.js';

/** Standard responses when the deterministic validator blocks a calc. */
function rejectResponse(reject: string[]): string {
  return JSON.stringify({
    error: 'invalid_input',
    blocked: true,
    reasons: reject,
    message:
      'The deterministic validator rejected these inputs as impossible — you CANNOT proceed or override this. ' +
      'Tell the user the reason in their language and ask them to CORRECT the value (there is nothing to confirm — it is impossible).',
  });
}
function confirmResponse(warnings: string[]): string {
  return JSON.stringify({
    error: 'needs_confirmation',
    warnings,
    message:
      'Do NOT compute yet. The value is unusual but possible. Relay the warning in the user\'s language and ask them to CONFIRM it is correct or CORRECT it. ' +
      'Only if they confirm, call again with confirmedPlausibility: true.',
  });
}

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
      'Deterministically compute the pension, end-of-service gratuity, and reward. Call ONLY after reading the inputs back and the user confirms. Returns amounts with the law articles applied. Do not compute or estimate any amount yourself, and do not characterise the pension as full or reduced — just present the figure(s) returned with the article.',
    input_schema: {
      type: 'object',
      properties: {
        caseType: {
          type: 'string',
          enum: ['resignation', 'retirement_age', 'death', 'total_disability', 'unfit', 'dismissal', 'other'],
          description: 'Reason service ended (Art. 19).',
        },
        gender: { type: 'string', description: "The user's stated gender, any wording (validated/normalized server-side)." },
        age: { type: 'number', description: 'Age in years.' },
        yearsOfService: { type: 'number', description: 'ACTUAL subscription years only (do NOT add purchased/annexed years here).' },
        purchasedYears: { type: 'number', description: 'Purchased/annexed nominal service (Art. 20), separate from actual years. Optional.' },
        contributionSalary: { type: 'number', description: 'راتب حساب المعاش, monthly AED.' },
        sector: { type: 'string', enum: ['government', 'private'], description: 'Employment sector — needed so private-sector salary bounds apply only to private.' },
        hasChildrenUnder18: { type: 'boolean', description: 'Female resignation case (Art. 19 ه).' },
        isWorkInjury: { type: 'boolean', description: 'Work-injury death/disability (Art. 22).' },
        confirmedPlausibility: { type: 'boolean', description: 'Set true only after the user confirmed a value the validator flagged as unusual.' },
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
        gender: { type: 'string', description: "The user's stated gender, any wording (validated server-side)." },
        yearsOfService: { type: 'number', description: 'Current actual service years (purchase eligibility needs >= 20).' },
        sector: { type: 'string', enum: ['government', 'private'], description: 'Employment sector — private-sector salary bounds apply only to private.' },
        confirmedPlausibility: { type: 'boolean', description: 'Set true only after the user confirmed a flagged value.' },
      },
      required: ['kind', 'contributionSalary', 'years', 'gender'],
    },
  },
  {
    name: 'analyze_retirement',
    description:
      "Retirement-eligibility PLANNER for a person who is still working. Use this when the user asks 'when can I retire', whether they qualify, or gives their gender/age/years WITHOUT saying their service already ended. Returns: whether a pension is payable today, the earliest Art.19 milestones (and the exact years still needed), what happens at retirement age, and whether buying nominal service is available. It returns NO amounts and never labels a pension full/reduced — to give a figure, ask the user and then call calculate_pension_or_eos. Use calculate_pension_or_eos (not this) only when service has ALREADY ended.",
    input_schema: {
      type: 'object',
      properties: {
        gender: { type: 'string', description: "The user's stated gender, any wording (validated server-side)." },
        age: { type: 'number', description: 'Current age in years.' },
        yearsOfService: { type: 'number', description: 'Current contribution years so far.' },
        hasChildrenUnder18: { type: 'boolean', description: 'For women (Art. 19 ه path).' },
        confirmedPlausibility: { type: 'boolean', description: 'Set true only after the user confirmed a flagged value.' },
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
      const v = validateProfile(input);
      if (!v.ok) return rejectResponse(v.reject);
      if (v.warnings.length && input.confirmedPlausibility !== true) return confirmResponse(v.warnings);
      const r = calculate({
        caseType: input.caseType as never,
        gender: v.value.gender,
        age: v.value.age,
        yearsOfService: v.value.yearsOfService,
        purchasedYears: v.value.purchasedYears,
        contributionSalary: v.value.contributionSalary!,
        sector: v.value.sector,
        hasChildrenUnder18: input.hasChildrenUnder18 as boolean | undefined,
        isWorkInjury: input.isWorkInjury as boolean | undefined,
      });
      // Neutral payload — figures + citations only. No full/reduced labels.
      return JSON.stringify({
        monthlyPension: r.monthlyPension,
        earlyReducedPension: r.earlyReducedPension,
        reductionPercent: r.reductionPercent,
        endOfService: r.endOfService,
        reward: r.reward,
        raisedToMinimum: r.raisedToMinimum,
        citations: r.citations.map((c) => `${c.authority}, ${c.article}`),
        present:
          'State the figure(s) plainly with the article(s). Do NOT say full/reduced (معاش كامل/مخفض). ' +
          'If earlyReducedPension is present, the monthly pension is the main figure (paid from the qualifying age); say the amount paid until that age is earlyReducedPension (state it factually, no labels). ' +
          'If raisedToMinimum, you may note it was raised to the legal minimum (Art. 26). Add one short estimate-disclaimer line.',
      });
    }

    case 'calculate_purchase_or_addition': {
      const v = validatePurchase(input);
      if (!v.ok) return rejectResponse(v.reject);
      if (v.warnings.length && input.confirmedPlausibility !== true) return confirmResponse(v.warnings);
      return JSON.stringify(calculatePurchase(v.value));
    }

    case 'analyze_retirement': {
      const v = validateProfile(input);
      if (!v.ok) return rejectResponse(v.reject);
      if (v.warnings.length && input.confirmedPlausibility !== true) return confirmResponse(v.warnings);
      return JSON.stringify(
        analyzeRetirement({
          gender: v.value.gender,
          age: v.value.age,
          yearsOfService: v.value.yearsOfService,
          hasChildrenUnder18: input.hasChildrenUnder18 as boolean | undefined,
        })
      );
    }

    case 'raise_support_request': {
      const name = String(input.name ?? '').trim();
      const mobileRaw = String(input.mobile ?? '').trim();
      const nameOk = validateName(name);
      const mobile = normalizeUaeMobile(mobileRaw);
      if (!nameOk || !mobile) {
        return JSON.stringify({
          error: 'invalid_contact',
          nameValid: nameOk,
          mobileValid: !!mobile,
          message:
            'Do NOT save yet. In the user\'s language, ask again only for the invalid field(s). ' +
            (!nameOk ? 'Name must be the full name (first and last), letters only — re-ask for it. ' : '') +
            (!mobile ? 'Mobile must be a valid UAE number (05XXXXXXXX, or +9715XXXXXXXX) — re-ask for it. ' : ''),
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
