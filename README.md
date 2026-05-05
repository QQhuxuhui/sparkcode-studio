# SparkCode Studio

对话式生图工作台。Vite + React + TypeScript + Tailwind + Zustand + Dexie 架构。

## 设计来源

由 `new-api/docs/对话生图.html` 单文件版本重构而来。保留宋韵 × 朱砂的视觉风格，迁移到组件化结构便于继续添加功能（特别是后续的样式模板库）。

## 技术栈

- **Vite 8** — 构建
- **React 18** + **TypeScript** — UI
- **Tailwind v3** — 样式（设计系统在 `tailwind.config.js` + `src/index.css`）
- **Zustand** — 内存状态（refs、active tab、选中节点）
- **Dexie + dexie-react-hooks** — IndexedDB 持久化（图、消息、分支）

## 开发

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # 输出 dist/
pnpm preview      # 预览构建产物
```

## 环境变量

`.env.local`（可选）：
```
VITE_API_BASE=https://api.sparkcode.top/v1
```
默认值已写在 `services/api.ts`，本地开发不配也能用。

## 目录结构

```
src/
  App.tsx                       # 路由壳子（当前只挂 Studio 一个页面）
  main.tsx                      # ReactDOM 入口
  index.css                     # @tailwind + 宋韵 tokens + 组件类
  types/                        # 全局 TS 类型
  data/
    models.ts                   # 模型清单 + 分组定义
    templates.ts                # 样式模板（后续在此添加）
  services/
    db.ts                       # Dexie 包装（images / messages / nodes）
    keys.ts                     # 分组令牌存储 + legacy 迁移
    api.ts                      # 4 个 API 调用 + helpers
  stores/
    refStore.ts                 # 引用图状态
    uiStore.ts                  # 当前 tab / 当前大图 / 模型选择
  lib/
    utils.ts                    # toast / fmtTime / fileToDataUrl
  pages/Studio/
    index.tsx                   # 主页面装配
    components/
      Header.tsx
      ChatPane/
        ChatStream.tsx
        ComposerToolbar.tsx     # 模型 + 新对话
        InputArea.tsx           # textarea + 数量/尺寸 + 发送
      Workspace/
        index.tsx               # tab bar
        BigImageTab.tsx         # 大图（已实现）
        # tree/library/mask 占位中
      Modals/
        KeyManagerModal.tsx     # 令牌分组管理
```

## 当前完成度

- 基础架构（Vite + TS + Tailwind 配置 + 设计系统）
- 数据层（Dexie schema + 短 ID 分配 + LRU 200 张含 5s 宽限）
- API 客户端（4 个调用 + Gemini 多模态 + 多种 base64 提取）
- 令牌分组管理（codex + 大香蕉，legacy 迁移）
- 顶栏 + 工具条 + 输入框 + 聊天流（基础生图流程跑通）
- 大图 tab

待实现：引用机制（↩、@、上传）/ 分支树 + 并排对比 / 图库 + 过滤器 / 区域编辑（mask 笔刷）/ 提示词润色 + 风格模板 / 导入导出

## 路线图

- 第二轮：把单文件 HTML 的 5 个完整功能逐个迁移为组件
- 第三轮：样式模板库（templates.ts 扩到 50+）+ 模板分类筛选
- 第四轮：与 new-api 用户系统对接（账号、跨设备同步）
- 部署：独立子域名 `studio.sparkcode.top`，nginx 静态托管 `dist/`
