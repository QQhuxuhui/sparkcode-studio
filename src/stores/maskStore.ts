import { create } from 'zustand';

export type Stroke = {
  mode: 'paint' | 'erase';
  brush: number;          // canvas-pixel diameter (already scaled)
  points: { x: number; y: number }[];
};

type MaskStore = {
  sourceImageId: string | null;
  brushSize: number;      // CSS-pixel diameter (5-100), display intent
  history: Stroke[];

  setSource: (id: string | null) => void;
  setBrushSize: (n: number) => void;
  pushStroke: (s: Stroke) => void;
  popStroke: () => void;
  clearStrokes: () => void;
};

export const useMaskStore = create<MaskStore>((set) => ({
  sourceImageId: null,
  brushSize: 30,
  history: [],

  setSource:    (sourceImageId) => set({ sourceImageId, history: [] }),
  setBrushSize: (brushSize)     => set({ brushSize }),
  pushStroke:   (s)             => set((st) => ({ history: [...st.history, s] })),
  popStroke:    ()              => set((st) => ({ history: st.history.slice(0, -1) })),
  clearStrokes: ()              => set({ history: [] }),
}));
