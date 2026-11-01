import { findPath, clampToWorld } from './pathfinding';
import { COMMAND_POST, HAZARDS, RESCUER_SPAWNS, SAFE_RADIUS, SAFE_ZONE, VICTIM_SPAWNS, distance, sectorName } from './world';
import type { AidKind, GameState, LogEntry, LogLevel, OrderKind, Rescuer, Vec2, Victim } from './types';

export interface CommandResult {
  ok: boolean;
  message: string;
}

const AID_META: Record<AidKind, { label: string; cooldown: number }> = {
  oxygen: { label: 'Oxígeno suplementario', cooldown: 18 },
  hydration: { label: 'Hidratación y enfriamiento', cooldown: 18 },
  medical: { label: 'Estabilización médica', cooldown: 22 },
  support: { label: 'Equipo de extracción', cooldown: 25 },
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function createInitialState(): GameState {
  const rescuers: Rescuer[] = RESCUER_SPAWNS.map((s, i) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    role: s.role,
    color: s.color,
    position: { ...s.position },
    vitals: { ...s.vitals },
    history: Array.from({ length: 24 }, () => ({ ...s.vitals })),
    status: 'idle',
    trapped: false,
    needsHelp: false,
    task: { type: 'idle' },
    path: [],
    workProgress: 0,
    workDuration: 0,
    carrying: null,
    restTimer: 0,
    held: false,
  }));

  // Two situations are already visible when the operation begins, so the
  // player immediately has meaningful remote decisions to make.
  rescuers[2].vitals = { spo2: 93, heartRate: 112, temperature: 37.6, energy: 68 };
  rescuers[2].history = Array.from({ length: 24 }, () => ({ ...rescuers[2].vitals }));
  rescuers[3].position = { x: 20, z: -14 };
  rescuers[3].trapped = true;
  rescuers[3].status = 'trapped';
  rescuers[3].needsHelp = true;
  rescuers[2].needsHelp = true;
  rescuers[3].vitals = { spo2: 94, heartRate: 108, temperature: 37.4, energy: 75 };
  rescuers[3].history = Array.from({ length: 24 }, () => ({ ...rescuers[3].vitals }));

  const victims: Victim[] = VICTIM_SPAWNS.map((v) => ({
    id: v.id,
    code: v.code,
    name: v.name,
    position: { ...v.position },
    status: 'hidden',
    health: v.health,
    trapped: v.trapped,
    assignedTo: null,
    carriedBy: null,
  }));

  return {
    phase: 'ready',
    elapsed: 0,
    timeLimit: 360,
    speed: 1,
    selectedId: 'r3',
    autoSearch: true,
    rescuers,
    victims,
    hazards: HAZARDS.map((h) => ({ ...h, position: { ...h.position } })),
    deliveries: [],
    stock: { oxygen: 4, hydration: 4, medical: 3, support: 3 },
    cooldowns: {},
    log: [
      { id: 1, time: 0, level: 'info', message: 'Red de telemetría establecida. Cuatro rescatistas conectados.' },
      { id: 2, time: 0, level: 'warn', message: 'R-03 presenta SpO₂ bajo. R-04 reporta atrapamiento en sector C-1.' },
      { id: 3, time: 0, level: 'info', message: 'Ocho señales civiles por localizar. Punto seguro activo en A-3.' },
    ],
    rescued: 0,
    aidsUsed: 0,
    eventsFired: [],
    endReason: '',
  };
}

export class GameEngine {
  state: GameState = createInitialState();
  private listeners = new Set<() => void>();
  private snapshot: GameState = structuredClone(this.state);
  private logId = 10;
  private deliveryId = 1;
  private notifyAccumulator = 0;
  private historyAccumulator = 0;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): GameState => this.snapshot;

  private notify() {
    this.snapshot = structuredClone(this.state);
    this.listeners.forEach((fn) => fn());
  }

  private log(level: LogLevel, message: string) {
    const entry: LogEntry = { id: this.logId++, time: this.state.elapsed, level, message };
    this.state.log = [entry, ...this.state.log].slice(0, 80);
  }

  reset() {
    this.state = createInitialState();
    this.logId = 10;
    this.deliveryId = 1;
    this.notifyAccumulator = 0;
    this.historyAccumulator = 0;
    this.notify();
  }

  start(): CommandResult {
    if (this.state.phase !== 'ready') return { ok: false, message: 'La operación ya fue iniciada.' };
    this.state.phase = 'running';
    this.log('info', 'Operación iniciada. Búsqueda automática activada.');
    if (this.state.autoSearch) {
      for (const r of this.state.rescuers) this.assignSearch(r);
    }
    this.notify();
    return { ok: true, message: 'Operación en marcha. Selecciona un rescatista para enviar ayuda.' };
  }

  togglePause(): CommandResult {
    if (this.state.phase === 'running') {
      this.state.phase = 'paused';
      this.notify();
      return { ok: true, message: 'Simulación en pausa.' };
    }
    if (this.state.phase === 'paused') {
      this.state.phase = 'running';
      this.notify();
      return { ok: true, message: 'Simulación reanudada.' };
    }
    return { ok: false, message: 'Inicia la operación primero.' };
  }

  setSpeed(speed: 1 | 2 | 4) {
    this.state.speed = speed;
    this.notify();
  }

  select(id: string) {
    if (!this.state.rescuers.some((r) => r.id === id)) return;
    this.state.selectedId = id;
    this.notify();
  }

  setAutoSearch(value: boolean) {
    this.state.autoSearch = value;
    if (value && this.state.phase === 'running') {
      for (const r of this.state.rescuers) {
        if (r.status === 'idle' && !r.trapped && !r.held) this.assignSearch(r);
      }
    }
    this.log('info', `Búsqueda automática ${value ? 'activada' : 'desactivada'}.`);
    this.notify();
  }

  private canAct(r: Rescuer): boolean {
    return !r.trapped && r.status !== 'incapacitated';
  }

  private releaseVictim(r: Rescuer) {
    if (!r.carrying) return;
    const v = this.state.victims.find((x) => x.id === r.carrying);
    if (v) {
      v.status = 'located';
      v.carriedBy = null;
      v.assignedTo = null;
      v.position = { ...r.position };
    }
    r.carrying = null;
  }

  private route(r: Rescuer, goal: Vec2): boolean {
    const path = findPath(r.position, goal);
    if (!path.length) return false;
    r.path = path;
    return true;
  }

  private clearAssignment(r: Rescuer) {
    if (!r.task.victimId) return;
    const previous = this.state.victims.find((v) => v.id === r.task.victimId);
    if (previous && previous.assignedTo === r.id && previous.status !== 'carried' && previous.status !== 'safe') {
      previous.assignedTo = null;
      if (previous.status === 'extracting') previous.status = 'located';
    }
  }

  private assignSearch(r: Rescuer): boolean {
    if (!this.canAct(r) || r.carrying) return false;
    this.clearAssignment(r);
    const candidates = this.state.victims
      .filter((v) => (v.status === 'hidden' || v.status === 'located') && !v.assignedTo)
      .sort((a, b) => distance(r.position, a.position) - distance(r.position, b.position));
    const target = candidates[0];
    if (!target) {
      if (this.state.victims.every((v) => v.status === 'safe' || v.carriedBy)) this.order(r.id, 'return');
      return false;
    }
    target.assignedTo = r.id;
    r.task = { type: 'rescue', victimId: target.id };
    r.workProgress = 0;
    r.workDuration = 0;
    if (!this.route(r, target.position)) {
      target.assignedTo = null;
      r.task = { type: 'idle' };
      return false;
    }
    r.status = 'moving';
    return true;
  }

  order(unitId: string, kind: OrderKind): CommandResult {
    const r = this.state.rescuers.find((x) => x.id === unitId);
    if (!r) return { ok: false, message: 'Rescatista no encontrado.' };
    if (this.state.phase !== 'running' && this.state.phase !== 'paused') return { ok: false, message: 'Inicia la operación para enviar órdenes.' };
    if (!this.canAct(r)) return { ok: false, message: `${r.code} está ${r.trapped ? 'atrapado' : 'incapacitado'}. Envía apoyo remoto primero.` };

    if (kind === 'search') {
      r.held = false;
      this.releaseVictim(r);
      const ok = this.assignSearch(r);
      this.notify();
      return ok
        ? { ok: true, message: `${r.code} inicia búsqueda de civiles.` }
        : { ok: false, message: 'No hay señales libres. Todos los civiles están asignados o a salvo.' };
    }
    if (kind === 'return') {
      r.held = false;
      if (r.carrying) {
        r.task = { type: 'return', victimId: r.carrying };
      } else {
        r.task = { type: 'return' };
      }
      if (!this.route(r, SAFE_ZONE)) return { ok: false, message: 'No se encontró una ruta segura.' };
      r.status = r.carrying ? 'carrying' : 'returning';
      this.log('info', `${r.code} se dirige al punto seguro${r.carrying ? ' con civil' : ''}.`);
      this.notify();
      return { ok: true, message: `${r.code} regresa al punto seguro.` };
    }
    // hold
    this.releaseVictim(r);
    r.held = true;
    r.task = { type: 'idle' };
    r.path = [];
    r.status = 'idle';
    r.workProgress = 0;
    this.log('info', `${r.code} mantiene posición.`);
    this.notify();
    return { ok: true, message: `${r.code} mantiene posición.` };
  }

  moveTo(unitId: string, point: Vec2): CommandResult {
    const r = this.state.rescuers.find((x) => x.id === unitId);
    if (!r) return { ok: false, message: 'Rescatista no encontrado.' };
    if (this.state.phase !== 'running' && this.state.phase !== 'paused') return { ok: false, message: 'Inicia la operación primero.' };
    if (!this.canAct(r)) return { ok: false, message: `${r.code} no puede moverse. Envía apoyo remoto.` };
    if (distance(point, SAFE_ZONE) < SAFE_RADIUS) return this.order(unitId, 'return');
    const goal = clampToWorld(point);
    r.held = false;
    this.releaseVictim(r);
    const victim = r.task.victimId ? this.state.victims.find((v) => v.id === r.task.victimId) : null;
    if (victim && victim.assignedTo === r.id && victim.status !== 'carried') victim.assignedTo = null;
    if (!this.route(r, goal)) return { ok: false, message: 'Destino inaccesible. Elige una calle despejada.' };
    r.task = { type: 'move', destination: goal };
    r.status = 'moving';
    r.workProgress = 0;
    this.notify();
    return { ok: true, message: `${r.code} se desplaza al sector ${sectorName(goal)}.` };
  }

  rescueVictim(unitId: string, victimId: string): CommandResult {
    const r = this.state.rescuers.find((x) => x.id === unitId);
    const v = this.state.victims.find((x) => x.id === victimId);
    if (!r || !v) return { ok: false, message: 'Objetivo no encontrado.' };
    if (this.state.phase !== 'running' && this.state.phase !== 'paused') return { ok: false, message: 'Inicia la operación primero.' };
    if (!this.canAct(r)) return { ok: false, message: `${r.code} necesita apoyo antes de recibir órdenes.` };
    if (v.status === 'safe' || v.status === 'carried') return { ok: false, message: 'Ese civil ya está siendo atendido.' };
    if (v.assignedTo && v.assignedTo !== r.id) {
      const other = this.state.rescuers.find((x) => x.id === v.assignedTo);
      if (other && this.canAct(other)) return { ok: false, message: `${other.code} ya se dirige a ${v.code}.` };
    }
    r.held = false;
    this.releaseVictim(r);
    const previous = r.task.victimId ? this.state.victims.find((x) => x.id === r.task.victimId) : null;
    if (previous && previous.assignedTo === r.id && previous.id !== v.id) previous.assignedTo = null;
    v.assignedTo = r.id;
    r.task = { type: 'rescue', victimId: v.id };
    r.workProgress = 0;
    if (!this.route(r, v.position)) {
      v.assignedTo = null;
      return { ok: false, message: 'No hay ruta hacia el civil.' };
    }
    r.status = 'moving';
    this.log('info', `${r.code} recibe orden de rescatar a ${v.code}.`);
    this.notify();
    return { ok: true, message: `${r.code} se dirige a ${v.code}.` };
  }

  requestAid(unitId: string, kind: AidKind): CommandResult {
    const r = this.state.rescuers.find((x) => x.id === unitId);
    if (!r) return { ok: false, message: 'Rescatista no encontrado.' };
    if (this.state.phase !== 'running' && this.state.phase !== 'paused') return { ok: false, message: 'Inicia la operación para enviar ayuda.' };
    if (this.state.stock[kind] <= 0) return { ok: false, message: `Sin existencias de ${AID_META[kind].label.toLowerCase()}.` };
    const cdKey = `${unitId}:${kind}`;
    if ((this.state.cooldowns[cdKey] ?? 0) > 0) return { ok: false, message: 'Ayuda en enfriamiento. Espera unos segundos.' };
    if (this.state.deliveries.some((d) => d.unitId === unitId && d.kind === kind)) return { ok: false, message: 'Ya hay un envío en camino.' };
    if (kind === 'support' && !r.trapped && r.status !== 'incapacitated') {
      return { ok: false, message: 'El equipo de extracción se usa con rescatistas atrapados o incapacitados.' };
    }
    this.state.stock[kind] -= 1;
    this.state.aidsUsed += 1;
    this.state.cooldowns[cdKey] = AID_META[kind].cooldown;
    const duration = clamp(3 + distance(COMMAND_POST, r.position) / 22, 3.5, 8);
    this.state.deliveries.push({
      id: `d${this.deliveryId++}`,
      kind,
      unitId,
      from: { ...COMMAND_POST },
      progress: 0,
      duration,
    });
    this.log('info', `Dron despachado a ${r.code}: ${AID_META[kind].label.toLowerCase()}.`);
    this.notify();
    return { ok: true, message: `Ayuda en camino a ${r.code} · ${Math.ceil(duration)} s.` };
  }

  private applyAid(r: Rescuer, kind: AidKind) {
    if (kind === 'oxygen') {
      r.vitals.spo2 = clamp(r.vitals.spo2 + 8, 0, 100);
      r.vitals.heartRate = clamp(r.vitals.heartRate - 8, 55, 180);
    } else if (kind === 'hydration') {
      r.vitals.temperature = clamp(r.vitals.temperature - 1.1, 36.2, 41);
      r.vitals.heartRate = clamp(r.vitals.heartRate - 15, 55, 180);
      r.vitals.energy = clamp(r.vitals.energy + 10, 0, 100);
    } else if (kind === 'medical') {
      r.vitals.energy = clamp(r.vitals.energy + 28, 0, 100);
      r.vitals.spo2 = clamp(r.vitals.spo2 + 4, 0, 100);
      r.vitals.heartRate = clamp(r.vitals.heartRate - 20, 55, 180);
      r.vitals.temperature = clamp(r.vitals.temperature - 0.5, 36.2, 41);
    } else if (kind === 'support') {
      r.trapped = false;
      r.vitals.spo2 = Math.max(r.vitals.spo2, 95);
      r.vitals.energy = Math.max(r.vitals.energy, 45);
      r.vitals.heartRate = Math.min(r.vitals.heartRate, 100);
      this.log('success', `${r.code} fue liberado por el equipo de extracción.`);
    }
    if (r.status === 'incapacitated') {
      r.status = 'idle';
      r.task = { type: 'idle' };
      r.path = [];
      this.log('success', `${r.code} recuperó signos operativos.`);
    }
    r.needsHelp = this.computeNeedsHelp(r);
    this.log('success', `${AID_META[kind].label} entregado a ${r.code}.`);
    if (this.state.autoSearch && r.status === 'idle' && !r.carrying && !r.held) this.assignSearch(r);
  }

  private computeNeedsHelp(r: Rescuer): boolean {
    return r.trapped || r.status === 'incapacitated' || r.vitals.spo2 < 95 || r.vitals.heartRate > 120 || r.vitals.temperature >= 37.8 || r.vitals.energy < 30;
  }

  private fireEvent(id: string, fn: () => void) {
    if (this.state.eventsFired.includes(id)) return;
    this.state.eventsFired.push(id);
    fn();
  }

  private updateEvents() {
    const t = this.state.elapsed;
    if (t >= 55 && t < 75) {
      this.fireEvent('aftershock-warning', () => this.log('warn', 'Réplica sísmica en 20 s. Aléjate de estructuras inestables.'));
    }
    if (t >= 75) {
      this.fireEvent('aftershock', () => {
        const collapse = this.state.hazards.find((h) => h.kind === 'collapse')!;
        const exposed = this.state.rescuers
          .filter((r) => this.canAct(r) && distance(r.position, collapse.position) < collapse.radius + 4)
          .sort((a, b) => distance(a.position, collapse.position) - distance(b.position, collapse.position))[0];
        if (exposed) {
          this.releaseVictim(exposed);
          exposed.trapped = true;
          exposed.status = 'trapped';
          exposed.path = [];
          exposed.task = { type: 'idle' };
          this.log('critical', `¡Réplica! ${exposed.code} quedó atrapado por escombros. Envía equipo de extracción.`);
        } else {
          this.log('info', 'Réplica superada. Ningún rescatista quedó atrapado.');
        }
      });
    }
    if (t >= 120) {
      this.fireEvent('fire-spread', () => {
        const fire = this.state.hazards.find((h) => h.kind === 'fire')!;
        fire.radius += 2;
        this.log('warn', 'El incendio se extendió en sector C-1. Evita la zona marcada.');
      });
    }
  }

  private updateVitals(r: Rescuer, dt: number) {
    const v = r.vitals;
    const working = r.status === 'extracting' || r.status === 'carrying';
    const moving = r.status === 'moving' || r.status === 'returning' || r.status === 'searching';
    const atSafe = distance(r.position, SAFE_ZONE) < SAFE_RADIUS;

    let spo2Target = 97.5;
    let hrTarget = 78;
    let tempTarget = 36.9;
    let energyDelta = 0;

    if (moving) {
      spo2Target -= 1.2;
      hrTarget += 22;
      tempTarget += 0.35;
      energyDelta -= 0.055;
    }
    if (working) {
      spo2Target -= 2.4;
      hrTarget += 36;
      tempTarget += 0.65;
      energyDelta -= r.status === 'extracting' ? 0.11 : 0.085;
    }
    if (r.trapped) {
      spo2Target -= 4.5;
      hrTarget += 30;
      energyDelta -= 0.04;
    }
    if (atSafe && !r.trapped && r.status !== 'incapacitated') {
      energyDelta += r.status === 'idle' || r.status === 'safe' ? 0.9 : 0.15;
      spo2Target = 98;
      hrTarget = 76;
      tempTarget = 36.8;
    }

    for (const h of this.state.hazards) {
      const d = distance(r.position, h.position);
      if (d > h.radius) continue;
      const strength = 1 - d / h.radius;
      if (h.kind === 'gas') {
        spo2Target -= 5 * strength;
        hrTarget += 18 * strength;
      } else if (h.kind === 'fire') {
        tempTarget += 1.8 * strength;
        hrTarget += 22 * strength;
        spo2Target -= 2 * strength;
      }
    }

    if (r.status !== 'incapacitated') {
      v.spo2 += (spo2Target - v.spo2) * Math.min(1, dt * 0.045);
      v.heartRate += (hrTarget - v.heartRate) * Math.min(1, dt * 0.06);
      v.temperature += (tempTarget - v.temperature) * Math.min(1, dt * 0.035);
      v.energy = clamp(v.energy + energyDelta * dt, 0, 100);
    }

    if (!r.trapped && r.status !== 'incapacitated' && (v.spo2 < 85 || v.energy <= 4 || v.temperature >= 40 || v.heartRate >= 170)) {
      this.releaseVictim(r);
      r.status = 'incapacitated';
      r.task = { type: 'idle' };
      r.path = [];
      this.log('critical', `${r.code} quedó incapacitado. Requiere estabilización médica o extracción.`);
    }
    r.needsHelp = this.computeNeedsHelp(r);
  }

  private moveAlongPath(r: Rescuer, dt: number) {
    if (!r.path.length) return;
    const speed = r.carrying ? 3.4 : r.role === 'Transporte' ? 5.2 : 4.6;
    let remaining = speed * dt;
    while (remaining > 0 && r.path.length) {
      const next = r.path[0];
      const d = distance(r.position, next);
      if (d <= remaining) {
        r.position = { ...next };
        r.path.shift();
        remaining -= d;
      } else {
        r.position.x += ((next.x - r.position.x) / d) * remaining;
        r.position.z += ((next.z - r.position.z) / d) * remaining;
        remaining = 0;
      }
    }
  }

  private updateTask(r: Rescuer, dt: number) {
    if (r.trapped || r.status === 'incapacitated') return;

    if (r.task.type === 'move' || r.task.type === 'return') {
      this.moveAlongPath(r, dt);
      if (!r.path.length) {
        if (r.carrying) {
          const v = this.state.victims.find((x) => x.id === r.carrying);
          if (v) {
            v.status = 'safe';
            v.carriedBy = null;
            v.assignedTo = null;
            v.position = { ...SAFE_ZONE };
            this.state.rescued += 1;
            this.log('success', `${v.code} llegó al punto seguro. Civiles a salvo: ${this.state.rescued}/8.`);
          }
          r.carrying = null;
        }
        r.task = { type: 'idle' };
        r.status = distance(r.position, SAFE_ZONE) < SAFE_RADIUS ? 'safe' : 'idle';
        if (this.state.autoSearch) this.assignSearch(r);
      }
      return;
    }

    if (r.task.type === 'rescue' && r.task.victimId) {
      const v = this.state.victims.find((x) => x.id === r.task.victimId);
      if (!v || v.status === 'safe' || (v.carriedBy && v.carriedBy !== r.id)) {
        r.task = { type: 'idle' };
        r.status = 'idle';
        r.path = [];
        if (this.state.autoSearch) this.assignSearch(r);
        return;
      }
      const d = distance(r.position, v.position);
      if (d > 2.2) {
        this.moveAlongPath(r, dt);
        if (v.status === 'hidden' && d < 9) {
          v.status = 'located';
          this.log('info', `${r.code} localizó a ${v.code} en sector ${sectorName(v.position)}.`);
        }
        return;
      }
      // Arrived at the civilian.
      r.path = [];
      if (v.status === 'hidden') {
        v.status = 'located';
        this.log('info', `${r.code} localizó a ${v.code}.`);
      }
      if (r.workDuration === 0) {
        r.workDuration = v.trapped ? (r.role === 'Rescate técnico' ? 6 : 9) : 3.5;
        if (r.role === 'Medicina') r.workDuration *= 0.75;
        v.status = 'extracting';
      }
      r.status = 'extracting';
      r.workProgress += dt;
      if (r.workProgress >= r.workDuration) {
        v.status = 'carried';
        v.carriedBy = r.id;
        r.carrying = v.id;
        r.workProgress = 0;
        r.workDuration = 0;
        r.task = { type: 'return', victimId: v.id };
        r.status = 'carrying';
        this.route(r, SAFE_ZONE);
        this.log('info', `${r.code} extrajo a ${v.code} y lo traslada al punto seguro.`);
      }
      return;
    }

    if (r.task.type === 'idle' && !r.held && this.state.autoSearch && distance(r.position, SAFE_ZONE) >= SAFE_RADIUS) {
      this.assignSearch(r);
    }
  }

  private updateVictims(dt: number) {
    for (const v of this.state.victims) {
      if (v.status === 'safe') continue;
      const decay = v.status === 'carried' ? 0.008 : v.status === 'hidden' ? 0.018 : 0.028;
      v.health = clamp(v.health - decay * dt, 5, 100);
      if (v.carriedBy) {
        const carrier = this.state.rescuers.find((r) => r.id === v.carriedBy);
        if (carrier) v.position = { ...carrier.position };
      }
    }
  }

  private updateDeliveries(dt: number) {
    for (const [key, value] of Object.entries(this.state.cooldowns)) {
      this.state.cooldowns[key] = Math.max(0, value - dt);
    }
    const remaining = [];
    for (const d of this.state.deliveries) {
      d.progress += dt / d.duration;
      if (d.progress >= 1) {
        const r = this.state.rescuers.find((x) => x.id === d.unitId);
        if (r) this.applyAid(r, d.kind);
      } else {
        remaining.push(d);
      }
    }
    this.state.deliveries = remaining;
  }

  private checkEnd() {
    if (this.state.rescued >= this.state.victims.length) {
      this.state.phase = 'won';
      this.state.endReason = 'Los ocho civiles llegaron al punto seguro. Operación completada.';
      this.log('success', 'Misión cumplida. Todos los civiles están a salvo.');
      return;
    }
    if (this.state.elapsed >= this.state.timeLimit) {
      this.state.phase = 'lost';
      this.state.endReason = `Tiempo agotado. ${this.state.rescued} de 8 civiles llegaron al punto seguro.`;
      this.log('critical', 'Tiempo agotado. Fin de la operación.');
      return;
    }
    const allDown = this.state.rescuers.every((r) => r.trapped || r.status === 'incapacitated');
    const supportAvailable = this.state.stock.support > 0 || this.state.deliveries.some((d) => d.kind === 'support' || d.kind === 'medical');
    const medicalAvailable = this.state.stock.medical > 0;
    if (allDown && !supportAvailable && !medicalAvailable) {
      this.state.phase = 'lost';
      this.state.endReason = 'Todo el equipo quedó fuera de operación y no quedan recursos de rescate.';
      this.log('critical', 'Equipo fuera de operación. Fin de la simulación.');
    }
  }

  /** Advance the simulation. dt is real seconds; speed is applied internally. */
  tick(realDt: number) {
    if (this.state.phase !== 'running') return;
    let dt = Math.min(realDt, 0.25) * this.state.speed;
    // Sub-step so movement and vitals stay stable at 4×.
    while (dt > 0 && this.state.phase === 'running') {
      const step = Math.min(dt, 0.05);
      dt -= step;
      this.state.elapsed += step;
      this.updateEvents();
      this.updateDeliveries(step);
      for (const r of this.state.rescuers) {
        this.updateVitals(r, step);
        this.updateTask(r, step);
      }
      this.updateVictims(step);
      this.checkEnd();
    }
    this.historyAccumulator += realDt;
    if (this.historyAccumulator >= 1) {
      this.historyAccumulator = 0;
      for (const r of this.state.rescuers) {
        r.history.push({ ...r.vitals });
        if (r.history.length > 30) r.history.shift();
      }
    }
    this.notifyAccumulator += realDt;
    if (this.notifyAccumulator >= 0.1 || this.state.phase !== 'running') {
      this.notifyAccumulator = 0;
      this.notify();
    }
  }

  score(): number {
    const timeBonus = Math.max(0, Math.round((this.state.timeLimit - this.state.elapsed) * 2));
    const healthBonus = Math.round(this.state.victims.reduce((s, v) => s + v.health, 0) / this.state.victims.length);
    const teamBonus = this.state.rescuers.filter((r) => !r.trapped && r.status !== 'incapacitated').length * 50;
    return this.state.rescued * 200 + timeBonus + healthBonus + teamBonus - this.state.aidsUsed * 10;
  }
}

export const engine = new GameEngine();
