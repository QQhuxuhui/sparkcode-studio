import { pgTable, text, integer, jsonb, timestamp, uuid, index } from 'drizzle-orm/pg-core';

// templates — sourced from awesome-gpt-image-2 + curated additions.
// Two prompt modes:
//   promptSuffix    — append to user input with ' · '
//   promptTemplate  — full template with {subject} placeholders
// Either or both may be set; UI picks promptTemplate when present.
export const templates = pgTable(
  'templates',
  {
    id:               uuid('id').defaultRandom().primaryKey(),
    name:             text('name').notNull(),
    category:         text('category').notNull(),
    promptSuffix:     text('prompt_suffix'),
    promptTemplate:   text('prompt_template'),
    thumbnailUrl:     text('thumbnail_url'),
    fullExampleUrl:   text('full_example_url'),
    supportedModels:  jsonb('supported_models').$type<string[]>().default([]).notNull(),
    tags:             jsonb('tags').$type<string[]>().default([]).notNull(),
    sourceUrl:        text('source_url'),
    sortOrder:        integer('sort_order').default(0).notNull(),
    createdAt:        timestamp('created_at',  { withTimezone: true }).defaultNow().notNull(),
    updatedAt:        timestamp('updated_at',  { withTimezone: true }).defaultNow().notNull(),
    deletedAt:        timestamp('deleted_at',  { withTimezone: true }),
  },
  (t) => ({
    categoryIdx: index('templates_category_idx').on(t.category),
    sortIdx:     index('templates_sort_idx').on(t.sortOrder),
  }),
);

export type TemplateRow = typeof templates.$inferSelect;
export type NewTemplateRow = typeof templates.$inferInsert;
