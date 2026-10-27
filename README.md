# GUARDIAN MR — Merged Reality Safety System

**Juego interactivo de Realidad Mixta (Merged Reality / Mixed Reality) para simular el dispositivo torácico de la foto.**

> Operario equipado con arnés inteligente que mide **temperatura corporal y ambiental, frecuencia cardíaca (HR), SpO₂ y caídas (acelerómetro)**. El juego expone al operario a condiciones reales de riesgo — **calor extremo, caídas de altura, atrapamiento en espacio confinado, esfuerzo físico** — y una **pantalla externa de centro de control** muestra mediciones en vivo con hora y número de reporte, disparando **alertas automáticas** cuando los valores salen de rango normal.

---

## 🎮 Cómo jugar

1. Abre `index.html` — es el **Visor MR del operario** (pantalla principal)
2. Pulsa **INICIAR SIMULACIÓN** o **Ver demo automática**
3. Abre la **Pantalla Externa** con el botón `⧉ Abrir Pantalla Externa` — es la segunda pantalla que ve el supervisor (también disponible como `monitor.html` en una ventana/segundo monitor independiente, sincronizada por `BroadcastChannel` + `localStorage`)
4. Activa escenarios:
   - 🔥 **Calor extremo** → temp ambiental 51°C, corporal 38.9°C, taquicardia, SpO₂ bajando
   - ⚡ **Simular caída** → pico de acelerómetro 3.2g, flash blanco, HR se dispara, alerta crítica inmediata
   - 🧱 **Atrapado / Confinado** → SpO₂ cae a 86%, inmovilidad progresiva, polvo y oscurecimiento en visor
   - 🏃 **Esfuerzo físico** → HR sostenida alta, temp corporal sube
   - Usa **WASD** para mover al operario (afecta HR/posición)
5. Observa cómo la **pantalla externa** cambia a **CRÍTICO/ADVERTENCIA** y envía alerta sonora + log + vibración cuando HR >100, SpO₂ <95%, temp >37.8°C, caída detectada o atrapamiento >10s.

## 📊 Pantalla externa — Mediciones

La pantalla aparte (requisito clave del proyecto) muestra:

- 🌡️ Temperatura corporal y ambiental (°C) con umbrales
- ❤️ Frecuencia cardíaca (BPM) + barra y gráfico
- 🫁 SpO₂ (%) 
- ⚡ Caída (SÍ/NO) + acelerómetro en *g*
- 🧱 Atrapado / inmovilidad + cronómetro
- 🕒 **Hora** en vivo
- 🧾 **Número de reporte** correlativo `RPT-2026-0001` (incrementa al reestablecer)
- Gráfica de tendencia 45s, bitácora, conteo de alertas

Cuando 1+ valores no son normales → banner de alerta + alerta grande modal + sonido de sirena + notificación a brigada.

## 🕶️ Realidad Mixta

- **Passthrough MR**: botón `📷 Activar Passthrough MR` usa `getUserMedia` para poner la cámara real como fondo del visor (simula gafas MR).
- Visor térmico / nocturno, retícula HUD, coordenadas, efecto scanline, partículas de calor, oscurecimiento por polvo en espacio confinado.
- Avatar con dispositivo real (foto subida) como referencia visual.

## Thresholds

| Medida | Normal | Alerta | Crítico |
|--------|--------|--------|---------|
| Temp corporal | 36.5–37.5°C | ≥37.8°C | ≥39°C |
| Temp ambiente | <35°C | ≥35°C | ≥45°C |
| HR | 60–100 | >100 / <55 | >135 / <50 |
| SpO₂ | 95–100% | <95% | <90% |
| Caída | 1g | >1.5g | >1.9g / flag |
| Inmovilidad | 0s | >4s | >9s atrapado |

## 📁 Archivos

- `index.html` — juego completo (visor MR + telemetría integrada + motor de simulación)
- `monitor.html` — pantalla externa independiente (ideal segundo monitor / proyector)
- `assets/dispositivo.png` — foto del arnés real usado como avatar

Ambos HTML son autocontenidos, sin build step, usan Chart.js por CDN y Web Audio API para alertas. Sincronización por `BroadcastChannel('guardian_mr')`.

## 🚀 Deploy

Es estático — funciona en GitHub Pages:

```bash
git push origin arena/062da380-modelo3d
# Activar Pages desde main → root
```

O abrir local con cualquier servidor:

```bash
npx serve .
# o python -m http.server 8000
```

Abre `http://localhost:8000/index.html` y en otra ventana `monitor.html`.

## 🔌 Futuro hardware

El motor está listo para reemplazar el simulador por datos reales BLE/WiFi del dispositivo físico (el `state` central puede alimentarse por Web Bluetooth/Web Serial). La pantalla externa ya consume el mismo canal.

---

Hecho para **zharpinzon/Modelo3D** • 2026
