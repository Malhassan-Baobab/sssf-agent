/**
 * The orchestrator agent loop. Runs the Anthropic tool-use cycle: the model
 * decides when to search policy or call the calc engine; we execute tools and
 * feed results back until it produces a final answer.
 */
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from './systemPrompt.js';
import { toolDefs, executeTool, type ToolContext } from './tools.js';
import { Retriever } from './retriever.js';
import { parseYesNo, parseGender, extractNumber } from '../engine/normalize.js';
import { classifyIntent } from '../engine/intent.js';

const MODEL = process.env.ORCHESTRATOR_MODEL ?? 'claude-sonnet-4-6';
const MAX_TOOL_ITERATIONS = 6;

/**
 * Deterministic parse of the latest user message. This is AUTHORITATIVE for the
 * critical slots — the model must use these canonical values and must never set
 * the user's gender from a pronoun or an ambiguous token.
 */
function buildParseHint(msg: string): string {
  const yn = parseYesNo(msg);
  const g = parseGender(msg);
  const n = extractNumber(msg);
  const intent = classifyIntent(msg);
  return [
    "# Deterministic parse of the user's latest message (AUTHORITATIVE — use these, do not re-interpret):",
    `- classified intent: ${intent.intent ?? 'unclear'}${intent.confident ? '' : ' (low confidence — confirm with the user before acting)'}`,
    `- yes/no value: ${yn ?? 'not a yes/no token'}`,
    `- explicit gender word: ${g ?? 'NONE — the message has no gender word; do NOT infer gender from it'}`,
    `- number: ${n ?? 'none'}`,
    "RULES: 'هي'/'هو' mean YES (affirmation), never 'she'/a gender. Set the user's gender ONLY from an explicit first-person gender word; never from a pronoun, a yes/no, or a number. Gender is sticky — once set, keep it unless the user explicitly self-corrects (e.g. 'أنا ذكر/أنثى').",
  ].join('\n');
}

export interface AgentTurn {
  reply: string;
  toolCalls: Array<{ name: string; input: unknown; result?: string }>;
}

export class Orchestrator {
  private client: Anthropic;
  private ctx: ToolContext;
  private history: Anthropic.MessageParam[] = [];

  constructor(client?: Anthropic, retriever?: Retriever) {
    this.client =
      client ??
      new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        // Auto-retry transient API errors (429/5xx/overloaded/timeouts) with
        // backoff, and fail a hung request fast so the retry can fire within
        // the serverless time budget.
        maxRetries: 3,
        timeout: 25_000,
      });
    this.ctx = { retriever: retriever ?? new Retriever() };
  }

  /** Send one user message; returns the assistant's final text for this turn. */
  async send(userMessage: string): Promise<AgentTurn> {
    this.history.push({ role: 'user', content: userMessage });
    const toolCalls: AgentTurn['toolCalls'] = [];
    // Abuse metric hook: log the EVENT only (no message content, no PII).
    if (classifyIntent(userMessage).intent === 'abuse') {
      console.warn(`[metric] abuse_event turn=${this.history.filter((m) => m.role === 'user').length}`);
    }
    // Deterministic parse of THIS turn's message, injected as authoritative context.
    const systemForTurn = SYSTEM_PROMPT + '\n\n' + buildParseHint(userMessage);

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const resp = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system: systemForTurn,
        tools: toolDefs,
        messages: this.history,
      });

      this.history.push({ role: 'assistant', content: resp.content });

      const toolUses = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      if (resp.stop_reason !== 'tool_use' || toolUses.length === 0) {
        const text = resp.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        return { reply: text, toolCalls };
      }

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const out = await executeTool(tu.name, tu.input as Record<string, unknown>, this.ctx);
        toolCalls.push({ name: tu.name, input: tu.input, result: out });
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
      }
      this.history.push({ role: 'user', content: results });
    }

    return {
      reply:
        'عذراً، لم أتمكن من إكمال الطلب. يرجى التواصل مع موظف الصندوق. / Sorry, I could not complete this — please contact an SSSF officer.',
      toolCalls,
    };
  }

  reset(): void {
    this.history = [];
  }

  /** Load prior conversation state (for stateless/serverless use). */
  hydrate(history: Anthropic.MessageParam[]): void {
    this.history = history;
  }

  /** Current conversation state, to persist between serverless invocations. */
  getHistory(): Anthropic.MessageParam[] {
    return this.history;
  }
}
