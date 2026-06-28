/**
 * ingest-faq.ts — embed the FAQ fast-path and auto-link each Q&A to its top
 * matching law article (stored in article_refs) so FAQ answers stay cited.
 *
 * Usage: npx tsx scripts/ingest-faq.ts [--jsonl corpus/clean/faq.jsonl]
 */
import 'dotenv/config';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-large';
const EMBEDDING_DIM = parseInt(process.env.EMBEDDING_DIM ?? '1536', 10);

interface FaqRow {
  question_ar: string;
  answer_ar: string;
}

async function main() {
  const jsonlArg = process.argv.indexOf('--jsonl');
  const jsonlPath = jsonlArg > -1 ? process.argv[jsonlArg + 1] : 'corpus/clean/faq.jsonl';

  const rows: FaqRow[] = fs
    .readFileSync(jsonlPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  console.log(`Loaded ${rows.length} FAQ rows.`);

  // Clear prior FAQ (idempotent re-ingest)
  await supabase.from('faq').delete().neq('id', 0);

  let done = 0;
  for (const r of rows) {
    const emb = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: [`${r.question_ar}\n${r.answer_ar}`],
      dimensions: EMBEDDING_DIM,
    });
    const vec = `[${emb.data[0].embedding.join(',')}]`;

    // Auto-link: top article for this question becomes the citation.
    const { data: matches } = await supabase.rpc('match_law_chunks', {
      query_embedding: vec,
      match_count: 2,
    });
    const refs: string[] = (matches ?? [])
      .filter((m: { similarity: number }) => m.similarity > 0.4)
      .map((m: { citation: string }) => m.citation);

    const { error } = await supabase.from('faq').insert({
      question_ar: r.question_ar,
      answer_ar: r.answer_ar,
      article_refs: refs,
      language: 'ar',
      embedding: vec,
    });
    if (error) throw new Error(`FAQ insert failed: ${error.message}`);

    done++;
    process.stdout.write(`\r  Ingested ${done}/${rows.length}…`);
    await new Promise((res) => setTimeout(res, 150));
  }
  console.log(`\nDone. ${done} FAQ rows ingested with auto-linked citations.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
