# TERREMOTO MR — Centro de Control de Rescate

**Juego interactivo de Realidad Mixta (Merged Reality / Mixed Reality) de rescate tras un terremoto.**

> Varios **rescatistas** operan en una ciudad colapsada. Tú estás a distancia, frente al **dispositivo de telemetría**, y desde ahí ves en vivo su **SpO₂, frecuencia cardíaca, temperatura, energía, ubicación y si están atrapados o necesitan ayuda**. Tu trabajo es decidir **cómo resolver sus necesidades sin estar ahí** mientras ellos buscan a las personas atrapadas y las llevan a un **punto de encuentro seguro**.

---

## 🎮 Cómo jugar

1. Abre `index.html` — es el **Centro de Mando MR** (pantalla principal del jugador).
2. Pulsa **▶ INICIAR SIMULACIÓN**.
3. Elige un rescatista en la lista de la derecha (o haz clic sobre él en el mapa).
4. Desde el **dispositivo** puedes, a distancia:
   - 🫁 **Oxígeno** → sube el SpO₂ de un rescatista agotado
   - 💧 **Agua / enfriamiento** → baja temperatura y frecuencia cardíaca
   - ⚡ **Estimulante** → recupera energía
   - 🚑 **Equipo de rescate** → libera a un rescatista atrapado o evacúa a uno incapacitado
5. Da órdenes en el mapa: **🔍 Buscar víctimas**, **🟢 Ir a zona segura**, **🩹 Primeros auxilios**, **✖ Cancelar**.
6. Abre la **pantalla externa** con `⧉ Centro de Control` (o el archivo `monitor.html` en un segundo monitor). Se sincroniza por `BroadcastChannel('terremoto_mr')` con respaldo en `localStorage`.

**Objetivo:** rescatar a las 8 víctimas antes de que se agote el tiempo (6 min) o el oxígeno.
**Derrota:** todos los rescatistas fuera de combate, o el tiempo termina con menos de la mitad de las víctimas rescatadas.

### 🕹️ Controles

| Acción | Control |
|---|---|
| Seleccionar rescatista | Clic en su tarjeta o en el mapa |
| Mover rescatista | Clic en el mapa con él seleccionado |
| Órdenes y ayudas | Botones del panel derecho |
| Passthrough MR | Botón `📷 MR Passthrough` |
| Pausa / velocidad | `⏸ PAUSA` y selector de velocidad |

---

## 📟 El dispositivo — qué se puede ver

Cada rescatista transmite:

- ❤️ **Frecuencia cardíaca** (bpm) con umbrales
- 🫁 **SpO₂** (%) — el indicador más crítico en derrumbes
- 🌡️ **Temperatura corporal** (°C) — calor por esfuerzo y por incendios
- ⚡ **Energía** (%) — se agota cargando víctimas y excavando
- 📍 **Ubicación** en el mapa (coordenadas y punto en tiempo real)
- 🧱 **Atrapado** — derrumbe secundario o zona de colapso
- `!` **Necesita ayuda** — alerta directa al operador
- 🤚 **Llevando víctima** / **extrayendo**

Los umbrales se muestran en colores: **verde** normal, **ámbar** advertencia, **rojo** crítico (con alerta sonora).

---

## 🌍 El escenario

- Ciudad de 1700 × 1050 con una grilla de calles (8 × 5 manzanas).
- **~16 % de escombros** en la calle, edificios **colapsados**, y peligros: 🔥 incendio, ☣️ gas, ⚡ cables eléctricos.
- **2 puntos de encuentro seguro** (los verdes del mapa) y una **base de mando** abajo al centro.
- **8 víctimas**: atrapadas (⛏ excavación de 7 s) y heridas (5 s), con salud que decae con el tiempo.
- **4 rescatistas**: búsqueda, médico, transporte y excavación; caen si su SpO₂, energía o pulso se salen de rango, y quedan *incapacitados* esperando **evacuación por equipo**.
- **Derrumbe secundario**: buscar dentro de zonas de colapso acumula riesgo → el rescatista puede quedar **atrapado**.

Los rescatistas se desplazan con **A\* sobre una grilla de navegación**, evitan obstáculos y eligen la celda alcanzable más cercana a la víctima para excavar.

---

## 🕶️ Realidad Mixta

- **Passthrough MR**: `getUserMedia` pone la cámara real como fondo del mapa (efecto de gafas MR).
- HUD con retícula, coordenadas, scanlines y partículas de humo.
- Panel de telemetría y centro de control externo sincronizado en vivo: la mezcla entre el mundo físico (cámara) y los datos del dispositivo es el núcleo del juego.

---

## 📊 Umbrales

| Medida | Normal | Advertencia | Crítico |
|---|---|---|---|
| Frecuencia cardíaca | 55–100 bpm | >100 / <55 | >140 / <50 |
| SpO₂ | 95–100 % | <95 % | <90 % |
| Temperatura | <37.8 °C | ≥37.8 °C | ≥39 °C |
| Energía | >40 % | ≤40 % | ≤20 % |

---

## 📁 Archivos

- `index.html` — juego completo autocontenido (mapa, motor de simulación, telemetría, ayudas remotas).
- `monitor.html` — pantalla externa independiente del centro de control (segundo monitor / proyector).

Ambos son HTML estático, sin build step ni dependencias externas (sin CDN): gráficos dibujados a mano en `<canvas>`, alertas con Web Audio API y sincronización por `BroadcastChannel('terremoto_mr')`.

---

## 🚀 Ejecutar

```bash
npx serve .
# o: python -m http.server 8000
```

Abre `http://localhost:8000/index.html` y, en otra ventana, `monitor.html`.
También funciona en GitHub Pages (sitio estático).

---

## 🔌 Futuro hardware

El motor consume un objeto `state` central; puede alimentarse con datos reales de un dispositivo físico por BLE/WiFi (Web Bluetooth / Web Serial) sin cambiar la capa de presentación. El monitor externo ya consume ese mismo canal de datos.

---

Hecho para **zharpinzon/Modelo3D** • 2026
