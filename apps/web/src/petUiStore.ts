import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

export const PET_SIZE_PX = 88;
export const PET_UI_STORAGE_KEY = "t3code:pet-ui:v1";
export const PET_UI_STORAGE_VERSION = 1;

export type PetPosition = Readonly<{ x: number; y: number }>;

interface PetUiStoreState {
  position: PetPosition | null;
  setPosition: (position: PetPosition | null) => void;
}

export function clampPetPosition(
  x: number,
  y: number,
  size = PET_SIZE_PX,
  viewport: Readonly<{ width: number; height: number }> = {
    width: typeof window !== "undefined" ? window.innerWidth : size,
    height: typeof window !== "undefined" ? window.innerHeight : size,
  },
): PetPosition {
  const margin = 8;
  return {
    x: Math.min(Math.max(x, margin), Math.max(margin, viewport.width - size - margin)),
    y: Math.min(Math.max(y, margin), Math.max(margin, viewport.height - size - margin)),
  };
}

export function defaultPetPosition(
  size = PET_SIZE_PX,
  viewport: Readonly<{ width: number; height: number }> = {
    width: typeof window !== "undefined" ? window.innerWidth : size + 24,
    height: typeof window !== "undefined" ? window.innerHeight : size + 24,
  },
): PetPosition {
  return clampPetPosition(viewport.width - size - 24, viewport.height - size - 24, size, viewport);
}

export const usePetUiStore = create<PetUiStoreState>()(
  persist(
    (set) => ({
      position: null,
      setPosition: (position) => set({ position }),
    }),
    {
      name: PET_UI_STORAGE_KEY,
      version: PET_UI_STORAGE_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ position: state.position }),
    },
  ),
);
