import type { Rescuer, UnitStatus, Vitals } from '../game/types';

export type Severity = 'ok' | 'warn' | 'crit';

export function spo2Severity(v: number): Severity {
  return v < 90 ? 'crit' : v < 95 ? 'warn' : 'ok';
}
export function hrSeverity(v: number): Severity {
  return v > 140 || v < 50 ? 'crit' : v > 110 || v < 55 ? 'warn' : 'ok';
}
export function tempSeverity(v: number): Severity {
  return v >= 39 ? 'crit' : v >= 37.8 ? 'warn' : 'ok';
}
export function energySeverity(v: number): Severity {
  return v <= 20 ? 'crit' : v <= 40 ? 'warn' : 'ok';
}

export function overallSeverity(r: Rescuer): Severity {
  if (r.trapped || r.status === 'incapacitated') return 'crit';
  const levels = [spo2Severity(r.vitals.spo2), hrSeverity(r.vitals.heartRate), tempSeverity(r.vitals.temperature), energySeverity(r.vitals.energy)];
  if (levels.includes('crit')) return 'crit';
  if (levels.includes('warn')) return 'warn';
  return 'ok';
}

export const STATUS_LABEL: Record<UnitStatus, string> = {
  idle: 'En espera',
  moving: 'En ruta',
  searching: 'Buscando',
  extracting: 'Extrayendo',
  carrying: 'Trasladando',
  returning: 'Regresando',
  trapped: 'Atrapado',
  incapacitated: 'Incapacitado',
  safe: 'En zona segura',
};

export function vitalColor(sev: Severity): string {
  return sev === 'crit' ? '#f87171' : sev === 'warn' ? '#fbbf24' : '#34d399';
}

export function formatVitals(v: Vitals) {
  return {
    spo2: `${Math.round(v.spo2)}%`,
    heartRate: `${Math.round(v.heartRate)}`,
    temperature: `${v.temperature.toFixed(1)}°`,
    energy: `${Math.round(v.energy)}%`,
  };
}
