import type { Building, Hazard, Vec2 } from './types';

export const WORLD = { width: 100, depth: 72, minX: -50, maxX: 50, minZ: -36, maxZ: 36 };
export const SAFE_ZONE: Vec2 = { x: -38, z: 26 };
export const SAFE_RADIUS = 8;
export const COMMAND_POST: Vec2 = { x: 38, z: 26 };

// Streets lie between the city blocks. Buildings are the only solid obstacles.
export const BUILDINGS: Building[] = [
  { id: 'b1', position: { x: -32, z: -22 }, width: 14, depth: 12, height: 9, collapsed: false, kind: 'hospital' },
  { id: 'b2', position: { x: -10, z: -22 }, width: 12, depth: 12, height: 13, collapsed: false, kind: 'residential' },
  { id: 'b3', position: { x: 12, z: -22 }, width: 13, depth: 12, height: 5, collapsed: true, kind: 'residential' },
  { id: 'b4', position: { x: 34, z: -22 }, width: 12, depth: 12, height: 11, collapsed: false, kind: 'office' },
  { id: 'b5', position: { x: -32, z: 0 }, width: 14, depth: 12, height: 4, collapsed: true, kind: 'market' },
  { id: 'b6', position: { x: -10, z: 0 }, width: 12, depth: 12, height: 10, collapsed: false, kind: 'residential' },
  { id: 'b7', position: { x: 12, z: 0 }, width: 13, depth: 12, height: 12, collapsed: false, kind: 'office' },
  { id: 'b8', position: { x: 34, z: 0 }, width: 12, depth: 12, height: 6, collapsed: true, kind: 'residential' },
  { id: 'b9', position: { x: -10, z: 22 }, width: 12, depth: 11, height: 8, collapsed: false, kind: 'residential' },
  { id: 'b10', position: { x: 12, z: 22 }, width: 13, depth: 11, height: 5, collapsed: true, kind: 'market' },
];

export const HAZARDS: Hazard[] = [
  { id: 'h-fire', kind: 'fire', position: { x: 23, z: -11 }, radius: 6, label: 'Incendio activo' },
  { id: 'h-gas', kind: 'gas', position: { x: -21, z: 11 }, radius: 6.5, label: 'Fuga de gas' },
  { id: 'h-collapse', kind: 'collapse', position: { x: 12, z: -22 }, radius: 9, label: 'Estructura inestable' },
];

export const VICTIM_SPAWNS: Array<{ id: string; code: string; name: string; position: Vec2; trapped: boolean; health: number }> = [
  { id: 'v1', code: 'C-01', name: 'Persona 01', position: { x: -24, z: -22 }, trapped: true, health: 82 },
  { id: 'v2', code: 'C-02', name: 'Persona 02', position: { x: -2, z: -27 }, trapped: false, health: 90 },
  { id: 'v3', code: 'C-03', name: 'Persona 03', position: { x: 20, z: -22 }, trapped: true, health: 74 },
  { id: 'v4', code: 'C-04', name: 'Persona 04', position: { x: 42, z: -16 }, trapped: false, health: 88 },
  { id: 'v5', code: 'C-05', name: 'Persona 05', position: { x: -24, z: 0 }, trapped: true, health: 78 },
  { id: 'v6', code: 'C-06', name: 'Persona 06', position: { x: -2, z: 6 }, trapped: false, health: 92 },
  { id: 'v7', code: 'C-07', name: 'Persona 07', position: { x: 20, z: 6 }, trapped: true, health: 70 },
  { id: 'v8', code: 'C-08', name: 'Persona 08', position: { x: 4, z: 28 }, trapped: false, health: 86 },
];

export const RESCUER_SPAWNS = [
  { id: 'r1', code: 'R-01', name: 'Valeria Ríos', role: 'Búsqueda', color: '#38bdf8', position: { x: -38, z: 18 }, vitals: { spo2: 98, heartRate: 82, temperature: 36.8, energy: 92 } },
  { id: 'r2', code: 'R-02', name: 'Mateo Torres', role: 'Medicina', color: '#34d399', position: { x: -32, z: 26 }, vitals: { spo2: 97, heartRate: 88, temperature: 37.0, energy: 88 } },
  { id: 'r3', code: 'R-03', name: 'Camila Vega', role: 'Transporte', color: '#fbbf24', position: { x: -44, z: 26 }, vitals: { spo2: 96, heartRate: 90, temperature: 37.1, energy: 95 } },
  { id: 'r4', code: 'R-04', name: 'Diego Rojas', role: 'Rescate técnico', color: '#c084fc', position: { x: -38, z: 32 }, vitals: { spo2: 97, heartRate: 84, temperature: 36.9, energy: 90 } },
];

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function isInsideBuilding(p: Vec2, margin = 0): boolean {
  return BUILDINGS.some((b) =>
    Math.abs(p.x - b.position.x) <= b.width / 2 + margin &&
    Math.abs(p.z - b.position.z) <= b.depth / 2 + margin,
  );
}

export function isWalkable(p: Vec2): boolean {
  return p.x >= WORLD.minX + 1 && p.x <= WORLD.maxX - 1 && p.z >= WORLD.minZ + 1 && p.z <= WORLD.maxZ - 1 && !isInsideBuilding(p, 0.9);
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function sectorName(p: Vec2): string {
  const col = p.x < -20 ? 'A' : p.x < 5 ? 'B' : p.x < 28 ? 'C' : 'D';
  const row = p.z < -10 ? '1' : p.z < 12 ? '2' : '3';
  return `${col}-${row}`;
}
