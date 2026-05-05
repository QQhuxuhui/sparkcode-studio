// Shared types between frontend (src/) and backend (server/).
// API responses use these directly — keep frontend and backend always aligned.

export type StyleTemplate = {
  id: string;
  name: string;
  category: string;
  promptSuffix: string | null;
  promptTemplate: string | null;
  thumbnailUrl: string | null;
  fullExampleUrl: string | null;
  supportedModels: string[];
  tags: string[];
  sourceUrl: string | null;
  sortOrder: number;
  createdAt: string;       // ISO 8601 from JSON serialization
};

export type TemplateCategory = {
  name: string;
  count: number;
};
