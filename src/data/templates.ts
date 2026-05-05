import type { StyleTemplate } from '../types';

// Style templates — fixed list shipped with the bundle.
// To add: just append entries here, no backend involved.
// Categories used: '摄影', '插画', '艺术', '风格化', '材质'
export const STYLE_TEMPLATES: StyleTemplate[] = [
  { id: 'photo-real',    name: '写实摄影',     category: '摄影',   promptSuffix: '写实摄影风格、自然光线、高细节、真实质感' },
  { id: 'film-fog',      name: '雾面胶片',     category: '摄影',   promptSuffix: '胶片摄影质感、轻微颗粒、柔和雾面、柯达 Portra 400' },
  { id: 'anime-jp',      name: '日漫风',       category: '插画',   promptSuffix: '日本动漫风格、清晰线条、平涂色彩、Studio Ghibli 影子' },
  { id: 'pixar-3d',      name: 'Pixar 3D',     category: '插画',   promptSuffix: 'Pixar 3D 渲染、柔和材质、明亮色调、电影级灯光' },
  { id: 'cyber-neon',    name: '赛博朋克',     category: '风格化', promptSuffix: '赛博朋克美学、霓虹光晕、雨夜街景、高对比' },
  { id: 'neon-noise',    name: '霓虹噪点',     category: '风格化', promptSuffix: '霓虹色彩、电子噪点、80 年代复古未来主义' },
  { id: 'minimal-line',  name: '极简线稿',     category: '艺术',   promptSuffix: '极简线稿、单色、留白、克制构图' },
  { id: 'oil-paint',     name: '油画质感',     category: '艺术',   promptSuffix: '油画质感、可见笔触、印象派色彩' },
  { id: 'song-ink',      name: '国风水墨',     category: '艺术',   promptSuffix: '中国水墨画、淡彩、留白、宣纸质感、宋代山水' },
  { id: 'iso-illust',    name: '等距插画',     category: '插画',   promptSuffix: '等距视角、扁平插画、柔和色块、矢量风格' },
  { id: 'metal-shine',   name: '金属反光',     category: '材质',   promptSuffix: '金属反光、镜面材质、PBR 渲染、工作室灯光' },
  { id: 'clay-toy',      name: '黏土玩偶',     category: '材质',   promptSuffix: '黏土玩偶质感、手工捏塑感、柔和阴影、暖色调' },
];
