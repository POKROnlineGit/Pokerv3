'use client';

import { create } from 'zustand';
import { LocalGameManager } from '../features/game/LocalGameManager';
import { v4 as uuidv4 } from 'uuid';

interface LocalGameStore {
  manager: LocalGameManager | null;
  gameState: any | null;
  heroId: string | null;
  
  startLocalGame: (config?: {
    maxPlayers?: number;
    blinds?: { small: number; big: number };
    buyIn?: number;
    startingStack?: number;
  }) => void;
  playerAction: (type: string, amount?: number) => void;
  leaveLocalGame: () => void;
  newGame: () => void;
}

export const useLocalGameStore = create<LocalGameStore>((set, get) => ({
  manager: null,
  gameState: null,
  heroId: null,

  startLocalGame: (config = {}) => {
    // 1. Cleanup old game
    const { manager } = get();
    if (manager) manager.cleanup();

    // 2. Generate Hero ID ONCE
    const newHeroId = uuidv4(); 
    
    // 3. Create config object with defaults for local games
    const gameConfig = {
      maxPlayers: config.maxPlayers || 6,
      blinds: config.blinds || { small: 1, big: 2 },
      buyIn: config.buyIn || 0, // Free for local games
      startingStack: config.startingStack || 200,
      variantSlug: 'local',
      actionTimeoutMs: 30000, // 30 seconds for local games
    };
    
    // 4. Initialize Manager with config object
    const newManager = new LocalGameManager(gameConfig, newHeroId, (state) => {
      // Callback: Update store whenever engine changes
      set({ gameState: state });
    });

    // 5. Set Store State explicitly with the ID we just created
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

