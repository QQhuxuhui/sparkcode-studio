# SparkCode Studio · 进度文档

> 最后更新：2026-05-06（OSS 迁移完成）
> 当前 commit：[`ae56c4e`](https://github.com/QQhuxuhui/sparkcode-studio/commit/ae56c4e)（doc 自身），未提交：`scripts/import-from-awesome.ts` + `server/lib/oss.ts`（OSS 迁移期补丁）

## 项目概览

SparkCode Studio 是 Sparkcode 多媒体平台下的对话式生图工作台，定位为给中转平台付费用户提供的图像创作工具。

- 前后端在同一仓库，单一 `pnpm dev` 起服务
- 前端：Vite + React 18 + TypeScript + Tailwind v3
- 后端：Hono + Drizzle ORM + postgres-js
- 数据库：PostgreSQL 15（共享线上实例）
- 对象存储：阿里云 OSS（仅 import 脚本使用）
- 设计语言：宋韵 · 朱砂 × 宣纸

## 架构

```
┌─────────────────── sparkcode-studio (单仓库) ────────────────────┐
│                                                                 │
│  src/                       (前端 Vite + React + TS)            │
│    ├── pages/Studio/          主页面                              │
│    │     ├── components/                                         │
│    │     │     ├── Header.tsx                                    │
│    │     │     ├── ChatPane/  ChatStream / Composer / Input     │
│    │     │     ├── Workspace/ Big / Tree / Library / Templates / Mask│
│    │     │     └── Modals/    KeyManager / Polish / Compare      │
│    │     └── index.tsx                                           │
│    ├── stores/              Zustand: refStore / uiStore / maskStore│
│    ├── services/            api.ts / db.ts / keys.ts / templates.ts / exporter.ts│
│    ├── data/                models.ts (KEY_GROUPS + MODELS)      │
│    └── lib/utils.ts                                              │
│                                                                 │
│  server/                    (后端 Hono + Drizzle)                │
│    ├── index.ts              Hono 入口（兼任静态托管）            │
│    ├── routes/templates.ts   GET 列表 / 分类 / 单条                │
│    ├── db/schema.ts          Drizzle schema                       │
│    ├── db/client.ts          postgres 连接池                      │
│    └── lib/oss.ts            ali-oss SDK 封装                     │
│                                                                 │
│  shared/types.ts            (前后端共用 TS 类型，单一源)          │
│  scripts/import-from-awesome.ts  (一次性数据导入)                  │
│  migrations/                (Drizzle 自动生成 SQL)                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
              │                       │                  │
              ↓                       ↓                  ↓
      api.sparkcode.top         PostgreSQL          阿里云 OSS
      (new-api 网关)        sparkcode_studio        (示例图床)
      文生图 / 图生图 /      模板表 + 软删除         待启用
      Gemini / 润色
```

### 数据持久化分层

| 数据 | 位置 | 理由 |
|---|---|---|
| API Key（用户令牌）| 浏览器 localStorage | 用户秘密，永不上服务器 |
| 生成图（base64）| 浏览器 IndexedDB | 隐私；服务器存储成本不可控（10GB/日量级） |
| 对话历史 / 分支树 | 浏览器 IndexedDB | 跟图绑定；LRU 200 张 + 5s 宽限 |
| 风格模板 | PostgreSQL `templates` 表 | 跨用户共享、admin 维护、可分类筛选 |
| 模板示例图 | 阿里云 OSS `tern-13004588605.oss-cn-shenzhen` | 大体量（387 张已迁，43 条源头无图） |

## 功能完成度

### 前端 5 大产品交互 ✅

| 功能 | 状态 | 实现位置 |
|---|---|---|
| 引用机制（↩ 按钮 + @ 提及 + 拖拽上传 + 分组分支）| ✅ | `RefPills.tsx` / `MentionPopover.tsx` / `InputArea.tsx` |
| 提示词润色（gpt-5.5）+ 风格模板下拉 | ✅ | `PolishModal.tsx` / `InputArea.tsx` |
| IndexedDB 图库 + LRU + 主路径保护 | ✅ | `LibraryTab.tsx` / `services/db.ts` |
| Generation Tree（root/edit/reroll 分支）+ 并排对比 | ✅ | `TreeTab.tsx` / `CompareModal.tsx` |
| 区域编辑（gpt-image-2 mask 笔刷）| ✅ | `MaskTab.tsx` / `maskStore.ts` |

### 跨切关注点 ✅

- 令牌分组管理（codex / 大香蕉），从老 per-model store 自动迁移 — `KeyManagerModal.tsx` / `services/keys.ts`
- 导入 / 导出 JSON 包 + 7 天 localStorage 备份 — `services/exporter.ts`
- 上传图清空时 IDB 联动删除（防 @ 提及残留）— `RefPills.tsx::pruneOrphanUpload`
- 4 个 modal 通用 Esc + backdrop 关闭 + 防泄漏

### 后端服务 ✅

| 端点 | 用途 |
|---|---|
| `GET /api/health` | 健康检查 |
| `GET /api/v1/templates[?category=xxx]` | 模板列表（按分类过滤）|
| `GET /api/v1/templates/categories` | 分类汇总 + 每类计数 |
| `GET /api/v1/templates/:id` | 单条模板详情 |

- 公开读，无 auth
- CORS 全开
- 5 分钟前端内存缓存（避免重复请求）
- 软删除（`deleted_at IS NULL` 过滤）

### 数据库 ✅

PG 实例：`sparkcode_studio` @ `104.194.91.23:5444`

`templates` 表：
- 14 列，主键 UUID，索引 (category, sort_order)
- `prompt_suffix`（追加式）和 `prompt_template`（带占位符）二选一
- 软删除字段 `deleted_at`
- jsonb 字段：`supported_models`、`tags`

### 模板数据导入 ✅

来源：[freestylefly/awesome-gpt-image-2](https://github.com/freestylefly/awesome-gpt-image-2)

| 子源 | 解析数 | 类目策略 |
|---|---|---|
| `docs/templates.md` | 40（21 工业模板 × 多变体）| 用作者原命名 |
| `docs/gallery-part-1.md` | 164 案例 | 关键词智能映射 |
| `docs/gallery-part-2.md` | 226 案例 | 关键词智能映射 |
| **合计** | **430 条** | 17 个分类 |

类目分布：
- UI与界面 62 / 海报与排版 56 / 图表与信息可视化 49 / 摄影与写实 24 / 插画与艺术 23
- 商品与电商 20 / 品牌与标志 20 / 人物与角色 17 / 建筑与空间 16 / 历史与国风 8
- 其他案例 115（关键词未命中）+ 杂项

脚本：`scripts/import-from-awesome.ts`，模式 `--reset / --dry-run / --with-images / --skip-gallery`

幂等性：不带 `--reset` 时按 `name` upsert；`--with-images` 配合"OSS host 命中即 skip"逻辑，重跑只处理新增或仍指向 GitHub 的行，安全可重入。

## 待办

### 短期（用户体验直接可感）

- [x] ~~**OSS 迁移**~~ 已完成：387/387 张图（除 43 条源头无图）已迁到 `tern-13004588605.oss-cn-shenzhen`，国内首字节 ~450ms，比 GitHub raw 快一个数量级。期间给 import 脚本加了：① `fetchWithRetry` 包装两类 fetch（doc 4 次重试 / image 3 次重试，指数退避 + 30-60s 超时）；② "已上 OSS 就 skip"幂等检查（重跑只处理待迁项）；③ `uploadToOSS` 携带 `x-oss-object-acl: public-read`，避免 bucket 全局公共读
- [ ] **类目合并**：手动 SQL 把"场景与故事/场景与叙事"、"历史与国风/历史与古风题材"、"文档与出版/文档与出版物"等近义合并
- [ ] **TemplatesTab 分页或虚拟滚动**：430 张卡片首屏渲染性能 ≈ 500ms，建议加分页或 IntersectionObserver 懒加载
- [ ] **促销卡片**："其他案例"分类 115 条太多，建议进一步细分或加搜索高亮
- [ ] **空状态优化**：API 拉取失败时给重试按钮

### 中期（功能完善）

- [ ] **Admin 后台**：Web UI 增删改模板（目前只能 SQL 或重跑 import 脚本）
- [ ] **模板使用统计**：记录哪些模板被点击/应用，按热度排序
- [ ] **用户收藏**：登录后可收藏喜欢的模板
- [ ] **缩略图自动生成**：import 脚本下载原图后用 sharp 压成 240×240 webp 当 thumbnail，单独上传
- [ ] **模板预览大图弹窗**：当前点击直接应用，建议先弹大图 + 完整 prompt + 应用按钮

### 长期（生产化）

- [ ] **与 new-api 用户系统对接**（暂未接，结构已留口）
  - JWT 或 session cookie 共享
  - 私有模板（按 user_id）
  - 收藏 / 历史 / 配额
- [ ] **部署**：
  - Dockerfile 多阶段构建（已有思路，未写）
  - docker-compose.yml 起 Hono + 反代 nginx
  - 子域名 `studio.sparkcode.top` + Cloudflare
- [ ] **监控**：API 响应时间、错误率、PG 连接数；接 Uptime Kuma
- [ ] **i18n**：当前全部硬编码中文，未来如要做英文需要抽 messages

## 技术决策记录

| 决策 | 选项 | 选了 | 理由 |
|---|---|---|---|
| 前后端形态 | 独立两 repo / monorepo | **monorepo** | 维护一份，shared/types.ts 类型零漂移 |
| 后端语言 | Go / Bun / Node | **Node + Hono + Drizzle** | TS 全栈，前后端类型共享，Hono 启动 < 1s |
| 模板存储 | JSON in bundle / PG | **PG** | 用户数量级会扩，模板维护要解耦 build |
| 模板示例图 | bundle / PG / OSS | **OSS** | 430 张图打 bundle 体积爆炸，PG 存 base64 浪费 |
| API 鉴权 | JWT / 公开 / new-api session | **公开读，写靠 SQL** | 模板就是公开素材；admin 写操作没有暴露面 |
| LRU 策略 | 阻塞 / 异步 + 主路径保护 | **异步 + 5s 宽限 + 主路径保护** | 用户感知不到，新生成图永不丢 |
| 设计语言 | 苹果白 / 宋韵朱砂 / Material | **宋韵朱砂** | 创作工具气质 + 中国用户文化亲近 + 跟同类 AI 工具不撞脸 |
| 模板下拉位置 | 输入框工具条 / 工作台 tab | **两个都要** | 输入框 dropdown 取前 12 当快捷；完整 430 在「模板库」tab 里浏览 |

## 开发命令速查

```bash
# 一次性安装
pnpm install

# 日常开发（前端 + 后端 HMR 全开）
pnpm dev                              # → http://localhost:5173

# 数据库
pnpm db:generate                      # schema 改了之后生成迁移 SQL
pnpm db:push                          # 应用迁移到 DATABASE_URL
pnpm db:studio                        # 浏览器打开 Drizzle Studio

# 模板导入
pnpm import:templates --dry-run       # 只解析不写库
pnpm import:templates --reset         # 清空 + 重新插入
pnpm import:templates --with-images   # 同时下载图 + 上传 OSS

# 生产构建
pnpm build                            # 前端 dist/ + tsc 检查
pnpm start                            # 跑生产 Hono（同进程托管 dist/）
```

## 依赖速查

| 包 | 版本 | 用途 |
|---|---|---|
| react | ^19.2 | 前端 |
| vite | ^8.0 | 前端构建 |
| tailwindcss | ^3.4 | 前端样式 |
| zustand | ^5.0 | 前端状态 |
| dexie / dexie-react-hooks | ^4.4 | 浏览器 IndexedDB |
| hono | ^4.12 | 后端框架 |
| @hono/node-server | ^2.0 | Hono Node adapter |
| drizzle-orm | ^0.45 | ORM |
| drizzle-kit | ^0.31 | 迁移 CLI |
| postgres | ^3.4 | PG 驱动 |
| ali-oss | ^6.23 | 阿里云对象存储 |
| dotenv | ^17.4 | 环境变量 |
| concurrently | ^9.2 | dev 并发 |
| tsx | ^4.21 | TS 执行 |

## 文件清单

后端：~600 行 TS
前端：~2500 行 TS/TSX
脚本：~250 行 TS
共：~3300 行 TS（含注释）

## 联系 / 维护说明

仓库：https://github.com/QQhuxuhui/sparkcode-studio
PG 实例：`104.194.91.23:5444` 数据库 `sparkcode_studio`（生产，读写都走它）
密码：见 `.env`，已 gitignore，**不要进 git**
