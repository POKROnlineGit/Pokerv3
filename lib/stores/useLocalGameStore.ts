'use client';

import { create } from 'zustand';
import { LocalGameManager } from '../LocalGameManager';
import { v4 as uuidv4 } from 'uuid';

interface LocalGameStore {
  manager: LocalGameManager | null;
  gameState: any | null;
  heroId: string | null;
  
  startLocalGame: (variant?: string) => void;
  playerAction: (type: string, amount?: number) => void;
  leaveLocalGame: () => void;
  newGame: () => void;
}

export const useLocalGameStore = create<LocalGameStore>((set, get) => ({
  manager: null,
  gameState: null,
  heroId: null,

  startLocalGame: (variant = 'six_max') => {
    // 1. Cleanup old game
    const { manager } = get();
    if (manager) manager.cleanup();

    // 2. Generate Hero ID ONCE
    const newHeroId = uuidv4(); 
    
    // 3. Initialize Manager with this ID
    const newManager = new LocalGameManager(variant, newHeroId, (state) => {
      // Callback: Update store whenever engine changes
      set({ gameState: state });
    });

    // 4. Set Store State explicitly with the ID we just created
    set({ 
      manager: newManager, 
      heroId: newHeroId, 
    });
  },

  playerAction: (type: string, amount?: number) => {
    const { manager } = get();
    if (manager) {
      manager.handleAction(type, amount);
    }
  },

  leaveLocalGame: () => {
    const { manager } = get();
    if (manager) manager.cleanup();
    set({ manager: null, gameState: null, heroId: null });
  },

  newGame: () => {
    get().startLocalGame();
  }
}));
