import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { BUILDINGS, COMMAND_POST, SAFE_RADIUS, SAFE_ZONE, WORLD } from '../game/world';
import { engine } from '../game/engine';
import type { GameState, Vec2 } from '../game/types';

interface Props {
  state: GameState;
  mrMode: boolean;
  showPaths: boolean;
  showHazards: boolean;
  onSelectUnit: (id: string) => void;
  onSelectVictim: (id: string) => void;
  onGroundClick: (p: Vec2) => void;
}

const UNIT_Y = 0.9;

function makeTextSprite(text: string, color = '#e2e8f0', bg = 'rgba(8,14,22,0.85)'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = '600 28px Inter, system-ui, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  canvas.width = w;
  canvas.height = 44;
  ctx.font = font;
  ctx.fillStyle = bg;
  const r = 10;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, 44, r);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, 23);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(w / 28, 44 / 28, 1);
  return sprite;
}

function buildingMesh(b: (typeof BUILDINGS)[number]): THREE.Group {
  const g = new THREE.Group();
  const bodyColor = b.kind === 'hospital' ? 0x2a4a5e : b.kind === 'office' ? 0x27364a : b.kind === 'market' ? 0x3a3348 : 0x31405a;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(b.width, b.height, b.depth),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.85, metalness: 0.1 }),
  );
  body.position.y = b.height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // Windows as emissive strips.
  const winMat = new THREE.MeshStandardMaterial({ color: 0x0b1622, emissive: 0x1d3a52, emissiveIntensity: 0.55, roughness: 0.4 });
  const floors = Math.max(1, Math.floor(b.height / 2.6));
  for (let f = 0; f < floors; f++) {
    const y = 1.6 + f * 2.6;
    if (y > b.height - 0.8) break;
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(b.width * 0.82, 0.7, 0.08), winMat);
      strip.position.set(0, y, side * (b.depth / 2 + 0.05));
      g.add(strip);
      const strip2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, b.depth * 0.82), winMat);
      strip2.position.set(side * (b.width / 2 + 0.05), y, 0);
      g.add(strip2);
    }
  }

  if (b.collapsed) {
    // Jagged top: remove visual top by adding rubble and a tilted slab.
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(b.width * 0.9, 0.6, b.depth * 0.7),
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 1 }),
    );
    slab.position.set(0.5, b.height + 0.2, 0);
    slab.rotation.z = 0.18;
    slab.rotation.x = -0.12;
    slab.castShadow = true;
    g.add(slab);
    const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x556274, roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const s = 0.6 + Math.random() * 1.4;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rubbleMat);
      const ang = Math.random() * Math.PI * 2;
      const rad = b.width / 2 + Math.random() * 3;
      rock.position.set(Math.cos(ang) * rad, s * 0.4, Math.sin(ang) * rad * 0.7);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true;
      g.add(rock);
    }
  } else {
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(b.width + 0.4, 0.4, b.depth + 0.4),
      new THREE.MeshStandardMaterial({ color: 0x1b2534, roughness: 0.9 }),
    );
    roof.position.y = b.height + 0.2;
    roof.castShadow = true;
    g.add(roof);
  }

  if (b.kind === 'hospital') {
    const cross = makeTextSprite('＋', '#f87171', 'rgba(20,10,12,0.9)');
    cross.position.set(0, b.height + 2.2, 0);
    cross.scale.multiplyScalar(1.2);
    g.add(cross);
  }

  g.position.set(b.position.x, 0, b.position.z);
  return g;
}

export default function CityScene({ state, mrMode, showPaths, showHazards, onSelectUnit, onSelectVictim, onGroundClick }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const propsRef = useRef({ mrMode, showPaths, showHazards, onSelectUnit, onSelectVictim, onGroundClick });
  stateRef.current = state;
  propsRef.current = { mrMode, showPaths, showHazards, onSelectUnit, onSelectVictim, onGroundClick };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const aspect = mount.clientWidth / Math.max(1, mount.clientHeight);
    const frustum = 58;
    const camera = new THREE.OrthographicCamera(-frustum * aspect, frustum * aspect, frustum, -frustum, 0.1, 500);
    camera.position.set(62, 72, 78);
    camera.lookAt(0, 0, 0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      const fallback = document.createElement('div');
      fallback.className = 'webgl-fallback';
      fallback.textContent = 'Tu navegador no pudo iniciar WebGL. La simulación sigue activa en los paneles, pero el mapa 3D no está disponible.';
      mount.appendChild(fallback);
      return () => mount.removeChild(fallback);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = 'city-canvas';
    mount.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(mount.clientWidth, mount.clientHeight);
    labelRenderer.domElement.className = 'city-labels';
    mount.appendChild(labelRenderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minZoom = 0.55;
    controls.maxZoom = 2.6;
    controls.maxPolarAngle = Math.PI / 2.35;
    controls.minPolarAngle = Math.PI / 5;
    controls.enablePan = true;
    controls.panSpeed = 0.7;
    controls.rotateSpeed = 0.5;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0x8fa8c8, 0.85));
    const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x1a2230, 0.7);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
    sun.position.set(40, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.width + 8, WORLD.depth + 8),
      new THREE.MeshStandardMaterial({ color: 0x101823, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'ground';
    scene.add(ground);

    // Street grid
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x1c2735, roughness: 0.95 });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x33445c });
    const roadXs = [-44, -21, 1, 23, 44];
    const roadZs = [-31, -11, 11, 31];
    for (const x of roadXs) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(6, WORLD.depth), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.02, 0);
      road.receiveShadow = true;
      scene.add(road);
      for (let z = -34; z < 36; z += 4) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 1.6), lineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.04, z);
        scene.add(dash);
      }
    }
    for (const z of roadZs) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.width, 6), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.02, z);
      road.receiveShadow = true;
      scene.add(road);
      for (let x = -48; x < 50; x += 4) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.25), lineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.04, z);
        scene.add(dash);
      }
    }

    // Buildings
    for (const b of BUILDINGS) scene.add(buildingMesh(b));

    // Safe zone
    const safeGroup = new THREE.Group();
    const safePad = new THREE.Mesh(
      new THREE.CircleGeometry(SAFE_RADIUS, 48),
      new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.18 }),
    );
    safePad.rotation.x = -Math.PI / 2;
    safePad.position.y = 0.05;
    safeGroup.add(safePad);
    const safeRing = new THREE.Mesh(
      new THREE.RingGeometry(SAFE_RADIUS - 0.35, SAFE_RADIUS, 64),
      new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    safeRing.rotation.x = -Math.PI / 2;
    safeRing.position.y = 0.06;
    safeGroup.add(safeRing);
    const safeCross = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 1.2), new THREE.MeshBasicMaterial({ color: 0x34d399 }));
    safeCross.position.y = 0.08;
    safeGroup.add(safeCross);
    const safeCross2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 4), new THREE.MeshBasicMaterial({ color: 0x34d399 }));
    safeCross2.position.y = 0.08;
    safeGroup.add(safeCross2);
    const safeLabel = makeTextSprite('PUNTO SEGURO', '#34d399');
    safeLabel.position.set(0, 4, 0);
    safeGroup.add(safeLabel);
    safeGroup.position.set(SAFE_ZONE.x, 0, SAFE_ZONE.z);
    scene.add(safeGroup);

    // Command post
    const cmdGroup = new THREE.Group();
    const cmdPad = new THREE.Mesh(new THREE.CircleGeometry(5, 32), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.12 }));
    cmdPad.rotation.x = -Math.PI / 2;
    cmdPad.position.y = 0.05;
    cmdGroup.add(cmdPad);
    const tent = new THREE.Mesh(new THREE.ConeGeometry(3.2, 3, 4), new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.8 }));
    tent.position.y = 1.5;
    tent.rotation.y = Math.PI / 4;
    tent.castShadow = true;
    cmdGroup.add(tent);
    const cmdLabel = makeTextSprite('BASE DE MANDO', '#38bdf8');
    cmdLabel.position.set(0, 5, 0);
    cmdGroup.add(cmdLabel);
    cmdGroup.position.set(COMMAND_POST.x, 0, COMMAND_POST.z);
    scene.add(cmdGroup);

    // Hazards
    const hazardGroups = new Map<string, THREE.Group>();
    const fireParticles: THREE.Mesh[] = [];
    for (const h of stateRef.current.hazards) {
      const g = new THREE.Group();
      const color = h.kind === 'fire' ? 0xf97316 : h.kind === 'gas' ? 0xa3e635 : 0xf59e0b;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(h.radius - 0.3, h.radius, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.07;
      g.add(ring);
      const fill = new THREE.Mesh(
        new THREE.CircleGeometry(h.radius, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08 }),
      );
      fill.rotation.x = -Math.PI / 2;
      fill.position.y = 0.06;
      g.add(fill);
      if (h.kind === 'fire') {
        for (let i = 0; i < 10; i++) {
          const flame = new THREE.Mesh(
            new THREE.ConeGeometry(0.5 + Math.random() * 0.5, 1.6 + Math.random() * 1.6, 6),
            new THREE.MeshBasicMaterial({ color: i % 2 ? 0xfb923c : 0xfbbf24, transparent: true, opacity: 0.85 }),
          );
          flame.position.set((Math.random() - 0.5) * h.radius, 1, (Math.random() - 0.5) * h.radius);
          flame.userData.seed = Math.random() * 10;
          g.add(flame);
          fireParticles.push(flame);
        }
      } else if (h.kind === 'gas') {
        for (let i = 0; i < 6; i++) {
          const cloud = new THREE.Mesh(
            new THREE.SphereGeometry(1.4 + Math.random(), 12, 12),
            new THREE.MeshBasicMaterial({ color: 0xa3e635, transparent: true, opacity: 0.12 }),
          );
          cloud.position.set((Math.random() - 0.5) * h.radius, 1.5 + Math.random(), (Math.random() - 0.5) * h.radius);
          cloud.userData.seed = Math.random() * 10;
          g.add(cloud);
          fireParticles.push(cloud);
        }
      }
      const label = makeTextSprite(h.kind === 'fire' ? 'INCENDIO' : h.kind === 'gas' ? 'GAS' : 'COLAPSO', `#${color.toString(16).padStart(6, '0')}`);
      label.position.set(0, 3.5, 0);
      label.scale.multiplyScalar(0.8);
      g.add(label);
      g.position.set(h.position.x, 0, h.position.z);
      scene.add(g);
      hazardGroups.set(h.id, g);
    }

    // Units
    const unitGroups = new Map<string, THREE.Group>();
    const unitRings = new Map<string, THREE.Mesh>();
    const unitLabels = new Map<string, CSS2DObject>();
    const unitPickMeshes: THREE.Object3D[] = [];
    for (const r of stateRef.current.rescuers) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.55, 1.1, 4, 10),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(r.color), roughness: 0.5, emissive: new THREE.Color(r.color), emissiveIntensity: 0.25 }),
      );
      body.position.y = 1.15;
      body.castShadow = true;
      body.userData.unitId = r.id;
      g.add(body);
      unitPickMeshes.push(body);
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 14), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 }));
      helmet.position.y = 2.15;
      helmet.castShadow = true;
      helmet.userData.unitId = r.id;
      g.add(helmet);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.2), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.6 }));
      visor.position.set(0, 2.18, 0.4);
      g.add(visor);
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.35), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 }));
      pack.position.set(0, 1.3, -0.5);
      g.add(pack);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.1, 1.4, 32),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(r.color), transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.08;
      g.add(ring);
      unitRings.set(r.id, ring);

      const div = document.createElement('div');
      div.className = 'unit-label';
      div.textContent = r.code;
      div.style.setProperty('--unit-color', r.color);
      const label = new CSS2DObject(div);
      label.position.set(0, 3.4, 0);
      g.add(label);
      unitLabels.set(r.id, label);

      g.position.set(r.position.x, 0, r.position.z);
      scene.add(g);
      unitGroups.set(r.id, g);
    }

    // Victims
    const victimGroups = new Map<string, THREE.Group>();
    const victimPickMeshes: THREE.Object3D[] = [];
    for (const v of stateRef.current.victims) {
      const g = new THREE.Group();
      const marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.8, 0),
        new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.5, roughness: 0.4 }),
      );
      marker.position.y = 1.4;
      marker.userData.victimId = v.id;
      g.add(marker);
      victimPickMeshes.push(marker);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.15, 24),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.07;
      g.add(ring);
      const div = document.createElement('div');
      div.className = 'victim-label';
      div.textContent = v.code;
      const label = new CSS2DObject(div);
      label.position.set(0, 2.8, 0);
      g.add(label);
      g.position.set(v.position.x, 0, v.position.z);
      g.visible = false;
      scene.add(g);
      victimGroups.set(v.id, g);
    }

    // Selected path
    const pathLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: 0x38bdf8, dashSize: 1.2, gapSize: 0.8, transparent: true, opacity: 0.85 }),
    );
    pathLine.position.y = 0.12;
    scene.add(pathLine);

    // Delivery drones
    const droneGroups = new Map<string, THREE.Group>();

    // Raycasting
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downPos: { x: number; y: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!downPos) return;
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      downPos = null;
      if (moved > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const unitHits = raycaster.intersectObjects(unitPickMeshes, false);
      if (unitHits.length) {
        propsRef.current.onSelectUnit(unitHits[0].object.userData.unitId as string);
        return;
      }
      const victimHits = raycaster.intersectObjects(victimPickMeshes.filter((m) => m.parent?.visible), false);
      if (victimHits.length) {
        propsRef.current.onSelectVictim(victimHits[0].object.userData.victimId as string);
        return;
      }
      const groundHits = raycaster.intersectObject(ground, false);
      if (groundHits.length) {
        const p = groundHits[0].point;
        propsRef.current.onGroundClick({ x: p.x, z: p.z });
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      const w = mount.clientWidth;
      const h = Math.max(1, mount.clientHeight);
      const a = w / h;
      camera.left = -frustum * a;
      camera.right = frustum * a;
      camera.top = frustum;
      camera.bottom = -frustum;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      // Read the live engine state for smooth 60 fps movement (React snapshots are ~10 Hz).
      const s = engine.state;
      const p = propsRef.current;
      controls.update();

      // Units
      for (const r of s.rescuers) {
        const g = unitGroups.get(r.id);
        if (!g) continue;
        g.position.set(r.position.x, 0, r.position.z);
        const ring = unitRings.get(r.id)!;
        const selected = r.id === s.selectedId;
        ring.scale.setScalar(selected ? 1 + Math.sin(t * 4) * 0.08 : 1);
        (ring.material as THREE.MeshBasicMaterial).opacity = selected ? 1 : 0.55;
        (ring.material as THREE.MeshBasicMaterial).color.set(r.trapped || r.status === 'incapacitated' ? '#ef4444' : r.color);
        const label = unitLabels.get(r.id)!;
        label.element.textContent = `${r.code}${r.trapped ? ' · ATRAPADO' : r.status === 'incapacitated' ? ' · CAÍDO' : r.carrying ? ' · TRASLADO' : ''}`;
        label.element.classList.toggle('selected', selected);
        label.element.classList.toggle('danger', r.trapped || r.status === 'incapacitated');
        // Face movement direction
        if (r.path.length) {
          const next = r.path[0];
          g.rotation.y = Math.atan2(next.x - r.position.x, next.z - r.position.z);
        }
        // Bob while moving
        const moving = r.status === 'moving' || r.status === 'returning' || r.status === 'carrying';
        g.children[0].position.y = 1.15 + (moving ? Math.sin(t * 10) * 0.06 : 0);
      }

      // Victims
      for (const v of s.victims) {
        const g = victimGroups.get(v.id);
        if (!g) continue;
        const visible = v.status !== 'hidden' && v.status !== 'safe';
        g.visible = visible;
        if (!visible) continue;
        g.position.set(v.position.x, 0, v.position.z);
        g.children[0].rotation.y = t * 1.5;
        g.children[0].position.y = 1.4 + Math.sin(t * 3) * 0.15;
        const mat = (g.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.color.set(v.status === 'carried' ? '#34d399' : v.health < 40 ? '#ef4444' : '#fbbf24');
        mat.emissive.set(v.status === 'carried' ? '#10b981' : v.health < 40 ? '#dc2626' : '#f59e0b');
      }

      // Hazards
      for (const h of s.hazards) {
        const g = hazardGroups.get(h.id);
        if (!g) continue;
        g.visible = p.showHazards;
        const scale = h.radius / (h.kind === 'fire' ? 6 : h.kind === 'gas' ? 6.5 : 9);
        g.scale.set(scale, 1, scale);
      }
      for (const f of fireParticles) {
        const seed = f.userData.seed as number;
        f.position.y = (f.geometry instanceof THREE.ConeGeometry ? 1 : 1.8) + Math.sin(t * 3 + seed) * 0.4;
        f.scale.setScalar(0.85 + Math.sin(t * 5 + seed) * 0.2);
      }

      // Safe pulse
      safeRing.scale.setScalar(1 + Math.sin(t * 2) * 0.03);
      (safePad.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(t * 2) * 0.05;

      // Path
      const selected = s.rescuers.find((r) => r.id === s.selectedId);
      if (p.showPaths && selected && selected.path.length) {
        const pts = [new THREE.Vector3(selected.position.x, 0, selected.position.z), ...selected.path.map((w) => new THREE.Vector3(w.x, 0, w.z))];
        pathLine.geometry.setFromPoints(pts);
        pathLine.computeLineDistances();
        pathLine.visible = true;
      } else {
        pathLine.visible = false;
      }

      // Drones
      const activeIds = new Set(s.deliveries.map((d) => d.id));
      for (const [id, g] of droneGroups) {
        if (!activeIds.has(id)) {
          scene.remove(g);
          droneGroups.delete(id);
        }
      }
      for (const d of s.deliveries) {
        let g = droneGroups.get(d.id);
        if (!g) {
          g = new THREE.Group();
          const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.2), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.5 }));
          g.add(body);
          for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
            const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 12), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 }));
            rotor.position.set(dx, 0.2, dz);
            g.add(rotor);
          }
          const glow = new THREE.PointLight(0x38bdf8, 2, 8);
          g.add(glow);
          scene.add(g);
          droneGroups.set(d.id, g);
        }
        const target = s.rescuers.find((r) => r.id === d.unitId)!;
        const prog = Math.min(1, d.progress);
        const x = d.from.x + (target.position.x - d.from.x) * prog;
        const z = d.from.z + (target.position.z - d.from.z) * prog;
        const y = 7 + Math.sin(prog * Math.PI) * 5;
        g.position.set(x, y, z);
        g.rotation.y = t * 2;
      }

      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      mount.removeChild(labelRenderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className={`city-scene${mrMode ? ' mr' : ''}`} aria-label="Mapa 3D de la operación de rescate" />;
}
