/**
 * Import templates + gallery cases from
 *   https://github.com/freestylefly/awesome-gpt-image-2
 *
 * Source structure:
 *   docs/templates.md          21 industrial templates organized by category
 *   docs/gallery-part-1.md     cases 1-165
 *   docs/gallery-part-2.md     cases 166-393
 *
 * Templates have explicit categories (### 分类名 headers + tpl-* anchors).
 * Gallery cases use guessed category from title keywords (rough but useful).
 *
 * Usage:
 *   pnpm import:templates                  # parse + insert/update (uses GitHub raw URLs for images)
 *   pnpm import:templates --with-images    # also download + re-host images on OSS
 *   pnpm import:templates --dry-run        # parse + print stats only
 *   pnpm import:templates --reset          # truncate table first
 *   pnpm import:templates --skip-gallery   # only import templates.md (21 entries)
 */

import { db, closeDb } from '../server/db/client.js';
import { templates } from '../server/db/schema.js';
import { uploadToOSS } from '../server/lib/oss.js';
import { eq, sql } from 'drizzle-orm';

const REPO_RAW    = 'https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main';
const REPO_HTTP   = 'https://github.com/freestylefly/awesome-gpt-image-2';
const TEMPLATES_DOC = `${REPO_RAW}/docs/templates.md`;
const GALLERY_DOCS  = [
  `${REPO_RAW}/docs/gallery-part-1.md`,
  `${REPO_RAW}/docs/gallery-part-2.md`,
];

type ParsedTemplate = {
  name: string;
  category: string;
  promptSuffix: string | null;
  promptTemplate: string | null;
  exampleImageUrl: string | null;
  sourceAnchor: string;
  tags: string[];
};

const CATEGORY_HINTS: Record<string, string[]> = {
  'UI与界面':         ['UI', '界面', '截图', '应用', 'app'],
  '图表与信息可视化':  ['信息图', '图表', 'infographic', '可视化', '示意图', '科普'],
  '海报与排版':       ['海报', '排版', '招贴', '主视觉'],
  '商品与电商':       ['电商', '详情页', '商品', '卖点', '包装', '广告'],
  '品牌与标志':       ['品牌', 'logo', '标志', 'identity', '视觉系统', '触点'],
  '建筑与空间':       ['建筑', '空间', '室内', '城市', '装置'],
  '摄影与写实':       ['摄影', '写真', '人像', '抓拍', '镜头', 'iPhone'],
  '插画与艺术':       ['插画', '艺术', '油画', '水墨', '画风'],
  '人物与角色':       ['人物', '角色', '玩偶', '卡牌', '形象', '圣斗士', '微缩'],
  '场景与故事':       ['故事', '场景', '剧情', '世界观', '直播', '生活'],
  '历史与国风':       ['国风', '古风', '宋', '唐', '汉', '诗', '历史', '怀古', '楚霸王'],
  '文档与出版':       ['文档', '白皮书', '说明书', '杂志', '出版'],
};

function guessCategory(title: string): string {
  for (const [cat, hints] of Object.entries(CATEGORY_HINTS)) {
    if (hints.some((h) => title.toLowerCase().includes(h.toLowerCase()))) return cat;
  }
  return '其他案例';
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^\w一-鿿]+/g, '-').replace(/^-|-$/g, '');
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  // Normalize CRLF → LF so all parsers downstream can use \n only.
  const text = await res.text();
  return text.replace(/\r\n/g, '\n');
}

function resolveImageUrl(relativeOrAbsolute: string): string {
  if (/^https?:\/\//.test(relativeOrAbsolute)) return relativeOrAbsolute;
  // gallery uses ../data/images/caseN.jpg → resolve relative to docs/
  const cleaned = relativeOrAbsolute.replace(/^\.\.\//, '').replace(/^\.\//, '');
  return `${REPO_RAW}/${cleaned}`;
}

// ============================================================
// Parser 1: templates.md → industrial templates
// ============================================================
function parseTemplatesDoc(md: string): ParsedTemplate[] {
  const out: ParsedTemplate[] = [];
  const lines = md.split('\n');

  let currentCategory = '未分类';
  let currentAnchor   = 'templates';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Anchor for next category
    const anchorMatch = line.match(/<a name="(tpl-[^"]+)"><\/a>/);
    if (anchorMatch) currentAnchor = anchorMatch[1];

    // ### 分类名 — set the current category
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      currentCategory = h3[1].trim();
      i++; continue;
    }

    // **<name>模板** OR **常规模板** OR **JSON 进阶模板** etc — variant title
    const variantMatch = line.match(/^\*\*([^*]+模板[^*]*)\*\*\s*$/);
    if (variantMatch) {
      const variantName = variantMatch[1].trim();
      // Find the next fenced block
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('```')) j++;
      if (j < lines.length) {
        const fence = lines[j];
        const lang = fence.replace(/^```/, '').trim();
        const start = j + 1;
        let end = start;
        while (end < lines.length && !lines[end].startsWith('```')) end++;
        if (end < lines.length) {
          const body = lines.slice(start, end).join('\n').trim();
          const isJson = lang.startsWith('json');
          const hasPlaceholders = /\{[^}]+\}|\[[^\]]+\]/.test(body);
          out.push({
            name:           `${currentCategory} · ${variantName}`,
            category:       currentCategory,
            promptSuffix:   !hasPlaceholders ? body : null,
            promptTemplate:  hasPlaceholders ? body : null,
            exampleImageUrl: null,
            sourceAnchor:    `${REPO_HTTP}/blob/main/docs/templates.md#${currentAnchor}`,
            tags:           isJson ? ['json', 'template'] : ['template'],
          });
          i = end + 1;
          continue;
        }
      }
    }
    i++;
  }
  return out;
}

// ============================================================
// Parser 2: gallery-part-N.md → individual cases
// ============================================================
function parseGalleryDoc(md: string): ParsedTemplate[] {
  const out: ParsedTemplate[] = [];
  // Split on case anchors. Each chunk starts with <a name="case-N"></a>
  const chunks = md.split(/<a name="(case-\d+)"><\/a>/);
  // Result: [pre-amble, anchor1, content1, anchor2, content2, ...]
  for (let k = 1; k < chunks.length; k += 2) {
    const anchor  = chunks[k];
    const content = chunks[k + 1] || '';
    const titleMatch = content.match(/###\s+(例\s*\d+：[^\n]+)/);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();
    const promptMatch = content.match(/```text\n([\s\S]*?)\n```/);
    if (!promptMatch) continue;
    const promptBody = promptMatch[1].trim();
    const imgMatch = content.match(/!\[[^\]]*\]\(([^)]+)\)/);
    const imageUrl = imgMatch ? resolveImageUrl(imgMatch[1].trim()) : null;
    const sourceMatch = content.match(/\*\*来源：\*\*\s*([^\n]+)/);
    const tags: string[] = ['gallery'];
    if (sourceMatch) {
      const s = sourceMatch[1].trim();
      if (s && s !== '未提供') tags.push(`来源:${s}`);
    }
    const hasPlaceholders = /\{[^}]+\}|\[[^\]]{2,}\]/.test(promptBody);
    out.push({
      name:           title,
      category:       guessCategory(title),
      promptSuffix:   !hasPlaceholders ? promptBody : null,
      promptTemplate:  hasPlaceholders ? promptBody : null,
      exampleImageUrl: imageUrl,
      sourceAnchor:    `${REPO_HTTP}/blob/main/docs/gallery-part-${anchor.includes('1') && Number(anchor.split('-')[1]) <= 165 ? '1' : '2'}.md#${anchor}`,
      tags,
    });
  }
  return out;
}

async function downloadImage(url: string): Promise<{ buf: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get('content-type') || 'image/jpeg';
  return { buf, contentType: ct };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const withImages   = args.has('--with-images');
  const dryRun       = args.has('--dry-run');
  const reset        = args.has('--reset');
  const skipGallery  = args.has('--skip-gallery');

  console.log(`[import] fetching docs/templates.md…`);
  const templatesDoc = await fetchText(TEMPLATES_DOC);
  const fromTemplates = parseTemplatesDoc(templatesDoc);
  console.log(`[import] parsed ${fromTemplates.length} entries from templates.md`);

  let fromGallery: ParsedTemplate[] = [];
  if (!skipGallery) {
    for (const url of GALLERY_DOCS) {
      console.log(`[import] fetching ${url}…`);
      const md = await fetchText(url);
      const parsed = parseGalleryDoc(md);
      console.log(`[import] parsed ${parsed.length} cases from ${url.split('/').pop()}`);
      fromGallery.push(...parsed);
    }
  }

  const all = [...fromTemplates, ...fromGallery];
  console.log(`[import] total parsed: ${all.length}`);

  // Stats per category
  const byCat = new Map<string, number>();
  for (const t of all) byCat.set(t.category, (byCat.get(t.category) || 0) + 1);
  console.log('[import] by category:');
  const sorted = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]);
  for (const [c, n] of sorted) console.log(`  ${c.padEnd(24)} ${n}`);

  if (dryRun) {
    console.log('[import] dry-run, no DB writes');
    await closeDb();
    return;
  }

  if (reset) {
    console.log('[import] truncating templates table…');
    await db.execute(sql`TRUNCATE TABLE templates`);
  }

  let inserted = 0, updated = 0, errors = 0;
  for (let i = 0; i < all.length; i++) {
    const t = all[i];
    let thumbnailUrl   = t.exampleImageUrl;
    let fullExampleUrl = t.exampleImageUrl;

    if (withImages && t.exampleImageUrl) {
      try {
        const { buf, contentType } = await downloadImage(t.exampleImageUrl);
        const ext = (contentType.split('/')[1] || 'jpg').split(';')[0];
        const key = `templates/${slugify(t.name)}/example.${ext}`;
        fullExampleUrl = await uploadToOSS(key, buf, contentType);
        thumbnailUrl   = fullExampleUrl;
      } catch (e) {
        console.warn(`  [${i+1}/${all.length}] image upload failed for ${t.name}: ${(e as Error).message}`);
        errors++;
      }
    }

    try {
      const existing = await db
        .select({ id: templates.id })
        .from(templates)
        .where(eq(templates.name, t.name))
        .limit(1);
      if (existing.length > 0) {
        await db.update(templates).set({
          category:       t.category,
          promptSuffix:   t.promptSuffix,
          promptTemplate: t.promptTemplate,
          thumbnailUrl,
          fullExampleUrl,
          tags:           t.tags,
          sourceUrl:      t.sourceAnchor,
          sortOrder:      i + 1,
          updatedAt:      new Date(),
        }).where(eq(templates.id, existing[0].id));
        updated++;
      } else {
        await db.insert(templates).values({
          name:           t.name,
          category:       t.category,
          promptSuffix:   t.promptSuffix,
          promptTemplate: t.promptTemplate,
          thumbnailUrl,
          fullExampleUrl,
          tags:           t.tags,
          sourceUrl:      t.sourceAnchor,
          sortOrder:      i + 1,
        });
        inserted++;
      }
    } catch (e) {
      console.warn(`  [${i+1}/${all.length}] DB write failed for ${t.name}: ${(e as Error).message}`);
      errors++;
    }
    if ((i + 1) % 50 === 0) console.log(`[import] progress ${i+1}/${all.length}`);
  }

  console.log(`[import] done. inserted=${inserted} updated=${updated} errors=${errors}`);
  await closeDb();
}

main().catch((e) => {
  console.error('[import] FATAL:', e);
  process.exit(1);
});
