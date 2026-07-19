import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/* ───────────────────────────────────────────────────────────────────────────
   IntroGate — the liquid-glass "A" that opens the site.

   A fullscreen black gate with the brand's 3D logo floating in the middle:
   semi-transparent iridescent chrome (the "liquid" look), lit by three
   colored point lights and wrapped in an additive fresnel shell so the rim
   glows blue→violet, over a pulsing CSS aurora. Moving the mouse rotates
   the letter toward the pointer; clicking anywhere launches the reveal —
   the overlay fades off, the stage FLIPs to the header's brand mark
   position while the liquid render crossfades into the flat logo, and the
   landing page is standing underneath when it lands.

   Plain three.js on purpose (no react-three-fiber): R3F 9.x wants React 19
   and this app is on 18, and a single imperative scene in a ref needs no
   reconciler anyway.
─────────────────────────────────────────────────────────────────────────── */

const SERIF = "'Newsreader', Georgia, serif";
const MONO = "'Space Mono', ui-monospace, monospace";

/* The flat brand mark: a serif A whose crossbar is a needle, its eye
   punched through the right end — recreated as vector so it stays crisp at
   any size. (If a bitmap master of the logo lands in public/brand/, this
   component is the single place to swap it.) */
export function NeedleA({ size = 26, color = '#F4F2EC', className, style }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100" aria-hidden
      className={className} style={{ display: 'block', overflow: 'visible', ...style }}
    >
      <text x="44" y="78" textAnchor="middle" fontFamily={SERIF} fontSize="88" fontWeight="500" fill={color}>A</text>
      <path d="M18 57 H70" stroke={color} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M70 57 C77 50.5 92 50.5 92 57 C92 63.5 77 63.5 70 57 Z" fill="none" stroke={color} strokeWidth="3.5" strokeLinejoin="round" />
    </svg>
  );
}

export default function IntroGate({ onDone }) {
  const overlayRef = useRef(null);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const leavingRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const overlay = overlayRef.current;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!overlay || !stage || !canvas) return undefined;

    document.body.style.overflow = 'hidden';

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (err) {
      // No WebGL — never block the site behind a dead gate.
      console.error('IntroGate: WebGL unavailable, skipping intro', err);
      document.body.style.overflow = '';
      onDone();
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    camera.position.set(0, 0, 4.6);

    // The environment is what makes chrome read as liquid — reflections,
    // not lights, carry the look.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;

    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const l1 = new THREE.PointLight(0x6ba8de, 40, 30); l1.position.set(-3.4, 1.6, 2.6); scene.add(l1);
    const l2 = new THREE.PointLight(0xa98cf5, 40, 30); l2.position.set(3.2, 2.2, 2.2); scene.add(l2);
    const l3 = new THREE.PointLight(0xff8a6b, 26, 30); l3.position.set(0.4, -3.0, 2.8); scene.add(l3);

    const group = new THREE.Group();
    scene.add(group);

    // Rim-glow shell: additive fresnel, drawn on backfaces of a slightly
    // inflated copy, so the silhouette bleeds blue→violet light.
    const fresnelMat = new THREE.ShaderMaterial({
      uniforms: {
        cA: { value: new THREE.Color(0x6ba8de) },
        cB: { value: new THREE.Color(0xa98cf5) },
      },
      vertexShader: `
        varying float vI;
        void main() {
          vec3 n = normalize(normalMatrix * normal);
          vec3 vPos = (modelViewMatrix * vec4(position, 1.0)).xyz;
          vec3 viewDir = normalize(-vPos);
          vI = pow(1.0 - abs(dot(n, viewDir)), 2.6);
          gl_Position = projectionMatrix * vec4(vPos, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 cA; uniform vec3 cB;
        varying float vI;
        void main() { gl_FragColor = vec4(mix(cA, cB, vI), vI * 0.85); }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    });

    const liquidMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.85,
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      iridescence: 1,
      iridescenceIOR: 1.6,
      transparent: true,
      opacity: 0.8,
      envMapIntensity: 1.9,
      depthWrite: true,
    });

    let disposed = false;
    new GLTFLoader().load(
      '/intro/logo.glb',
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        // Normalize: center at the origin, fit to a known height.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 2.5 / Math.max(size.x, size.y, size.z);
        model.position.sub(center);
        const holder = new THREE.Group();
        holder.add(model);
        holder.scale.setScalar(scale);
        // Collect first, mutate after: adding the shell inside traverse()
        // makes traverse visit the shell it just added and recurse forever.
        const meshes = [];
        model.traverse((child) => { if (child.isMesh) meshes.push(child); });
        meshes.forEach((child) => {
          child.material = liquidMat;
          const shell = new THREE.Mesh(child.geometry, fresnelMat);
          shell.scale.setScalar(1.035);
          child.add(shell);
        });
        group.add(holder);
        group.scale.setScalar(0.001);
        setReady(true);
      },
      undefined,
      (err) => {
        // Load failed → skip the gate rather than blocking the site. The
        // disposed check matters: StrictMode's dev double-mount aborts the
        // first effect's loader, and that stale error must not dismiss the
        // gate the second mount owns.
        console.error('IntroGate: GLB load failed, skipping intro', err);
        if (!disposed && !leavingRef.current) finish();
      },
    );

    const resize = () => {
      const r = stage.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);

    // Pointer → target rotation, smoothed in the loop.
    const target = { x: 0, y: 0 };
    const onMove = (e) => {
      target.y = ((e.clientX / window.innerWidth) * 2 - 1) * 0.85;
      target.x = ((e.clientY / window.innerHeight) * 2 - 1) * 0.45;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    let raf;
    const clock = new THREE.Clock();
    let popIn = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      if (group.children.length) {
        popIn = Math.min(1, popIn + 0.028);
        const eased = 1 - Math.pow(1 - popIn, 3);
        group.scale.setScalar(eased);
        group.rotation.y += ((target.y + Math.sin(t * 0.4) * 0.22) - group.rotation.y) * 0.055;
        group.rotation.x += ((target.x + Math.cos(t * 0.5) * 0.07) - group.rotation.x) * 0.055;
        group.position.y = Math.sin(t * 0.9) * 0.07;
      }
      renderer.render(scene, camera);
    };
    animate();

    const finish = () => {
      document.body.style.overflow = '';
      onDone();
    };

    const onClick = () => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      // FLIP the stage onto the header's brand mark.
      const mark = document.querySelector('.ds-brand-a');
      const s = stage.getBoundingClientRect();
      if (mark) {
        const m = mark.getBoundingClientRect();
        const sc = (m.height * 1.5) / s.height;
        const dx = (m.left + m.width / 2) - (s.left + s.width / 2);
        const dy = (m.top + m.height / 2) - (s.top + s.height / 2);
        stage.style.transition = 'transform 1.05s cubic-bezier(0.7, 0.02, 0.22, 1)';
        stage.style.transform = `translate(${dx}px, ${dy}px) scale(${sc})`;
      }
      overlay.classList.add('ds-gate-leave');
      setTimeout(finish, 1180);
    };
    overlay.addEventListener('click', onClick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      overlay.removeEventListener('click', onClick);
      document.body.style.overflow = '';
      pmrem.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ds-gate" ref={overlayRef} role="button" aria-label="Enter Atelier">
      <style>{GATE_CSS}</style>
      <div className="ds-gate-aurora" aria-hidden />
      <div className="ds-gate-stage" ref={stageRef}>
        <canvas ref={canvasRef} className="ds-gate-canvas" />
        <div className="ds-gate-flat" aria-hidden><NeedleA size="62%" /></div>
      </div>
      <div className={`ds-gate-hint${ready ? ' on' : ''}`}>
        {ready ? 'click to enter' : 'pouring the letterform…'}
      </div>
    </div>
  );
}

const GATE_CSS = `
.ds-gate { position: fixed; inset: 0; z-index: 100; background: #000; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 1s ease 0.12s; }
.ds-gate.ds-gate-leave { background: transparent; pointer-events: none; }

/* the colorful glow around the letter — pulsing layered aurora, screen-blended */
.ds-gate-aurora { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: screen;
  background:
    radial-gradient(34% 30% at 46% 46%, rgba(107,168,222,0.34), transparent 70%),
    radial-gradient(28% 26% at 58% 52%, rgba(169,140,245,0.30), transparent 70%),
    radial-gradient(24% 22% at 46% 60%, rgba(255,138,107,0.20), transparent 70%);
  filter: blur(30px);
  animation: ds-gate-pulse 5.5s ease-in-out infinite;
  transition: opacity 0.7s ease; }
@keyframes ds-gate-pulse {
  0%, 100% { opacity: 0.75; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.07); } }
.ds-gate-leave .ds-gate-aurora { opacity: 0; }

.ds-gate-stage { position: relative; width: min(72vmin, 640px); height: min(72vmin, 640px);
  will-change: transform; }
.ds-gate-canvas { position: absolute; inset: 0; width: 100% !important; height: 100% !important;
  transition: opacity 0.55s ease 0.25s; }
.ds-gate-leave .ds-gate-canvas { opacity: 0; }

/* the flat logo the liquid resolves into mid-flight */
.ds-gate-flat { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.5s ease 0.45s; }
.ds-gate-flat svg { width: 62%; height: 62%; }
.ds-gate-leave .ds-gate-flat { opacity: 1; }

.ds-gate-hint { position: absolute; bottom: 7vh; left: 50%; transform: translateX(-50%);
  font-family: ${MONO}; font-size: 12px; letter-spacing: 0.3em; text-transform: uppercase;
  color: rgba(244,242,236,0.5); opacity: 0.7; transition: opacity 0.4s ease; }
.ds-gate-hint.on { animation: ds-gate-hint 2.4s ease-in-out infinite; }
@keyframes ds-gate-hint { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
.ds-gate-leave .ds-gate-hint { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .ds-gate-aurora, .ds-gate-hint.on { animation: none; }
}
`;
