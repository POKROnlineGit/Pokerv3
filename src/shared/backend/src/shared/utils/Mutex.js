export class Mutex {
  constructor() {
    this.queues = new Map();
  }

  /**
   * Execute a task sequentially for a specific key (gameId)
   * @param {string} key - The unique key to lock on (e.g., gameId)
   * @param {Function} task - Async function to execute
   * @returns {Promise<any>} Result of the task
   */
  runExclusive(key, task) {
    if (!this.queues.has(key)) {
      this.queues.set(key, Promise.resolve());
    }

    const currentChain = this.queues.get(key);
    const nextChain = currentChain.then(async () => {
      try {
        return await task();
      } finally {
        // Cleanup: If this is the last task in the chain, delete the key
        // to prevent the Map from growing indefinitely (memory leak fix)
        if (this.queues.get(key) === nextChain) {
          this.queues.delete(key);
        }
      }
    });

    // Update the chain, handling rejections to keep the chain alive for subsequent tasks,
    // but relying on the 'finally' block above for cleanup.
    const safeChain = nextChain.catch(() => {});
    this.queues.set(key, safeChain);
    
    return nextChain;
  }
}

