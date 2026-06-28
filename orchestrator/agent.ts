/**
 * The orchestrator agent loop. Runs the Anthropic tool-use cycle: the model
 * decides when to search policy or call the calc engine; we execute tools and
 * feed results back until it produces a final answer.
 */
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from './systemPrompt.js';
import { toolDefs, executeTool, type ToolContext } from './tools.js';
import { Retriever } from './retriever.js';

const MODEL = process.env.ORCHESTRATOR_MODEL ?? 'claude-sonnet-4-6';
const MAX_TOOL_ITERATIONS = 6;

export interface AgentTurn {
  reply: string;
  toolCalls: Array<{ name: string; input: unknown }>;
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

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const resp = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
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
        toolCalls.push({ name: tu.name, input: tu.input });
        const out = await executeTool(tu.name, tu.input as Record<string, unknown>, this.ctx);
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
