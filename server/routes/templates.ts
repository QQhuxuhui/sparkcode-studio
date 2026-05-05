import { Hono } from 'hono';
import { eq, isNull, asc, sql, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { templates, type TemplateRow } from '../db/schema.js';
import type { StyleTemplate, TemplateCategory } from '../../shared/types.js';

export const templatesRouter = new Hono();

// GET /api/v1/templates?category=xxx
templatesRouter.get('/', async (c) => {
  const category = c.req.query('category');
  const where = category
    ? and(isNull(templates.deletedAt), eq(templates.category, category))
    : isNull(templates.deletedAt);
  const rows = await db
    .select()
    .from(templates)
    .where(where)
    .orderBy(asc(templates.sortOrder), asc(templates.createdAt));
  return c.json({ items: rows.map(rowToDTO) });
});

// GET /api/v1/templates/categories
templatesRouter.get('/categories', async (c) => {
  const rows = await db
    .select({
      name:  templates.category,
      count: sql<number>`count(*)::int`,
    })
    .from(templates)
    .where(isNull(templates.deletedAt))
    .groupBy(templates.category)
    .orderBy(asc(templates.category));
  const items: TemplateCategory[] = rows.map((r) => ({ name: r.name, count: r.count }));
  return c.json({ items });
});

// GET /api/v1/templates/:id
templatesRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const rows = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, id), isNull(templates.deletedAt)))
    .limit(1);
  if (rows.length === 0) return c.json({ error: 'not found' }, 404);
  return c.json(rowToDTO(rows[0]));
});

function rowToDTO(r: TemplateRow): StyleTemplate {
  return {
    id:              r.id,
    name:            r.name,
    category:        r.category,
    promptSuffix:    r.promptSuffix,
    promptTemplate:  r.promptTemplate,
    thumbnailUrl:    r.thumbnailUrl,
    fullExampleUrl:  r.fullExampleUrl,
    supportedModels: r.supportedModels ?? [],
    tags:            r.tags ?? [],
    sourceUrl:       r.sourceUrl,
    sortOrder:       r.sortOrder,
    createdAt:       r.createdAt.toISOString(),
  };
}
