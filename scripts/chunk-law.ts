/**
 * chunk-law.ts
 * Reads a clean Arabic/English law .docx, splits by article/clause,
 * and writes a JSONL file to corpus/clean/ ready for embedding.
 *
 * Usage:
 *   npx tsx scripts/chunk-law.ts \
 *     --file "corpus/raw/قانون الضمان بالعناوين.docx" \
 *     --doc-key law_5_2018_ar \
 *     --lang ar \
 *     --authority "Law 5/2018" \
 *     --out corpus/clean/law_5_2018_ar.jsonl
 */

import * as fs from 'fs';
import * as path from 'path';
import mammoth from 'mammoth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LawChunk {
  doc_key: string;
  language: string;
  authority: string;
  chapter_no: string | null;
  chapter_title: string | null;
  article_no: string | null;
  article_title: string | null;
  clause: string | null;
  content: string;
  citation: string;
  version: string;
}

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

/**
 * Very light Arabic article detection.
 * Matches: "المادة (19)" / "مادة (19)" / "المادة 19" / "مادة 19"
 * Returns { no: '19', title: rest_of_line } or null.
 */
function parseArticleLine(line: string): { no: string; title: string } | null {
  const m = line.match(/(?:المادة|مادة)\s*[\(（]?(\d+)[\)）]?\s*[:\-–]?\s*(.*)/u);
  if (m) return { no: m[1].trim(), title: m[2].trim() };
  return null;
}

/**
 * English article: "Article 19" / "Article (19)" / "Art. 19"
 */
function parseArticleLineEn(line: string): { no: string; title: string } | null {
  const m = line.match(/(?:Article|Art\.?)\s*[\(（]?(\d+)[\)）]?\s*[:\-–]?\s*(.*)/i);
  if (m) return { no: m[1].trim(), title: m[2].trim() };
  return null;
}

/**
 * Arabic chapter: "الفصل الأول" / "الباب الأول"
 * English chapter: "Chapter 1" / "Part I"
 */
function parseChapterLine(line: string): { no: string; title: string } | null {
  const arM = line.match(/(?:الفصل|الباب|القسم)\s+(\S+)\s*(.*)/u);
  if (arM) return { no: arM[1].trim(), title: arM[2].trim() };
  const enM = line.match(/(?:Chapter|Part|Section)\s+(\S+)\s*(.*)/i);
  if (enM) return { no: enM[1].trim(), title: enM[2].trim() };
  return null;
}

// ---------------------------------------------------------------------------
// Main chunker
// ---------------------------------------------------------------------------

async function chunkLaw(opts: {
  filePath: string;
  docKey: string;
  lang: string;
  authority: string;
  outPath: string;
  version?: string;
}): Promise<void> {
  const { filePath, docKey, lang, authority, outPath, version = 'v1' } = opts;

  console.log(`Reading ${filePath} …`);
  const result = await mammoth.extractRawText({ path: filePath });
  if (result.messages.length) {
    console.warn('Mammoth warnings:', result.messages);
  }

  const lines = result.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const chunks: LawChunk[] = [];
  let currentChapterNo: string | null = null;
  let currentChapterTitle: string | null = null;
  let currentArticleNo: string | null = null;
  let currentArticleTitle: string | null = null;
  let buffer: string[] = [];

  const isAr = lang === 'ar';
  const parseArt = isAr ? parseArticleLine : parseArticleLineEn;

  function flushArticle() {
    if (!currentArticleNo || buffer.length === 0) return;
    const content = buffer.join('\n').trim();
    if (!content) return;
    const citation = `${authority}, Art. ${currentArticleNo}`;
    chunks.push({
      doc_key: docKey,
      language: lang,
      authority,
      chapter_no: currentChapterNo,
      chapter_title: currentChapterTitle,
      article_no: currentArticleNo,
      article_title: currentArticleTitle,
      clause: null,
      content,
      citation,
      version,
    });
    buffer = [];
  }

  for (const line of lines) {
    const chapter = parseChapterLine(line);
    if (chapter) {
      flushArticle();
      currentChapterNo = chapter.no;
      currentChapterTitle = chapter.title;
      currentArticleNo = null;
      currentArticleTitle = null;
      continue;
    }

    const article = parseArt(line);
    if (article) {
      flushArticle();
      currentArticleNo = article.no;
      currentArticleTitle = article.title || null;
      continue;
    }

    if (currentArticleNo) {
      buffer.push(line);
    }
  }
  flushArticle();

  console.log(`Extracted ${chunks.length} article chunks.`);

  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const jsonl = chunks.map((c) => JSON.stringify(c)).join('\n');
  fs.writeFileSync(outPath, jsonl, 'utf8');
  console.log(`Written → ${outPath}`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const args = parseArgs();
const required = ['file', 'doc-key', 'lang', 'authority', 'out'];
const missing = required.filter((k) => !args[k]);
if (missing.length) {
  console.error(`Missing args: ${missing.map((k) => `--${k}`).join(', ')}`);
  process.exit(1);
}

chunkLaw({
  filePath: args['file'],
  docKey: args['doc-key'],
  lang: args['lang'],
  authority: args['authority'],
  outPath: args['out'],
  version: args['version'] ?? 'v1',
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
