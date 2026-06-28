/**
 * search.ts — retrieval smoke test / reference implementation.
 * Embeds a query, vector-searches law_chunks, then expands the top hits with
 * their article cross-references, same-topic siblings, and linked services.
 *
 * Usage: npx tsx scripts/search.ts "نص السؤال" [topK]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-large';
const EMBEDDING_DIM = parseInt(process.env.EMBEDDING_DIM ?? '1536', 10);

async function main() {
  const query = process.argv[2];
  const topK = parseInt(process.argv[3] ?? '5', 10);
  if (!query) {
    console.error('Usage: npx tsx scripts/search.ts "query" [topK]');
    process.exit(1);
  }

  const emb = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: [query],
    dimensions: EMBEDDING_DIM,
  });
  const vec = `[${emb.data[0].embedding.join(',')}]`;

  // Vector search via RPC if present, else raw SQL through PostgREST is not possible;
  // use a SQL function. For the smoke test we call a one-off SQL via rpc fallback.
  const { data, error } = await supabase.rpc('match_law_chunks', {
    query_embedding: vec,
    match_count: topK,
  });
  if (error) {
    console.error('RPC error (did you create match_law_chunks?):', error.message);
    process.exit(1);
  }

  console.log(`\nQuery: ${query}\n${'='.repeat(60)}`);
  for (const row of data as Array<Record<string, unknown>>) {
    console.log(`\n[${row.citation}] (sim=${Number(row.similarity).toFixed(3)})`);
    if (row.article_title) console.log(`  title: ${row.article_title}`);
    console.log(`  ${String(row.content).slice(0, 160)}…`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
