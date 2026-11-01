import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, CircleHelp, ExternalLink, Eye, EyeOff, Gauge, Map, Pause, Play, RotateCcw, Route, ShieldCheck, Timer, Users, Volume2, VolumeX, X } from 'lucide-react';
import CityScene from './scene/CityScene';
import RosterPanel from './components/RosterPanel';
import DevicePanel from './components/DevicePanel';
import LogPanel from './components/LogPanel';
import { engine, useGame } from './game/useGame';
import { createPublisher } from './game/sync';
import { formatTime } from './game/world';
import type { AidKind, OrderKind, Vec2 } from './game/types';

interface Toast {
  id: number;
  message: string;
  ok: boolean;
}

export default function App() {
  const state = useGame();
  const [mrMode, setMrMode] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [showPaths, setShowPaths] = useState(true);
  const [showHazards, setShowHazards] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [muted, setMuted] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const publisherRef = useRef<ReturnType<typeof createPublisher> | null>(null);
  const toastId = useRef(0);
  const lastCritical = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);

  const pushToast = useCallback((message: string, ok: boolean) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, message, ok }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  // Simulation loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      engine.tick(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Publish snapshots to the external monitor
  useEffect(() => {
    publisherRef.current = createPublisher();
    publisherRef.current.publish(engine.state, true);
    const interval = window.setInterval(() => publisherRef.current?.publish(engine.state), 500);
    return () => {
      window.clearInterval(interval);
      publisherRef.current?.close();
    };
  }, []);

  // Critical alert sound
  useEffect(() => {
    const critical = state.log.find((e) => e.level === 'critical');
    if (!critical || critical.id === lastCritical.current) return;
    lastCritical.current = critical.id;
    if (muted) return;
    try {
      audioRef.current ??= new AudioContext();
      const ctx = audioRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);
    } catch {
      /* audio unavailable */
    }
  }, [state.log, muted]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (engine.state.phase === 'ready') pushToast(engine.start().message, true);
        else pushToast(engine.togglePause().message, true);
      } else if (e.key >= '1' && e.key <= '4') {
        engine.select(`r${e.key}`);
      } else if (e.key.toLowerCase() === 'h') {
        setShowHelp((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pushToast]);

  const toggleMR = useCallback(async () => {
    if (mrMode) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setMrMode(false);
      setCameraError('');
      return;
    }
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setMrMode(true);
      pushToast('Modo MR activo: la cámara real se mezcla con el mapa táctico.', true);
    } catch {
      setCameraError('No se pudo acceder a la cámara. Revisa permisos o usa HTTPS.');
      pushToast('Cámara no disponible. El modo táctico sigue activo.', false);
    }
  }, [mrMode, pushToast]);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  const handleAid = (kind: AidKind) => {
    const result = engine.requestAid(state.selectedId, kind);
    pushToast(result.message, result.ok);
  };
  const handleOrder = (kind: OrderKind) => {
    const result = engine.order(state.selectedId, kind);
    pushToast(result.message, result.ok);
  };
  const handleGround = (p: Vec2) => {
    if (state.phase !== 'running' && state.phase !== 'paused') return;
    const result = engine.moveTo(state.selectedId, p);
    pushToast(result.message, result.ok);
  };
  const handleVictim = (id: string) => {
    const result = engine.rescueVictim(state.selectedId, id);
    pushToast(result.message, result.ok);
  };

  const remaining = Math.max(0, state.timeLimit - state.elapsed);
  const phaseLabel = state.phase === 'ready' ? 'LISTO' : state.phase === 'running' ? 'EN CURSO' : state.phase === 'paused' ? 'EN PAUSA' : state.phase === 'won' ? 'MISIÓN CUMPLIDA' : 'OPERACIÓN FALLIDA';
  const located = state.victims.filter((v) => v.status !== 'hidden').length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">N</span>
          <div>
            <h1>NEXO Rescate <span className="brand-mr">MR</span></h1>
            <p>Centro de mando · Operación post-sismo</p>
          </div>
        </div>

        <div className="mission-stats">
          <div className={`stat-pill ${remaining < 60 ? 'crit' : remaining < 120 ? 'warn' : ''}`}>
            <Timer size={15} />
            <span className="stat-value">{formatTime(remaining)}</span>
          </div>
          <div className="stat-pill">
            <Users size={15} />
            <span className="stat-value">{state.rescued}/{state.victims.length}</span>
            <span className="stat-label">a salvo</span>
          </div>
          <div className="stat-pill">
            <ShieldCheck size={15} />
            <span className="stat-value">{located}/{state.victims.length}</span>
            <span className="stat-label">localizados</span>
          </div>
          <div className={`stat-pill phase-${state.phase}`}>
            <span className="led" />
            <span>{phaseLabel}</span>
          </div>
        </div>

        <div className="topbar-actions">
          {state.phase === 'ready' ? (
            <button className="btn primary" onClick={() => pushToast(engine.start().message, true)}>
              <Play size={15} /> Iniciar
            </button>
          ) : state.phase === 'running' || state.phase === 'paused' ? (
            <button className="btn" onClick={() => pushToast(engine.togglePause().message, true)}>
              {state.phase === 'running' ? <Pause size={15} /> : <Play size={15} />}
              {state.phase === 'running' ? 'Pausa' : 'Reanudar'}
            </button>
          ) : (
            <button className="btn primary" onClick={() => engine.reset()}>
              <RotateCcw size={15} /> Reiniciar
            </button>
          )}
          <button className="btn icon" title="Velocidad" onClick={() => engine.setSpeed(state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1)}>
            <Gauge size={15} /> {state.speed}×
          </button>
          <button className={`btn icon${mrMode ? ' active' : ''}`} title="Modo realidad mixta (cámara)" onClick={toggleMR}>
            {mrMode ? <CameraOff size={15} /> : <Camera size={15} />} MR
          </button>
          <button className="btn icon" title={muted ? 'Activar sonido' : 'Silenciar'} onClick={() => setMuted((m) => !m)}>
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <a className="btn icon" href="./monitor.html" target="_blank" rel="noreferrer" title="Abrir monitor externo">
            <ExternalLink size={15} />
          </a>
          <button className="btn icon" title="Ayuda (H)" onClick={() => setShowHelp(true)}>
            <CircleHelp size={15} />
          </button>
        </div>
      </header>

      {cameraError && <div className="camera-error">{cameraError}</div>}

      <main className="layout">
        <RosterPanel state={state} onSelect={(id) => engine.select(id)} />

        <section className="map-column">
          <div className={`panel map-panel${mrMode ? ' mr-active' : ''}`}>
            <video ref={videoRef} className="mr-video" playsInline muted />
            <CityScene
              state={state}
              mrMode={mrMode}
              showPaths={showPaths}
              showHazards={showHazards}
              onSelectUnit={(id) => engine.select(id)}
              onSelectVictim={handleVictim}
              onGroundClick={handleGround}
            />

            <div className="map-hud-top">
              <div className="map-title">
                <Map size={14} />
                <span>{mrMode ? 'MR · CÁMARA EN VIVO' : 'MAPA TÁCTICO 3D'}</span>
              </div>
              <div className="map-toggles">
                <button className={`hud-btn${showPaths ? ' on' : ''}`} onClick={() => setShowPaths((v) => !v)} title="Mostrar rutas">
                  <Route size={14} />
                </button>
                <button className={`hud-btn${showHazards ? ' on' : ''}`} onClick={() => setShowHazards((v) => !v)} title="Mostrar peligros">
                  {showHazards ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <label className="auto-toggle" title="Búsqueda automática">
                  <input type="checkbox" checked={state.autoSearch} onChange={(e) => engine.setAutoSearch(e.target.checked)} />
                  <span>Auto-búsqueda</span>
                </label>
              </div>
            </div>

            <div className="map-legend">
              <span><i className="dot safe" /> Punto seguro</span>
              <span><i className="dot victim" /> Civil</span>
              <span><i className="dot fire" /> Incendio</span>
              <span><i className="dot gas" /> Gas</span>
              <span><i className="dot collapse" /> Colapso</span>
            </div>

            <div className="map-hint">Clic en un rescatista para seleccionarlo · Clic en el mapa para moverlo · Clic en un civil para rescatarlo · Arrastra para orbitar</div>

            {state.phase === 'ready' && (
              <div className="briefing-overlay">
                <div className="briefing-card">
                  <span className="briefing-kicker">SIMULACIÓN DE RESCATE · REALIDAD MIXTA</span>
                  <h2>Terremoto en el sector urbano</h2>
                  <p>
                    Ocho civiles quedaron atrapados tras el sismo. Cuatro rescatistas están en campo transmitiendo
                    sus signos vitales a tu dispositivo. Coordínalos a distancia: envía oxígeno, hidratación,
                    estabilización o equipos de extracción, y guía a cada civil al punto seguro.
                  </p>
                  <ul>
                    <li><strong>R-03</strong> tiene el SpO₂ bajo: envíale oxígeno.</li>
                    <li><strong>R-04</strong> está atrapado: necesita un equipo de extracción.</li>
                    <li>Una réplica llegará al minuto 1:15. Aléjate de las estructuras inestables.</li>
                  </ul>
                  <button className="btn primary large" onClick={() => pushToast(engine.start().message, true)}>
                    <Play size={17} /> Iniciar operación
                  </button>
                  <p className="briefing-note">Datos ficticios. Experiencia educativa, no médica.</p>
                </div>
              </div>
            )}

            {(state.phase === 'won' || state.phase === 'lost') && (
              <div className="briefing-overlay">
                <div className={`briefing-card result ${state.phase}`}>
                  <span className="briefing-kicker">{state.phase === 'won' ? 'OPERACIÓN COMPLETADA' : 'OPERACIÓN FINALIZADA'}</span>
                  <h2>{state.phase === 'won' ? 'Todos a salvo' : 'Fin de la operación'}</h2>
                  <p>{state.endReason}</p>
                  <div className="result-stats">
                    <div><span>Civiles</span><strong>{state.rescued}/{state.victims.length}</strong></div>
                    <div><span>Tiempo</span><strong>{formatTime(state.elapsed)}</strong></div>
                    <div><span>Ayudas</span><strong>{state.aidsUsed}</strong></div>
                    <div><span>Puntuación</span><strong>{engine.score()}</strong></div>
                  </div>
                  <button className="btn primary large" onClick={() => engine.reset()}>
                    <RotateCcw size={17} /> Nueva operación
                  </button>
                </div>
              </div>
            )}
          </div>

          <LogPanel log={state.log} />
        </section>

        <DevicePanel state={state} onAid={handleAid} onOrder={handleOrder} />
      </main>

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.ok ? 'ok' : 'err'}`}>{t.message}</div>
        ))}
      </div>

      {showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Ayuda">
            <button className="modal-close" onClick={() => setShowHelp(false)} aria-label="Cerrar"><X size={18} /></button>
            <h2>Cómo jugar</h2>
            <div className="help-grid">
              <div>
                <h3>Objetivo</h3>
                <p>Lleva a los 8 civiles al punto seguro antes de que se agoten los 6 minutos. Mantén con vida y operativos a tus 4 rescatistas.</p>
              </div>
              <div>
                <h3>Dispositivo</h3>
                <p>El panel derecho muestra SpO₂, frecuencia cardíaca, temperatura, energía, ubicación y estado. Verde = normal, ámbar = advertencia, rojo = crítico.</p>
              </div>
              <div>
                <h3>Ayuda remota</h3>
                <p>Los recursos son limitados y llegan en dron. Oxígeno sube el SpO₂; hidratación baja temperatura y pulso; estabilizar recupera energía; extracción libera atrapados.</p>
              </div>
              <div>
                <h3>Órdenes</h3>
                <p>Buscar asigna el civil libre más cercano. Zona segura regresa a la base (con civil si lo carga). Mantener detiene al rescatista. También puedes hacer clic en el mapa o en un civil.</p>
              </div>
              <div>
                <h3>Realidad mixta</h3>
                <p>El botón MR usa tu cámara como fondo y superpone el mapa 3D. Es una aproximación de realidad mixta sin gafas especializadas.</p>
              </div>
              <div>
                <h3>Atajos</h3>
                <p>Espacio: iniciar/pausar · 1–4: seleccionar rescatista · H: ayuda · Rueda: zoom · Arrastrar: orbitar.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
