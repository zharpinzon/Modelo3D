import { Activity, Crosshair, Droplets, Heart, LifeBuoy, MapPin, PackageCheck, Radio, Search, ShieldAlert, Siren, Thermometer, Undo2, Wind, Zap } from 'lucide-react';
import type { AidKind, GameState, OrderKind } from '../game/types';
import { sectorName } from '../game/world';
import Sparkline from './Sparkline';
import { STATUS_LABEL, energySeverity, hrSeverity, spo2Severity, tempSeverity, vitalColor } from './vitals';

interface Props {
  state: GameState;
  onAid: (kind: AidKind) => void;
  onOrder: (kind: OrderKind) => void;
}

const AIDS: Array<{ kind: AidKind; name: string; desc: string; icon: typeof Wind; className: string }> = [
  { kind: 'oxygen', name: 'Oxígeno', desc: '+8% SpO₂', icon: Wind, className: 'oxygen' },
  { kind: 'hydration', name: 'Hidratación', desc: '−1.1 °C · −15 bpm', icon: Droplets, className: 'hydration' },
  { kind: 'medical', name: 'Estabilizar', desc: '+28 energía · signos', icon: LifeBuoy, className: 'medical' },
  { kind: 'support', name: 'Extracción', desc: 'Libera atrapados', icon: Siren, className: 'support' },
];

export default function DevicePanel({ state, onAid, onOrder }: Props) {
  const r = state.rescuers.find((x) => x.id === state.selectedId) ?? state.rescuers[0];
  const operational = state.phase === 'running' || state.phase === 'paused';
  const delivery = state.deliveries.find((d) => d.unitId === r.id);
  const taskVictim = r.task.victimId ? state.victims.find((v) => v.id === r.task.victimId) : null;

  const vitals = [
    { key: 'spo2', label: 'SpO₂', value: `${Math.round(r.vitals.spo2)}%`, sev: spo2Severity(r.vitals.spo2), icon: Activity, history: r.history.map((h) => h.spo2), min: 84, max: 100 },
    { key: 'hr', label: 'Frec. cardíaca', value: `${Math.round(r.vitals.heartRate)} bpm`, sev: hrSeverity(r.vitals.heartRate), icon: Heart, history: r.history.map((h) => h.heartRate), min: 50, max: 170 },
    { key: 'temp', label: 'Temperatura', value: `${r.vitals.temperature.toFixed(1)} °C`, sev: tempSeverity(r.vitals.temperature), icon: Thermometer, history: r.history.map((h) => h.temperature), min: 36, max: 40.5 },
    { key: 'energy', label: 'Energía', value: `${Math.round(r.vitals.energy)}%`, sev: energySeverity(r.vitals.energy), icon: Zap, history: r.history.map((h) => h.energy), min: 0, max: 100 },
  ];

  return (
    <aside className="panel device-panel" aria-label="Dispositivo de telemetría">
      <div className="device-frame">
        <div className="device-top">
          <span className="device-brand"><Radio size={14} /> NEXO·LINK</span>
          <span className={`device-link ${operational ? 'on' : ''}`}>{operational ? 'EN VIVO' : 'STANDBY'}</span>
        </div>

        <div className="device-unit">
          <span className="device-avatar" style={{ background: r.color }}>{r.code.slice(2)}</span>
          <div>
            <h3>{r.name}</h3>
            <p>{r.code} · {r.role}</p>
          </div>
          <span className={`status-pill sev-${r.trapped || r.status === 'incapacitated' ? 'crit' : r.needsHelp ? 'warn' : 'ok'}`}>
            {STATUS_LABEL[r.status]}
          </span>
        </div>

        <div className="device-location">
          <MapPin size={13} />
          <span>Sector {sectorName(r.position)} · X {r.position.x.toFixed(0)} / Z {r.position.z.toFixed(0)}</span>
          {r.carrying && <span className="carry-tag"><PackageCheck size={12} /> {taskVictim?.code ?? 'Civil'}</span>}
        </div>

        {(r.trapped || r.status === 'incapacitated' || r.needsHelp) && (
          <div className={`device-alert ${r.trapped || r.status === 'incapacitated' ? 'crit' : 'warn'}`}>
            <ShieldAlert size={15} />
            <span>
              {r.trapped ? 'Atrapado bajo escombros. Envía equipo de extracción.' : r.status === 'incapacitated' ? 'Fuera de operación. Requiere estabilización o extracción.' : 'Signos fuera de rango. Evalúa ayuda remota.'}
            </span>
          </div>
        )}

        <div className="vitals-grid">
          {vitals.map((v) => (
            <div key={v.key} className={`vital-card sev-${v.sev}`}>
              <div className="vital-head">
                <v.icon size={13} />
                <span>{v.label}</span>
              </div>
              <strong style={{ color: vitalColor(v.sev) }}>{v.value}</strong>
              <Sparkline values={v.history} color={vitalColor(v.sev)} min={v.min} max={v.max} />
            </div>
          ))}
        </div>

        {r.status === 'extracting' && r.workDuration > 0 && (
          <div className="work-progress">
            <span>Extrayendo civil… {Math.round((r.workProgress / r.workDuration) * 100)}%</span>
            <div className="progress-track"><div className="progress-fill amber" style={{ width: `${(r.workProgress / r.workDuration) * 100}%` }} /></div>
          </div>
        )}

        {delivery && (
          <div className="delivery-banner">
            <Radio size={14} />
            <span>Dron en camino · {Math.max(0, Math.ceil((1 - delivery.progress) * delivery.duration))} s</span>
            <div className="progress-track"><div className="progress-fill cyan" style={{ width: `${delivery.progress * 100}%` }} /></div>
          </div>
        )}

        <div className="device-section-title">Ayuda remota</div>
        <div className="aid-grid">
          {AIDS.map((a) => {
            const stock = state.stock[a.kind];
            const cd = state.cooldowns[`${r.id}:${a.kind}`] ?? 0;
            const inbound = state.deliveries.some((d) => d.unitId === r.id && d.kind === a.kind);
            const supportOnly = a.kind === 'support' && !r.trapped && r.status !== 'incapacitated';
            const disabled = !operational || stock <= 0 || cd > 0 || inbound || supportOnly;
            return (
              <button
                key={a.kind}
                className={`aid-btn ${a.className}`}
                disabled={disabled}
                onClick={() => onAid(a.kind)}
                title={supportOnly ? 'Solo para rescatistas atrapados o incapacitados' : a.desc}
              >
                <a.icon size={18} />
                <span className="aid-name">{a.name}</span>
                <span className="aid-meta">
                  {inbound ? 'En camino' : cd > 0 ? `${Math.ceil(cd)} s` : `×${stock}`}
                </span>
              </button>
            );
          })}
        </div>

        <div className="device-section-title">Órdenes</div>
        <div className="order-grid">
          <button className="order-btn" disabled={!operational || r.trapped || r.status === 'incapacitated'} onClick={() => onOrder('search')}>
            <Search size={15} /> Buscar
          </button>
          <button className="order-btn" disabled={!operational || r.trapped || r.status === 'incapacitated'} onClick={() => onOrder('return')}>
            <Undo2 size={15} /> Zona segura
          </button>
          <button className="order-btn" disabled={!operational || r.trapped || r.status === 'incapacitated'} onClick={() => onOrder('hold')}>
            <Crosshair size={15} /> Mantener
          </button>
        </div>

        <p className="device-disclaimer">Telemetría simulada con fines educativos. No es un dispositivo médico real.</p>
      </div>
    </aside>
  );
}
