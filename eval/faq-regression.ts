/**
 * FAQ regression — run all 40 official Q&A through the live agent and compare
 * each answer to the reference answer (Questions_and_Answers.xlsx) with an
 * LLM judge. Flags any factual contradiction or missing citation.
 *
 * Run: npx tsx eval/faq-regression.ts [limit]
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { Orchestrator } from '../orchestrator/agent.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 3 });
const JUDGE_MODEL = process.env.ORCHESTRATOR_MODEL ?? 'claude-sonnet-4-6';

interface Faq {
  question_ar: string;
  answer_ar: string;
}

interface Verdict {
  consistent: boolean;
  citesArticle: boolean;
  concise: boolean;
  issue: string;
}

async function judge(question: string, reference: string, agentAnswer: string): Promise<Verdict> {
  const prompt = `You are auditing an SSSF pension assistant against the official reference answer.

QUESTION: ${question}

OFFICIAL REFERENCE ANSWER: ${reference}

ASSISTANT ANSWER: ${agentAnswer}

Judge strictly on facts, leniently on wording. Return ONLY a JSON object:
{"consistent": <true if the assistant answer contains no factual contradiction with the reference; minor extra correct detail is fine>,
 "citesArticle": <true if the assistant names a law article, e.g. المادة/Art.>,
 "concise": <true if the answer is reasonably direct, not bloated with unnecessary sections>,
 "issue": "<short reason if any field is false, else empty>"}`;
  const resp = await anthropic.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = resp.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { consistent: false, citesArticle: false, concise: false, issue: 'judge parse failure' };
  try {
    return JSON.parse(m[0]) as Verdict;
  } catch {
    return { consistent: false, citesArticle: false, concise: false, issue: 'judge JSON error' };
  }
}

async function main() {
  const limit = process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;
  const faqs: Faq[] = fs
    .readFileSync(path.join(process.cwd(), 'corpus/clean/faq.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .slice(0, limit);

  let consistent = 0,
    cited = 0,
    conciseN = 0;
  const flags: string[] = [];
  const rows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < faqs.length; i++) {
    const f = faqs[i];
    const agent = new Orchestrator();
    const turn = await agent.send(f.question_ar);
    const v = await judge(f.question_ar, f.answer_ar, turn.reply);
    if (v.consistent) consistent++;
    if (v.citesArticle) cited++;
    if (v.concise) conciseN++;
    const id = `FAQ${String(i + 1).padStart(2, '0')}`;
    rows.push({ id, q: f.question_ar, ...v, answer: turn.reply });
    const mark = v.consistent && v.citesArticle ? '✓' : '✗';
    console.log(`${mark} ${id} consistent=${v.consistent} cites=${v.citesArticle} concise=${v.concise} ${v.issue ? '| ' + v.issue : ''}`);
    if (!v.consistent || !v.citesArticle) flags.push(`${id}: ${f.question_ar}\n     issue: ${v.issue}\n     agent: ${turn.reply.replace(/\n+/g, ' ').slice(0, 200)}`);
  }

  const n = faqs.length;
  const pct = (x: number) => ((100 * x) / n).toFixed(1);
  fs.writeFileSync(path.join(process.cwd(), 'eval/faq-report.json'), JSON.stringify({ n, consistent, cited, conciseN, rows }, null, 2));
  console.log(`\n=== FAQ REGRESSION (${n}) ===`);
  console.log(`Factually consistent with reference: ${consistent}/${n} (${pct(consistent)}%)`);
  console.log(`Cites an article:                    ${cited}/${n} (${pct(cited)}%)`);
  console.log(`Concise/direct:                      ${conciseN}/${n} (${pct(conciseN)}%)`);
  if (flags.length) {
    console.log(`\n--- ${flags.length} flagged ---`);
    flags.forEach((f) => console.log(f));
  }
  console.log('\nWrote eval/faq-report.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
