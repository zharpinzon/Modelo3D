import { useEffect, useState } from 'react';
import { Activity, Heart, Radio, Thermometer, Users, Zap } from 'lucide-react';
import { subscribeMonitor, type SyncMessage } from '../game/sync';
import type { GameState } from '../game/types';
import { formatTime, sectorName } from '../game/world';
import Sparkline from './Sparkline';
import { STATUS_LABEL, energySeverity, hrSeverity, overallSeverity, spo2Severity, tempSeverity, vitalColor } from './vitals';

export default function Monitor() {
  const [state, setState] = useState<GameState | null>(null);
  const [lastSeen, setLastSeen] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const apply = (msg: SyncMessage) => {
      if (msg.type !== 'snapshot') return;
      setState(msg.state);
      setLastSeen(msg.sentAt);
    };
    const unsub = subscribeMonitor(apply);
    // Fallback poll: some browsers throttle BroadcastChannel/storage events in
    // background tabs, so also read the latest snapshot directly each second.
    const poll = window.setInterval(() => {
      try {
        const raw = localStorage.getItem('nexo_rescate_mr_snapshot');
        if (raw) apply(JSON.parse(raw) as SyncMessage);
      } catch {
        /* ignore */
      }
      setNow(Date.now());
    }, 1000);
    return () => {
      unsub();
      window.clearInterval(poll);
    };
  }, []);

  const connected = lastSeen > 0 && now - lastSeen < 8000;

  return (
    <div className="monitor-app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">N</span>
          <div>
            <h1>NEXO Rescate <span className="brand-mr">MR</span></h1>
            <p>Monitor externo · Centro de control</p>
          </div>
        </div>
        <div className="topbar-status">
          <span className={`conn-pill ${connected ? 'on' : 'off'}`}>
            <Radio size={13} /> {connected ? 'SINCRONIZADO' : 'ESPERANDO SEÑAL'}
          </span>
          {state && <span className="clock-pill">{formatTime(Math.max(0, state.timeLimit - state.elapsed))}</span>}
        </div>
      </header>

      {!state ? (
        <div className="monitor-empty">
          <Radio size={40} />
          <h2>Esperando al centro de mando</h2>
          <p>Abre el juego principal en otra pestaña o ventana del mismo navegador. La telemetría se sincroniza automáticamente.</p>
        </div>
      ) : (
        <main className="monitor-grid">
          <section className="monitor-summary panel">
            <div>
              <span className="summary-label">Civiles a salvo</span>
              <strong>{state.rescued} / {state.victims.length}</strong>
            </div>
            <div>
              <span className="summary-label">Tiempo restante</span>
              <strong>{formatTime(Math.max(0, state.timeLimit - state.elapsed))}</strong>
            </div>
            <div>
              <span className="summary-label">Estado</span>
              <strong className={`phase-${state.phase}`}>
                {state.phase === 'ready' ? 'LISTO' : state.phase === 'running' ? 'EN CURSO' : state.phase === 'paused' ? 'PAUSA' : state.phase === 'won' ? 'COMPLETADA' : 'FINALIZADA'}
              </strong>
            </div>
            <div>
              <span className="summary-label">Ayudas enviadas</span>
              <strong>{state.aidsUsed}</strong>
            </div>
          </section>

          <section className="monitor-cards">
            {state.rescuers.map((r) => {
              const sev = overallSeverity(r);
              return (
                <article key={r.id} className={`monitor-card panel sev-border-${sev}`}>
                  <div className="monitor-card-head">
                    <span className="roster-avatar" style={{ background: r.color }}>{r.code.slice(2)}</span>
                    <div>
                      <h3>{r.name}</h3>
                      <p>{r.code} · {r.role} · Sector {sectorName(r.position)}</p>
                    </div>
                    <span className={`status-pill sev-${sev}`}>{STATUS_LABEL[r.status]}</span>
                  </div>
                  <div className="monitor-vitals">
                    <div>
                      <span><Activity size={12} /> SpO₂</span>
                      <strong style={{ color: vitalColor(spo2Severity(r.vitals.spo2)) }}>{Math.round(r.vitals.spo2)}%</strong>
                      <Sparkline values={r.history.map((h) => h.spo2)} color={vitalColor(spo2Severity(r.vitals.spo2))} min={84} max={100} />
                    </div>
                    <div>
                      <span><Heart size={12} /> FC</span>
                      <strong style={{ color: vitalColor(hrSeverity(r.vitals.heartRate)) }}>{Math.round(r.vitals.heartRate)} bpm</strong>
                      <Sparkline values={r.history.map((h) => h.heartRate)} color={vitalColor(hrSeverity(r.vitals.heartRate))} min={50} max={170} />
                    </div>
                    <div>
                      <span><Thermometer size={12} /> Temp</span>
                      <strong style={{ color: vitalColor(tempSeverity(r.vitals.temperature)) }}>{r.vitals.temperature.toFixed(1)} °C</strong>
                      <Sparkline values={r.history.map((h) => h.temperature)} color={vitalColor(tempSeverity(r.vitals.temperature))} min={36} max={40.5} />
                    </div>
                    <div>
                      <span><Zap size={12} /> Energía</span>
                      <strong style={{ color: vitalColor(energySeverity(r.vitals.energy)) }}>{Math.round(r.vitals.energy)}%</strong>
                      <Sparkline values={r.history.map((h) => h.energy)} color={vitalColor(energySeverity(r.vitals.energy))} min={0} max={100} />
                    </div>
                  </div>
                  {r.needsHelp && <div className="monitor-help">Necesita ayuda remota</div>}
                </article>
              );
            })}
          </section>

          <section className="panel monitor-log">
            <div className="panel-head"><h2><Users size={14} /> Registro de operación</h2></div>
            <div className="log-list">
              {state.log.slice(0, 20).map((e) => (
                <div key={e.id} className={`log-item ${e.level}`}>
                  <span className="log-time">{formatTime(e.time)}</span>
                  <span>{e.message}</span>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
