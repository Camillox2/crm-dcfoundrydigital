import type { DatabaseConnectionResult } from '@dcfoundry/db';
import { markdownHtml, type BlogData, type WorkspaceDocument } from '@dcfoundry/shared';

export function publicPost(row: Record<string, unknown>) {
  const p = row.data as BlogData;
  const cover = p.coverUrl
    ? p.coverUrl.startsWith('/')
      ? new URL(p.coverUrl, process.env.API_URL ?? 'http://localhost:4000').toString()
      : p.coverUrl
    : null;
  return {
    id: row.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    content: markdownHtml(p.content),
    cover_image: cover,
    cover_url: cover,
    cover_alt: p.coverAlt,
    tags: p.tags.join(','),
    author_name: p.author,
    published: 1,
    published_at: row.published_at ?? p.scheduledAt,
    updated_at: row.updated_at,
    scheduled_at: p.scheduledAt || null,
    views: 0,
    likes_count: 0,
    comments_count: 0,
    is_premium: 0,
    reading_time_minutes: Math.max(1, Math.ceil(p.content.split(/\s+/).length / 200)),
    seo_title: p.seoTitle,
    seo_description: p.seoDescription,
  };
}
export const publishedSql = `kind='blog' AND archived_at IS NULL AND (data->>'status'='published' OR (data->>'status'='scheduled' AND NULLIF(data->>'scheduledAt','')::timestamptz<=now()))`;
/** Durable retry queue. No remote request is made without explicit VPS configuration. */
export async function flushBlogOutbox(
  pool: DatabaseConnectionResult['pool'],
  send: typeof fetch = fetch,
) {
  const target = process.env.BLOG_SITE_WEBHOOK_URL,
    secret = process.env.BLOG_REVALIDATE_SECRET;
  if (!target || !secret || secret.length < 32) return { status: 'not_configured', delivered: 0 };
  const url = new URL(target);
  if (
    url.protocol !== 'https:' ||
    url.pathname !== '/api/blog/revalidate' ||
    url.username ||
    url.password ||
    url.search
  )
    return { status: 'invalid_configuration', delivered: 0 };
  const client = await pool.connect();
  let delivered = 0;
  try {
    await client.query('BEGIN');
    const rows = (
      await client.query(
        'SELECT id,document_id,slugs,attempts FROM workspace_blog_outbox WHERE delivered_at IS NULL AND next_attempt_at<=now() ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED',
      )
    ).rows;
    for (const row of rows) {
      try {
        const response = await send(target, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
          body: JSON.stringify({ slugs: row.slugs }),
          signal: AbortSignal.timeout(8000),
          redirect: 'error',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as {
          revalidated?: boolean;
          indexing?: { status?: string };
        };
        if (!body.revalidated || body.indexing?.status === 'retry')
          throw new Error('revalidation_pending');
        await client.query(
          'UPDATE workspace_blog_outbox SET delivered_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1',
          [row.id],
        );
        await client.query("UPDATE workspace_documents SET sync_status='delivered' WHERE id=$1", [
          row.document_id,
        ]);
        delivered++;
      } catch {
        await client.query(
          "UPDATE workspace_blog_outbox SET attempts=attempts+1,next_attempt_at=now()+make_interval(secs=>LEAST(3600,30*power(2,LEAST(attempts,7)))::integer),last_error='Falha na entrega. Nova tentativa agendada.' WHERE id=$1",
          [row.id],
        );
        await client.query("UPDATE workspace_documents SET sync_status='retry' WHERE id=$1", [
          row.document_id,
        ]);
      }
    }
    await client.query('COMMIT');
    return { status: 'processed', delivered };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
