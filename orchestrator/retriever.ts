/**
 * Retriever — the Policy RAG boundary.
 * Embeds a query, vector-searches law + FAQ, then EXPANDS the top hits via the
 * knowledge graph (article cross-references, same-topic siblings, linked
 * services) so dependent articles surface together. Applies a confidence
 * threshold so the orchestrator can abstain.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-large';
const EMBEDDING_DIM = parseInt(process.env.EMBEDDING_DIM ?? '1536', 10);

/** Below this top similarity, retrieval is considered a miss → abstain. */
export const CONFIDENCE_THRESHOLD = 0.35;

export interface RetrievedChunk {
  citation: string;
  articleNo: string | null;
  articleTitle: string | null;
  clause: string | null;
  content: string;
  similarity: number;
  via: 'vector' | 'xref' | 'topic';
}

export interface RetrievedFaq {
  question: string;
  answer: string;
  articleRefs: string[];
  similarity: number;
}

export interface LinkedService {
  key: string;
  titleAr: string | null;
  titleEn: string | null;
  calcType: string | null;
  legalBasis: string[];
}

export interface RetrievalBundle {
  query: string;
  topSimilarity: number;
  confident: boolean;
  chunks: RetrievedChunk[];
  faq: RetrievedFaq[];
  services: LinkedService[];
}

export class Retriever {
  private supabase: SupabaseClient;
  private openai: OpenAI;

  constructor(supabase?: SupabaseClient, openai?: OpenAI) {
    this.supabase =
      supabase ?? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    this.openai = openai ?? new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  private async embed(text: string): Promise<string> {
    const r = await this.openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: [text],
      dimensions: EMBEDDING_DIM,
    });
    return `[${r.data[0].embedding.join(',')}]`;
  }

  async retrieve(query: string, topK = 5): Promise<RetrievalBundle> {
    const vec = await this.embed(query);

    const [{ data: lawHits }, { data: faqHits }] = await Promise.all([
      this.supabase.rpc('match_law_chunks', { query_embedding: vec, match_count: topK }),
      this.supabase.rpc('match_faq', { query_embedding: vec, match_count: 3 }),
    ]);

    const chunks: RetrievedChunk[] = (lawHits ?? []).map((r: Record<string, unknown>) => ({
      citation: r.citation as string,
      articleNo: (r.article_no as string) ?? null,
      articleTitle: (r.article_title as string) ?? null,
      clause: (r.clause as string) ?? null,
      content: r.content as string,
      similarity: Number(r.similarity),
      via: 'vector' as const,
    }));

    const topSimilarity = chunks.length ? chunks[0].similarity : 0;
    const seenArticles = new Set(chunks.map((c) => c.articleNo).filter(Boolean) as string[]);

    // --- Graph expansion: pull cross-referenced articles for the top hits ---
    const topArticles = chunks.slice(0, 3).map((c) => c.articleNo).filter(Boolean) as string[];
    if (topArticles.length) {
      const { data: xrefs } = await this.supabase
        .from('article_xref')
        .select('from_article,to_article,relation,note')
        .in('from_article', topArticles);
      const wanted = [...new Set((xrefs ?? []).map((x) => x.to_article as string))].filter(
        (a) => !seenArticles.has(a)
      );
      if (wanted.length) {
        const { data: extra } = await this.supabase
          .from('law_chunks')
          .select('citation,article_no,article_title,clause,content')
          .in('article_no', wanted)
          .is('clause', null); // article-level chunk, not each definition
        for (const r of extra ?? []) {
          if (seenArticles.has(r.article_no as string)) continue;
          seenArticles.add(r.article_no as string);
          chunks.push({
            citation: r.citation as string,
            articleNo: r.article_no as string,
            articleTitle: (r.article_title as string) ?? null,
            clause: null,
            content: r.content as string,
            similarity: 0,
            via: 'xref',
          });
        }
      }
    }

    // --- Linked services whose legal_basis cites any retrieved article ---
    const citations = [...seenArticles].map((a) => `Law 5/2018, Art. ${a}`);
    let services: LinkedService[] = [];
    if (citations.length) {
      const { data: svc } = await this.supabase
        .from('service')
        .select('key,title_ar,title_en,calc_type,legal_basis')
        .overlaps('legal_basis', citations);
      services = (svc ?? []).map((s) => ({
        key: s.key as string,
        titleAr: (s.title_ar as string) ?? null,
        titleEn: (s.title_en as string) ?? null,
        calcType: (s.calc_type as string) ?? null,
        legalBasis: (s.legal_basis as string[]) ?? [],
      }));
    }

    const faq: RetrievedFaq[] = (faqHits ?? []).map((r: Record<string, unknown>) => ({
      question: r.question_ar as string,
      answer: r.answer_ar as string,
      articleRefs: (r.article_refs as string[]) ?? [],
      similarity: Number(r.similarity),
    }));

    return {
      query,
      topSimilarity,
      confident: topSimilarity >= CONFIDENCE_THRESHOLD,
      chunks,
      faq,
      services,
    };
  }
}
