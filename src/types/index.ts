// Core domain types — single source of truth for IDB records and API shapes.

export type ImageRecord = {
  id: string;
  shortId: string;             // 'g7' / 'u3' — short, human-mention-friendly
  dataUrl: string;             // 'data:image/png;base64,...'
  model: string;
  prompt: string;
  parentId: string | null;     // node-level parent (denormalized for fast lookup)
  nodeId: string | null;
  width: number;
  height: number;
  format: string;              // 'png' | 'jpeg' | 'webp'
  createdAt: number;
};

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imageIds: string[];          // for assistant: generated images
  refImageIds: string[];       // for user: images they referenced
  nodeId: string | null;
  model: string;
  error: string | null;
  createdAt: number;
};

export type NodeKind = 'root' | 'edit' | 'reroll' | 'gen';

export type GenNode = {
  id: string;
  parentNodeId: string | null;
  kind: NodeKind;
  messageId: string;
  imageIds: string[];
  label: string;
  createdAt: number;
};

// API shapes — uniform across all 4 backends
export type GeneratedImage = { dataUrl: string; format: string };
export type GenerationResult = { images: GeneratedImage[] };

export type ModelDef = {
  id: string;
  label: string;
  supportsMask: boolean;
};

export type KeyGroup = {
  id: string;
  label: string;
  hint: string;
  models: string[];
  pattern?: RegExp;
};

// StyleTemplate now lives in shared/types.ts (used by backend API too).
// Re-export for convenience so existing src/ imports keep working.
export type { StyleTemplate, TemplateCategory } from '../../shared/types';
