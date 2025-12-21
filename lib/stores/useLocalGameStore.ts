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
    // Cleanup existing game if any
    const { manager } = get();
    if (manager) {
      manager.cleanup();
    }

    const heroId = uuidv4();
    
    // Initialize Manager with callback to update this store
    // The manager runs the shared backend engine locally
    const newManager = new LocalGameManager(variant, heroId, (state) => {
      set({ gameState: state });
    });

    set({ 
      manager: newManager, 
      heroId: heroId,
      // gameState will be set immediately by the manager's constructor callback
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
    if (manager) {
      manager.cleanup();
    }
    set({ manager: null, gameState: null, heroId: null });
  },

  newGame: () => {
    get().startLocalGame();
  }
}));
