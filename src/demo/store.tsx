import { createContext, useContext, useState, type ReactNode } from 'react';
import { demoRecipes, type DemoRecipe } from './data';

// Tiny in-memory store for the Phase 0 demo. Replaced by TanStack Query + the database in Phase 1.

type SortKey = 'newest' | 'oldest' | 'az';

type Store = {
  recipes: DemoRecipe[];
  saveRecipe: (r: DemoRecipe) => void;
  deleteRecipe: (id: string) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  editorOpen: boolean;
  editingId: string | null;
  openEditor: (id?: string) => void;
  closeEditor: () => void;
};

const Ctx = createContext<Store | null>(null);

const SORT_KEY = 'cookbook.sort';
const readSort = (): SortKey => {
  try {
    const v = localStorage.getItem(SORT_KEY);
    if (v === 'newest' || v === 'oldest' || v === 'az') return v;
  } catch {
    /* storage unavailable */
  }
  return 'newest';
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [recipes, setRecipes] = useState(demoRecipes);
  const [sort, setSortState] = useState<SortKey>(readSort);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const store: Store = {
    recipes,
    saveRecipe: (r) =>
      setRecipes((list) => (list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : [r, ...list])),
    deleteRecipe: (id) => setRecipes((list) => list.filter((x) => x.id !== id)),
    sort,
    setSort: (s) => {
      setSortState(s);
      try {
        localStorage.setItem(SORT_KEY, s);
      } catch {
        /* storage unavailable */
      }
    },
    editorOpen,
    editingId,
    openEditor: (id) => {
      setEditingId(id ?? null);
      setEditorOpen(true);
    },
    closeEditor: () => setEditorOpen(false),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
};

export type { SortKey };
