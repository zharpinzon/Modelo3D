import type { GameState } from './types';

const CHANNEL = 'nexo_rescate_mr_v1';
const STORAGE_KEY = 'nexo_rescate_mr_snapshot';

export interface SyncMessage {
  type: 'snapshot';
  state: GameState;
  sentAt: number;
}

export function createPublisher() {
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL);
  } catch {
    channel = null;
  }
  let last = 0;
  return {
    publish(state: GameState, force = false) {
      const now = Date.now();
      if (!force && now - last < 400) return;
      last = now;
      const msg: SyncMessage = { type: 'snapshot', state, sentAt: now };
      try {
        channel?.postMessage(msg);
      } catch {
        /* channel closed */
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(msg));
      } catch {
        /* storage unavailable */
      }
    },
    close() {
      channel?.close();
    },
  };
}

export function subscribeMonitor(onMessage: (msg: SyncMessage) => void): () => void {
  let channel: BroadcastChannel | null = null;
  const handleStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      onMessage(JSON.parse(e.newValue) as SyncMessage);
    } catch {
      /* ignore malformed */
    }
  };
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (e) => onMessage(e.data as SyncMessage);
  } catch {
    channel = null;
  }
  window.addEventListener('storage', handleStorage);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) onMessage(JSON.parse(raw) as SyncMessage);
  } catch {
    /* ignore */
  }
  return () => {
    channel?.close();
    window.removeEventListener('storage', handleStorage);
  };
}
