import { create } from 'zustand';

export type TabId = 'big' | 'tree' | 'library' | 'mask' | 'templates';

type UIStore = {
  activeTab: TabId;
  activeImageId: string | null;
  selectedNodeIds: string[];
  selectedModel: string;          // mirrored to localStorage on change
  promptDraft: string;            // mirror of InputArea textarea — read by TemplatesTab modal

  setTab:           (t: TabId) => void;
  setActiveImage:   (id: string | null) => void;
  setSelectedNodes: (ids: string[]) => void;
  setModel:         (id: string) => void;
  setPromptDraft:   (text: string) => void;
};

const SETTINGS_MODEL_KEY = 'conv_image_settings_model';

const initialModel = (() => {
  try {
    const v = localStorage.getItem(SETTINGS_MODEL_KEY);
    return v || 'gpt-image-2';
  } catch {
    return 'gpt-image-2';
  }
})();

export const useUIStore = create<UIStore>((set) => ({
  activeTab: 'big',
  activeImageId: null,
  selectedNodeIds: [],
  selectedModel: initialModel,
  promptDraft: '',

  setTab:           (activeTab)       => set({ activeTab }),
  setActiveImage:   (activeImageId)   => set({ activeImageId }),
  setSelectedNodes: (selectedNodeIds) => set({ selectedNodeIds }),
  setModel:         (selectedModel)   => {
    try { localStorage.setItem(SETTINGS_MODEL_KEY, selectedModel); } catch { /* ignore */ }
    set({ selectedModel });
  },
  setPromptDraft:   (promptDraft)     => set({ promptDraft }),
}));
