import { ScrollText } from 'lucide-react';
import type { LogEntry } from '../game/types';
import { formatTime } from '../game/world';

export default function LogPanel({ log }: { log: LogEntry[] }) {
  return (
    <section className="panel log-panel" aria-label="Registro de operación">
      <div className="panel-head">
        <h2><ScrollText size={14} /> Registro</h2>
        <span className="chip">{log.length} eventos</span>
      </div>
      <div className="log-list" role="log" aria-live="polite">
        {log.slice(0, 30).map((e) => (
          <div key={e.id} className={`log-item ${e.level}`}>
            <span className="log-time">{formatTime(e.time)}</span>
            <span>{e.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
