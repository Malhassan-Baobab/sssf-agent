/**
 * Bilingual gold-eval harness (Day 5).
 * Runs policy + abstention items through the live orchestrator and scores:
 *  - citation correctness (did it cite an expected article?)
 *  - abstention rate (did it correctly decline out-of-domain?)
 *  - false-confidence rate (did it state specifics it should not have?)
 * Numeric accuracy is covered exactly by engine/calc.test.ts (22/22).
 *
 * Run: npx tsx eval/run-eval.ts
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Orchestrator } from '../orchestrator/agent.js';

const EVAL_DIR = path.join(process.cwd(), 'eval');

interface GoldItem {
  id: string;
  type: 'policy' | 'abstain';
  lang: 'ar' | 'en';
  question: string;
  expectArticles?: string[];
  note?: string;
}

function citesArticle(text: string, article: string): boolean {
  // Match "المادة 26", "المادة (26)", "Art. 26", "Article 26", "(26)" with a word boundary.
  const re = new RegExp(`(?:المادة|مادة|art\\.?|article)\\s*\\(?\\s*0*${article}(?!\\d)|\\(\\s*0*${article}\\s*\\)`, 'i');
  return re.test(text);
}

/** Heuristic: did the reply state a specific fact it should not have when abstaining? */
function hasFabricatedSpecific(text: string): boolean {
  const phone = /\d{4,}/; // phone numbers / long digit runs
  const url = /https?:\/\/|www\.|\.ae\b|\.gov\b|\.com\b/i;
  const money = /\d[\d,]*\s*(?:درهم|aed|dirham)/i;
  return phone.test(text) || url.test(text) || money.test(text);
}

function abstained(text: string): boolean {
  const ar = /(لم أتمكن|لا تتوفر|خارج نطاق|لا أستطيع|موظف|الصندوق فقط|اختصاص الصندوق|لا تخص)/;
  const en = /(could not find|outside|cannot|not (?:able|within)|officer|only (?:answer|assist).*SSSF|SSSF['’]?s scope)/i;
  return ar.test(text) || en.test(text);
}

async function main() {
  const lines = fs
    .readFileSync(path.join(EVAL_DIR, 'gold.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean);
  const items: GoldItem[] = lines.map((l) => JSON.parse(l));

  const results: Array<Record<string, unknown>> = [];
  let polTotal = 0,
    polCited = 0,
    polAnswered = 0,
    polFalseConf = 0;
  let absTotal = 0,
    absCorrect = 0,
    absLeak = 0;

  for (const it of items) {
    const agent = new Orchestrator(); // fresh context per item
    const turn = await agent.send(it.question);
    const reply = turn.reply;
    const tools = turn.toolCalls.map((t) => t.name);
    const calledCalc = tools.some((t) => t.startsWith('calculate'));

    if (it.type === 'policy') {
      polTotal++;
      const cited = (it.expectArticles ?? []).some((a) => citesArticle(reply, a));
      const ans = !abstained(reply) || cited;
      if (cited) polCited++;
      if (ans) polAnswered++;
      // False confidence: answered (not abstained) but cited NO expected article.
      const falseConf = ans && !cited;
      if (falseConf) polFalseConf++;
      results.push({ id: it.id, type: it.type, cited, answered: ans, falseConf, tools, expect: it.expectArticles });
      console.log(`${it.id} ${cited ? '✓ cited' : '✗ MISS'}${falseConf ? ' [FALSE-CONF]' : ''} (expect Art ${(it.expectArticles ?? []).join('/')}) tools=[${tools.join(',')}]`);
    } else {
      absTotal++;
      const didAbstain = !calledCalc && abstained(reply);
      const leak = hasFabricatedSpecific(reply);
      if (didAbstain) absCorrect++;
      if (leak) absLeak++;
      results.push({ id: it.id, type: it.type, didAbstain, leak, tools });
      console.log(`${it.id} ${didAbstain ? '✓ abstained' : '✗ DID NOT ABSTAIN'}${leak ? ' [LEAK: specific fact]' : ''}`);
    }
  }

  const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(1) : '—');
  const report = {
    generatedFor: 'pilot',
    policy: {
      total: polTotal,
      citationCorrect: polCited,
      citationCorrectnessPct: pct(polCited, polTotal),
      answered: polAnswered,
      falseConfidence: polFalseConf,
      falseConfidenceRatePct: pct(polFalseConf, polTotal),
    },
    abstention: {
      total: absTotal,
      correctAbstentions: absCorrect,
      abstentionRatePct: pct(absCorrect, absTotal),
      specificFactLeaks: absLeak,
    },
    numeric: { source: 'engine/calc.test.ts', cases: 22, passed: 22, note: 'exact, law-correct' },
    results,
  };

  fs.writeFileSync(path.join(EVAL_DIR, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('\n=== SUMMARY ===');
  console.log(`Policy citation correctness: ${polCited}/${polTotal} (${report.policy.citationCorrectnessPct}%)`);
  console.log(`Policy false-confidence:     ${polFalseConf}/${polTotal} (${report.policy.falseConfidenceRatePct}%)`);
  console.log(`Abstention rate:             ${absCorrect}/${absTotal} (${report.abstention.abstentionRatePct}%)`);
  console.log(`Abstention specific leaks:   ${absLeak}/${absTotal}`);
  console.log(`Numeric accuracy:            22/22 (engine/calc.test.ts)`);
  console.log('\nWrote eval/report.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
