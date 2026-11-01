import { Activity, AlertTriangle, Heart, Thermometer, Zap } from 'lucide-react';
import type { GameState } from '../game/types';
import { STATUS_LABEL, energySeverity, hrSeverity, overallSeverity, spo2Severity, tempSeverity, vitalColor } from './vitals';

interface Props {
  state: GameState;
  onSelect: (id: string) => void;
}

export default function RosterPanel({ state, onSelect }: Props) {
  const active = state.rescuers.filter((r) => !r.trapped && r.status !== 'incapacitated').length;
  return (
    <aside className="panel roster-panel" aria-label="Equipo de rescate">
      <div className="panel-head">
        <h2>Equipo en campo</h2>
        <span className="chip">{active}/{state.rescuers.length} operativos</span>
      </div>
      <div className="roster-list">
        {state.rescuers.map((r) => {
          const sev = overallSeverity(r);
          const selected = r.id === state.selectedId;
          return (
            <button
              key={r.id}
              className={`roster-card sev-${sev}${selected ? ' selected' : ''}`}
              onClick={() => onSelect(r.id)}
              aria-pressed={selected}
            >
              <span className="roster-avatar" style={{ background: r.color }}>{r.code.slice(2)}</span>
              <span className="roster-main">
                <span className="roster-name">
                  {r.name}
                  {r.needsHelp && <AlertTriangle size={13} className="help-icon" aria-label="Necesita ayuda" />}
                </span>
                <span className="roster-role">{r.code} · {r.role}</span>
                <span className="roster-status">{STATUS_LABEL[r.status]}</span>
                <span className="roster-vitals">
                  <span style={{ color: vitalColor(spo2Severity(r.vitals.spo2)) }}><Activity size={11} /> {Math.round(r.vitals.spo2)}%</span>
                  <span style={{ color: vitalColor(hrSeverity(r.vitals.heartRate)) }}><Heart size={11} /> {Math.round(r.vitals.heartRate)}</span>
                  <span style={{ color: vitalColor(tempSeverity(r.vitals.temperature)) }}><Thermometer size={11} /> {r.vitals.temperature.toFixed(1)}°</span>
                  <span style={{ color: vitalColor(energySeverity(r.vitals.energy)) }}><Zap size={11} /> {Math.round(r.vitals.energy)}%</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="roster-foot">
        <div className="objective-row">
          <span>Civiles a salvo</span>
          <strong>{state.rescued} / {state.victims.length}</strong>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${(state.rescued / state.victims.length) * 100}%` }} />
        </div>
        <p className="hint">Selecciona un rescatista para ver su dispositivo y enviar ayuda remota.</p>
      </div>
    </aside>
  );
}
