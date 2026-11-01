import { describe, expect, it } from 'vitest';
import { GameEngine, createInitialState } from './engine';
import { findPath } from './pathfinding';
import { BUILDINGS, SAFE_ZONE, isWalkable } from './world';

function runSeconds(engine: GameEngine, seconds: number) {
  const step = 1 / 30;
  for (let t = 0; t < seconds; t += step) engine.tick(step);
}

describe('world / pathfinding', () => {
  it('rejects points inside buildings', () => {
    for (const b of BUILDINGS) {
      expect(isWalkable(b.position)).toBe(false);
    }
  });

  it('finds a path around obstacles between two street points', () => {
    const path = findPath({ x: -38, z: 26 }, { x: 42, z: -28 });
    expect(path.length).toBeGreaterThan(5);
    for (const p of path) expect(isWalkable(p)).toBe(true);
  });

  it('returns a short path for nearby reachable points', () => {
    const path = findPath({ x: -38, z: 26 }, { x: -36, z: 24 });
    expect(path.length).toBeGreaterThan(0);
    expect(path.length).toBeLessThan(6);
  });
});

describe('initial state', () => {
  it('creates four rescuers and eight victims', () => {
    const s = createInitialState();
    expect(s.rescuers).toHaveLength(4);
    expect(s.victims).toHaveLength(8);
    expect(s.phase).toBe('ready');
    expect(s.rescuers[3].trapped).toBe(true);
    expect(s.rescuers[2].vitals.spo2).toBeLessThan(95);
  });
});

describe('GameEngine lifecycle', () => {
  it('does not advance before start', () => {
    const e = new GameEngine();
    runSeconds(e, 5);
    expect(e.state.elapsed).toBe(0);
  });

  it('starts, pauses and resumes', () => {
    const e = new GameEngine();
    expect(e.start().ok).toBe(true);
    runSeconds(e, 2);
    expect(e.state.elapsed).toBeGreaterThan(1);
    e.togglePause();
    const before = e.state.elapsed;
    runSeconds(e, 3);
    expect(e.state.elapsed).toBe(before);
    e.togglePause();
    runSeconds(e, 1);
    expect(e.state.elapsed).toBeGreaterThan(before);
  });

  it('resets to a fresh ready state', () => {
    const e = new GameEngine();
    e.start();
    runSeconds(e, 10);
    e.reset();
    expect(e.state.phase).toBe('ready');
    expect(e.state.elapsed).toBe(0);
    expect(e.state.rescued).toBe(0);
  });
});

describe('remote aid', () => {
  it('rejects aid before the operation starts', () => {
    const e = new GameEngine();
    expect(e.requestAid('r3', 'oxygen').ok).toBe(false);
  });

  it('delivers oxygen after a delay and raises SpO2', () => {
    const e = new GameEngine();
    e.start();
    const before = e.state.rescuers[2].vitals.spo2;
    const result = e.requestAid('r3', 'oxygen');
    expect(result.ok).toBe(true);
    expect(e.state.stock.oxygen).toBe(3);
    expect(e.state.deliveries).toHaveLength(1);
    runSeconds(e, 10);
    expect(e.state.deliveries).toHaveLength(0);
    expect(e.state.rescuers[2].vitals.spo2).toBeGreaterThan(before);
  });

  it('frees a trapped rescuer with support', () => {
    const e = new GameEngine();
    e.start();
    expect(e.state.rescuers[3].trapped).toBe(true);
    expect(e.requestAid('r4', 'support').ok).toBe(true);
    runSeconds(e, 10);
    expect(e.state.rescuers[3].trapped).toBe(false);
  });

  it('rejects support for a healthy mobile rescuer', () => {
    const e = new GameEngine();
    e.start();
    expect(e.requestAid('r1', 'support').ok).toBe(false);
  });

  it('enforces cooldowns and stock limits', () => {
    const e = new GameEngine();
    e.start();
    expect(e.requestAid('r3', 'oxygen').ok).toBe(true);
    expect(e.requestAid('r3', 'oxygen').ok).toBe(false);
    e.state.stock.oxygen = 0;
    e.state.cooldowns['r1:oxygen'] = 0;
    expect(e.requestAid('r1', 'oxygen').ok).toBe(false);
  });
});

describe('orders', () => {
  it('rejects orders for trapped units', () => {
    const e = new GameEngine();
    e.start();
    expect(e.order('r4', 'search').ok).toBe(false);
    expect(e.moveTo('r4', { x: 0, z: 30 }).ok).toBe(false);
  });

  it('assigns a rescue task and moves the unit', () => {
    const e = new GameEngine();
    e.setAutoSearch(false);
    e.start();
    const r = e.state.rescuers[0];
    const start = { ...r.position };
    const result = e.rescueVictim('r1', 'v1');
    expect(result.ok).toBe(true);
    runSeconds(e, 3);
    expect(Math.hypot(r.position.x - start.x, r.position.z - start.z)).toBeGreaterThan(1);
  });

  it('hold stops movement', () => {
    const e = new GameEngine();
    e.start();
    e.order('r1', 'hold');
    const p = { ...e.state.rescuers[0].position };
    runSeconds(e, 2);
    expect(e.state.rescuers[0].position).toEqual(p);
  });
});

describe('full mission simulation', () => {
  it('can rescue all eight civilians with active remote support', () => {
    const e = new GameEngine();
    e.start();
    // Immediately solve the two opening emergencies.
    e.requestAid('r3', 'oxygen');
    e.requestAid('r4', 'support');

    const step = 1 / 20;
    for (let t = 0; t < 360 && e.state.phase === 'running'; t += step) {
      // Keep the team healthy with remote aid whenever possible.
      for (const r of e.state.rescuers) {
        if (r.trapped || r.status === 'incapacitated') {
          e.requestAid(r.id, 'support');
        } else {
          if (r.vitals.spo2 < 94) e.requestAid(r.id, 'oxygen');
          if (r.vitals.energy < 45) e.requestAid(r.id, 'medical');
          if (r.vitals.temperature > 38.2) e.requestAid(r.id, 'hydration');
        }
      }
      e.tick(step);
    }
    expect(e.state.rescued).toBe(8);
    expect(e.state.phase).toBe('won');
  }, 20000);

  it('ends in defeat when time runs out without progress', () => {
    const e = new GameEngine();
    e.setAutoSearch(false);
    e.start();
    for (const r of e.state.rescuers) e.order(r.id, 'hold');
    runSeconds(e, 361);
    expect(e.state.phase).toBe('lost');
    expect(e.state.rescued).toBe(0);
  }, 20000);
});
