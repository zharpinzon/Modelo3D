export type Vec2 = { x: number; z: number };
export type Phase = 'ready' | 'running' | 'paused' | 'won' | 'lost';
export type UnitStatus = 'idle' | 'moving' | 'searching' | 'extracting' | 'carrying' | 'returning' | 'trapped' | 'incapacitated' | 'safe';
export type VictimStatus = 'hidden' | 'located' | 'extracting' | 'carried' | 'safe';
export type AidKind = 'oxygen' | 'hydration' | 'medical' | 'support';
export type LogLevel = 'info' | 'warn' | 'critical' | 'success';

export interface Vitals {
  spo2: number;
  heartRate: number;
  temperature: number;
  energy: number;
}

export interface Task {
  type: 'idle' | 'move' | 'rescue' | 'return';
  victimId?: string;
  destination?: Vec2;
}

export interface Rescuer {
  id: string;
  code: string;
  name: string;
  role: string;
  color: string;
  position: Vec2;
  vitals: Vitals;
  history: Vitals[];
  status: UnitStatus;
  trapped: boolean;
  needsHelp: boolean;
  task: Task;
  path: Vec2[];
  workProgress: number;
  workDuration: number;
  carrying: string | null;
  restTimer: number;
  held: boolean;
}

export interface Victim {
  id: string;
  code: string;
  name: string;
  position: Vec2;
  status: VictimStatus;
  health: number;
  trapped: boolean;
  assignedTo: string | null;
  carriedBy: string | null;
}

export interface Hazard {
  id: string;
  kind: 'fire' | 'gas' | 'collapse';
  position: Vec2;
  radius: number;
  label: string;
}

export interface Building {
  id: string;
  position: Vec2;
  width: number;
  depth: number;
  height: number;
  collapsed: boolean;
  kind: 'hospital' | 'residential' | 'office' | 'market';
}

export interface Delivery {
  id: string;
  kind: AidKind;
  unitId: string;
  from: Vec2;
  progress: number;
  duration: number;
}

export interface LogEntry {
  id: number;
  time: number;
  level: LogLevel;
  message: string;
}

export interface GameState {
  phase: Phase;
  elapsed: number;
  timeLimit: number;
  speed: 1 | 2 | 4;
  selectedId: string;
  autoSearch: boolean;
  rescuers: Rescuer[];
  victims: Victim[];
  hazards: Hazard[];
  deliveries: Delivery[];
  stock: Record<AidKind, number>;
  cooldowns: Record<string, number>;
  log: LogEntry[];
  rescued: number;
  aidsUsed: number;
  eventsFired: string[];
  endReason: string;
}

export type OrderKind = 'search' | 'return' | 'hold';
