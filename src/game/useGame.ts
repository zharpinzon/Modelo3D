import { useSyncExternalStore } from 'react';
import { engine } from './engine';

export function useGame() {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
}

export { engine };
