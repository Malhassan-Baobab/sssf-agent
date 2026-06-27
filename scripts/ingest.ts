/**
 * ingest.ts
 * Reads a corpus/clean/*.jsonl file, embeds each chunk via OpenAI,
 * and upserts into Supabase law_chunks.
 *
 * Usage:
 *   npx tsx scripts/ingest.ts \
 *     --jsonl corpus/clean/law_5_2018_ar.jsonl \
 *     --doc-title-ar "قانون رقم 5 لسنة 2018 بشأن الضمان الاجتماعي" \
 *     --doc-title-en "Social Security Law No. 5 of 2018" \
 *     --doc-type law \
 *     --effective-date 2018-01-01
 *
 * Requires .env with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   OPENAI_API_KEY, EMBEDDING_MODEL, EMBEDDING_DIM.
 */

import 'dotenv/config';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import type { LawChunk } from './chunk-law.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-large';
const EMBEDDING_DIM = parseInt(process.env.EMBEDDING_DIM ?? '1536', 10);
const BATCH_SIZE = 20; // chunks per embedding call

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
  }
  return args;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const resp = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIM,
  });
  return resp.data.map((d) => d.embedding);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function ingest(opts: {
  jsonlPath: string;
  docKey: string;
  titleAr: string;
  titleEn: string;
  docType: string;
  effectiveDate: string;
  language: string;
}): Promise<void> {
  const { jsonlPath, docKey, titleAr, titleEn, docType, effectiveDate, language } = opts;

  // 1. Upsert source_document row
  const { data: docRow, error: docErr } = await supabase
    .from('source_documents')
    .upsert(
      {
        doc_key: docKey,
        title_ar: titleAr,
        title_en: titleEn,
        doc_type: docType,
        authority: titleAr,
        version: 'v1',
        effective_date: effectiveDate || null,
        language,
        source_path: jsonlPath,
      },
      { onConflict: 'doc_key' }
    )
    .select('id')
    .single();

  if (docErr) throw new Error(`source_documents upsert failed: ${docErr.message}`);
  const documentId: number = docRow!.id;
  console.log(`source_documents id=${documentId} (${docKey})`);

  // 2. Load chunks
  const raw = fs.readFileSync(jsonlPath, 'utf8');
  const chunks: LawChunk[] = raw
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  console.log(`Loaded ${chunks.length} chunks from ${jsonlPath}`);

  // 3. Delete old chunks for this document (re-ingest is idempotent)
  const { error: delErr } = await supabase
    .from('law_chunks')
    .delete()
    .eq('document_id', documentId);
  if (delErr) console.warn('Delete old chunks warning:', delErr.message);

  // 4. Embed + insert in batches
  let inserted = 0;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(
      (c) => `${c.citation}\n${c.article_title ?? ''}\n${c.content}`.trim()
    );

    let embeddings: number[][];
    try {
      embeddings = await embedBatch(texts);
    } catch (err: unknown) {
      console.error(`Embedding batch ${i}–${i + batch.length} failed:`, err);
      await sleep(3000);
      embeddings = await embedBatch(texts); // one retry
    }

    const rows = batch.map((c, j) => ({
      document_id: documentId,
      chapter_no: c.chapter_no,
      chapter_title: c.chapter_title,
      article_no: c.article_no,
      article_title: c.article_title,
      clause: c.clause,
      language: c.language,
      content: c.content,
      citation: c.citation,
      version: c.version,
      token_count: Math.ceil(texts[j].length / 4), // rough estimate
      embedding: `[${embeddings[j].join(',')}]`,
    }));

    const { error: insErr } = await supabase.from('law_chunks').insert(rows);
    if (insErr) throw new Error(`Insert batch ${i} failed: ${insErr.message}`);

    inserted += batch.length;
    process.stdout.write(`\r  Embedded & inserted ${inserted}/${chunks.length}…`);
    await sleep(200); // respect rate limits
  }

  console.log(`\nDone. ${inserted} chunks ingested for ${docKey}.`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const args = parseArgs();
const jsonlPath = args['jsonl'];
const docKey = args['doc-key'] ?? jsonlPath?.replace(/^.*\//, '').replace('.jsonl', '');

if (!jsonlPath) {
  console.error('--jsonl <path> is required');
  process.exit(1);
}

ingest({
  jsonlPath,
  docKey,
  titleAr: args['doc-title-ar'] ?? docKey,
  titleEn: args['doc-title-en'] ?? '',
  docType: args['doc-type'] ?? 'law',
  effectiveDate: args['effective-date'] ?? '',
  language: args['lang'] ?? (jsonlPath.includes('_en') ? 'en' : 'ar'),
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
