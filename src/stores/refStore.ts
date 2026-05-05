import { create } from 'zustand';

type RefStore = {
  imageIds: string[];
  add: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
};

export const useRefStore = create<RefStore>((set) => ({
  imageIds: [],
  add:    (id) => set((s) => (s.imageIds.includes(id) ? s : { imageIds: [...s.imageIds, id] })),
  remove: (id) => set((s) => ({ imageIds: s.imageIds.filter((x) => x !== id) })),
  clear:  ()   => set({ imageIds: [] }),
}));
