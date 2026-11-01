import { HAZARDS, WORLD, isWalkable } from './world';
import type { Vec2 } from './types';

const CELL = 2;
const COLS = Math.floor(WORLD.width / CELL);
const ROWS = Math.floor(WORLD.depth / CELL);

function toCell(p: Vec2) {
  return {
    c: Math.max(0, Math.min(COLS - 1, Math.floor((p.x - WORLD.minX) / CELL))),
    r: Math.max(0, Math.min(ROWS - 1, Math.floor((p.z - WORLD.minZ) / CELL))),
  };
}

function toWorld(c: number, r: number): Vec2 {
  return { x: WORLD.minX + c * CELL + CELL / 2, z: WORLD.minZ + r * CELL + CELL / 2 };
}

function key(c: number, r: number) {
  return r * COLS + c;
}

function hazardCost(p: Vec2): number {
  let cost = 0;
  for (const h of HAZARDS) {
    const d = Math.hypot(p.x - h.position.x, p.z - h.position.z);
    if (d < h.radius + 2) cost += h.kind === 'fire' ? 9 : h.kind === 'gas' ? 5 : 2;
  }
  return cost;
}

const walkCache = new Map<number, boolean>();
function cellWalkable(c: number, r: number): boolean {
  const k = key(c, r);
  const cached = walkCache.get(k);
  if (cached !== undefined) return cached;
  const ok = isWalkable(toWorld(c, r));
  walkCache.set(k, ok);
  return ok;
}

function nearestWalkable(c: number, r: number): { c: number; r: number } | null {
  if (cellWalkable(c, r)) return { c, r };
  for (let radius = 1; radius <= 8; radius++) {
    let best: { c: number; r: number } | null = null;
    let bestD = Infinity;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        if (!cellWalkable(nc, nr)) continue;
        const d = dc * dc + dr * dr;
        if (d < bestD) {
          bestD = d;
          best = { c: nc, r: nr };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** A* over a 2 m navigation grid. Returns world-space waypoints, excluding the start. */
export function findPath(start: Vec2, goal: Vec2): Vec2[] {
  const s = nearestWalkable(toCell(start).c, toCell(start).r);
  const g = nearestWalkable(toCell(goal).c, toCell(goal).r);
  if (!s || !g) return [];
  if (s.c === g.c && s.r === g.r) return [toWorld(g.c, g.r)];

  const open = new Map<number, { c: number; r: number; f: number }>();
  const gScore = new Map<number, number>();
  const came = new Map<number, number>();
  const closed = new Set<number>();
  const startKey = key(s.c, s.r);
  const goalKey = key(g.c, g.r);
  const h = (c: number, r: number) => Math.hypot(c - g.c, r - g.r);
  gScore.set(startKey, 0);
  open.set(startKey, { c: s.c, r: s.r, f: h(s.c, s.r) });

  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ];

  let guard = 0;
  while (open.size && guard++ < 8000) {
    let currentKey = -1;
    let current: { c: number; r: number; f: number } | null = null;
    for (const [k, node] of open) {
      if (!current || node.f < current.f) {
        current = node;
        currentKey = k;
      }
    }
    if (!current) break;
    open.delete(currentKey);
    closed.add(currentKey);

    if (currentKey === goalKey) {
      const path: Vec2[] = [];
      let k = goalKey;
      while (k !== startKey) {
        const c = k % COLS;
        const r = Math.floor(k / COLS);
        path.push(toWorld(c, r));
        const prev = came.get(k);
        if (prev === undefined) break;
        k = prev;
      }
      path.reverse();
      return path;
    }

    for (const [dc, dr, base] of dirs) {
      const nc = current.c + dc;
      const nr = current.r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const nk = key(nc, nr);
      if (closed.has(nk) || !cellWalkable(nc, nr)) continue;
      // Do not cut diagonally through building corners.
      if (dc !== 0 && dr !== 0 && (!cellWalkable(current.c + dc, current.r) || !cellWalkable(current.c, current.r + dr))) continue;
      const wp = toWorld(nc, nr);
      const tentative = (gScore.get(currentKey) ?? Infinity) + base + hazardCost(wp) * 0.35;
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        came.set(nk, currentKey);
        gScore.set(nk, tentative);
        open.set(nk, { c: nc, r: nr, f: tentative + h(nc, nr) });
      }
    }
  }
  return [];
}

export function clampToWorld(p: Vec2): Vec2 {
  return {
    x: Math.max(WORLD.minX + 1, Math.min(WORLD.maxX - 1, p.x)),
    z: Math.max(WORLD.minZ + 1, Math.min(WORLD.maxZ - 1, p.z)),
  };
}
