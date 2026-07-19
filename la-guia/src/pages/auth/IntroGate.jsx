import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/* ───────────────────────────────────────────────────────────────────────────
   IntroGate — the liquid-glass "A" that opens the site.

   Rev 2: a fullscreen WebGL gate. A see-through, iridescent, transmissive
   letter floats in the center, lit by colored lights and wrapped in a
   color-cycling additive rim shell; behind it a live shader field paints
   drifting color splashes that brighten and swirl as the letter spins or
   the pointer moves. The whole frame is bloomed, so every bright edge and
   splash core bleeds light. Moving the mouse rotates the letter toward the
   pointer. Clicking flies the liquid A up to the header's brand-mark
   corner while the scene fades, landing on the real (flat) logo with the
   site standing underneath.

   The model's face lies in its Y-Z plane with a razor-thin X extrusion, so
   at the default camera angle it renders edge-on (a line) — FACE_ROT turns
   the face to camera. Flip its sign if the A ever reads mirrored.

   Plain three.js on purpose (no react-three-fiber): R3F 9.x wants React 19
   and this app is on 18, and one imperative scene in a ref needs no
   reconciler.
─────────────────────────────────────────────────────────────────────────── */

const SERIF = "'Newsreader', Georgia, serif";
const MONO = "'Space Mono', ui-monospace, monospace";
const FACE_ROT = -Math.PI / 2;

/* The flat brand mark: a serif A whose crossbar is a needle, its eye
   punched through the right end. (Swap here if a bitmap master lands in
   public/brand/.) */
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
  const canvasRef = useRef(null);
  const leavingRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const overlay = overlayRef.current;
    const canvas = canvasRef.current;
    if (!overlay || !canvas) return undefined;

    document.body.style.overflow = 'hidden';

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (err) {
      console.error('IntroGate: WebGL unavailable, skipping intro', err);
      document.body.style.overflow = '';
      onDone();
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 4.6);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;

    scene.add(new THREE.AmbientLight(0xffffff, 0.258));
    const l1 = new THREE.PointLight(0x6ba8de, 36.8, 40); l1.position.set(-3.4, 1.6, 3.0); scene.add(l1);
    const l2 = new THREE.PointLight(0xa98cf5, 35, 40); l2.position.set(3.2, 2.2, 2.6); scene.add(l2);
    const l3 = new THREE.PointLight(0xff8a6b, 25.8, 40); l3.position.set(0.4, -3.0, 3.0); scene.add(l3);

    // ── Reactive color-splash background ──────────────────────────────────
    // A big plane far behind the letter, painted by a shader whose blobs
    // drift with time, swirl with the letter's spin, follow the pointer, and
    // brighten with movement energy. Bloom turns the bright cores to glow.
    const bgUniforms = {
      uTime: { value: 0 },
      uMove: { value: new THREE.Vector2(0, 0) },
      uEnergy: { value: 0 },
      uSpin: { value: 0 },
      uAspect: { value: 1 },
      uFade: { value: 1 },
    };
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: bgUniforms,
        depthTest: false, depthWrite: false,
        vertexShader: `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }`,
        fragmentShader: `
          precision highp float;
          varying vec2 vUv;
          uniform float uTime, uEnergy, uSpin, uAspect, uFade;
          uniform vec2 uMove;
          vec3 blob(vec2 p, vec2 c, vec3 col, float rad, float sp, float ph) {
            vec2 o = c + vec2(cos(uTime*sp+ph), sin(uTime*sp*0.9+ph)) * 0.2 + uMove * 0.5;
            float d = length(p - o);
            float i = smoothstep(rad, 0.0, d);
            i = pow(i, 2.0) * (0.20 + uEnergy * 0.6);
            return col * i;
          }
          void main() {
            vec2 p = (vUv - 0.5); p.x *= uAspect;
            float s = uSpin * 0.35;
            p = mat2(cos(s), -sin(s), sin(s), cos(s)) * p;
            vec3 c = vec3(0.022, 0.028, 0.042);
            c += blob(p, vec2(-0.5, 0.30), vec3(0.42, 0.66, 0.87), 0.46, 0.31, 0.0);
            c += blob(p, vec2( 0.52, 0.34), vec3(0.66, 0.55, 0.96), 0.44, 0.24, 1.7);
            c += blob(p, vec2( 0.30,-0.42), vec3(1.00, 0.54, 0.42), 0.42, 0.35, 3.1);
            c += blob(p, vec2(-0.42,-0.30), vec3(0.94, 0.77, 0.42), 0.42, 0.28, 4.6);
            c += blob(p, vec2( 0.02, 0.56), vec3(0.40, 0.90, 0.95), 0.40, 0.4,  2.2);
            // darken the center so the letter reads as a distinct object in
            // front of the field rather than dissolving into it
            float vig = smoothstep(0.15, 0.95, length(p));
            c *= mix(0.55, 1.0, vig);
            gl_FragColor = vec4(c * uFade, 1.0);
          }`,
      }),
    );
    bg.frustumCulled = false;
    bg.renderOrder = -1;
    scene.add(bg);

    const group = new THREE.Group();   // fly + idle bob (position/scale)
    const holder = new THREE.Group();  // base facing + pointer spin (rotation)
    holder.rotation.y = FACE_ROT;
    group.add(holder);
    scene.add(group);

    const cursorRipple = {
      uCursorWorld: { value: new THREE.Vector3(999, 999, 0) },
      uCursorStrength: { value: 0 },
      uRippleTime: { value: 0 },
    };

    // Color-cycling additive rim shell — the bright glow ON the letter.
    const fresnelMat = new THREE.ShaderMaterial({
      uniforms: { cA: { value: new THREE.Color(0x6ba8de) }, cB: { value: new THREE.Color(0xff8a6b) }, uGlow: { value: 1.25 }, ...cursorRipple },
      vertexShader: `
        uniform vec3 uCursorWorld;
        uniform float uCursorStrength;
        uniform float uRippleTime;
        varying float vI;
        void main() {
          vec3 warped = position;
          vec4 wPos = modelMatrix * vec4(warped, 1.0);
          float d = distance(wPos.xy, uCursorWorld.xy);
          float mask = smoothstep(0.62, 0.0, d) * uCursorStrength;
          float wave = sin(d * 25.0 - uRippleTime * 8.0);
          warped += normal * mask * (0.14 + wave * 0.045);
          vec3 n = normalize(normalMatrix * normal);
          vec3 vPos = (modelViewMatrix * vec4(warped, 1.0)).xyz;
          vI = pow(1.0 - abs(dot(n, normalize(-vPos))), 2.15);
          gl_Position = projectionMatrix * vec4(vPos, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 cA; uniform vec3 cB; uniform float uGlow;
        varying float vI;
        void main() { gl_FragColor = vec4(mix(cA, cB, vI) * uGlow, min(1.0, vI * 1.35)); }`,
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
    });

    // See-through iridescent glass. Tinted, attenuating glass (deep teal,
    // short attenuation distance) gives the body real colored depth so the
    // letter reads as a solid object in front of the field instead of a
    // transparent white blank the bright background shows straight through.
    const liquidMat = new THREE.MeshPhysicalMaterial({
      color: 0xeaf7ff,
      metalness: 0.2, roughness: 0.06,
      transmission: 0.74, thickness: 1.25, ior: 1.38,
      attenuationColor: new THREE.Color(0x39789a), attenuationDistance: 1.15,
      clearcoat: 1, clearcoatRoughness: 0.04,
      iridescence: 1, iridescenceIOR: 1.4, iridescenceThicknessRange: [100, 560],
      envMapIntensity: 1.7,
      emissive: new THREE.Color(0x6ba8de), emissiveIntensity: 0.276,
      transparent: true, opacity: 1,
    });
    liquidMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, cursorRipple);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform vec3 uCursorWorld;
          uniform float uCursorStrength;
          uniform float uRippleTime;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 rippleWorld = modelMatrix * vec4(transformed, 1.0);
          float rippleDist = distance(rippleWorld.xy, uCursorWorld.xy);
          float rippleMask = smoothstep(0.58, 0.0, rippleDist) * uCursorStrength;
          float rippleWave = sin(rippleDist * 28.0 - uRippleTime * 9.0);
          transformed += normal * rippleMask * (0.11 + rippleWave * 0.04);`,
        );
    };

    let disposed = false;
    new GLTFLoader().load(
      '/intro/logo.glb',
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 2.6 / Math.max(size.x, size.y, size.z);
        model.position.sub(center);
        holder.scale.setScalar(scale);
        // Collect first, mutate after — adding the shell inside traverse()
        // makes traverse recurse into the shell it just added (stack overflow).
        const meshes = [];
        model.traverse((child) => { if (child.isMesh) meshes.push(child); });
        meshes.forEach((child) => {
          child.material = liquidMat;
          const shell = new THREE.Mesh(child.geometry, fresnelMat);
          shell.scale.setScalar(1.075);
          child.add(shell);
        });
        holder.add(model);
        group.scale.setScalar(0.001);
        setReady(true);
      },
      undefined,
      (err) => {
        console.error('IntroGate: GLB load failed, skipping intro', err);
        if (!disposed && !leavingRef.current) finish();
      },
    );

    // ── Post-processing: bloom for the bright colorful glow ───────────────
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.736, 0.7, 0.3);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloom.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      bgUniforms.uAspect.value = w / h;
    };
    resize();
    window.addEventListener('resize', resize);

    // pointer → NDC target (y up)
    const ptrTarget = { x: 0, y: 0 };
    const ptr = { x: 0, y: 0 };
    let ptrPrev = { x: 0, y: 0 };
    const onMove = (e) => {
      ptrTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
      ptrTarget.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    let raf;
    const clock = new THREE.Clock();
    let popIn = 0, energy = 0, prevRotY = FACE_ROT, prevRotX = 0;

    // fly-to-corner state (filled on click)
    const fly = { active: false, prog: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), scaleFrom: 1, scaleTo: 0.12 };

    const worldAtScreen = (sx, sy) => {
      const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
      const halfW = halfH * camera.aspect;
      return new THREE.Vector3(
        ((sx / window.innerWidth) * 2 - 1) * halfW,
        -((sy / window.innerHeight) * 2 - 1) * halfH,
        0,
      );
    };

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const dt = Math.min(clock.getDelta(), 0.05);
      bgUniforms.uTime.value = t;

      ptr.x += (ptrTarget.x - ptr.x) * 0.06;
      ptr.y += (ptrTarget.y - ptr.y) * 0.06;

      if (holder.children.length) {
        popIn = Math.min(1, popIn + 0.03);
        const eased = 1 - Math.pow(1 - popIn, 3);

        if (!fly.active) {
          group.scale.setScalar(eased);
          holder.rotation.y = FACE_ROT + ptr.x * 0.7 + Math.sin(t * 0.4) * 0.14;
          holder.rotation.x = -ptr.y * 0.35 + Math.cos(t * 0.5) * 0.06;
          group.position.set(0, Math.sin(t * 0.9) * 0.07, 0);
        } else {
          fly.prog = Math.min(1, fly.prog + dt / 1.0);
          const e = 1 - Math.pow(1 - fly.prog, 3);
          group.position.lerpVectors(fly.from, fly.to, e);
          group.scale.setScalar(THREE.MathUtils.lerp(fly.scaleFrom, fly.scaleTo, e));
          holder.rotation.y = FACE_ROT + ptr.x * 0.7 + t * 0.6 * (1 - e);
        }
      }

      // movement energy → splash brightness + rim glow
      const spin = Math.abs(holder.rotation.y - prevRotY) + Math.abs(holder.rotation.x - prevRotX);
      const ptrSpeed = Math.abs(ptr.x - ptrPrev.x) + Math.abs(ptr.y - ptrPrev.y);
      prevRotY = holder.rotation.y; prevRotX = holder.rotation.x;
      ptrPrev = { x: ptr.x, y: ptr.y };
      energy = Math.min(1, energy * 0.92 + spin * 9 + ptrSpeed * 6);
      bgUniforms.uEnergy.value = energy;
      bgUniforms.uSpin.value = holder.rotation.y - FACE_ROT;
      bgUniforms.uMove.value.set(ptr.x, ptr.y);
      cursorRipple.uRippleTime.value = t;
      cursorRipple.uCursorWorld.value.copy(worldAtScreen(
        ((ptr.x + 1) / 2) * window.innerWidth,
        ((1 - ptr.y) / 2) * window.innerHeight,
      ));
      cursorRipple.uCursorStrength.value = fly.active ? 0 : Math.min(1, 0.42 + energy * 0.45);

      // cycle the rim + inner glow through the palette, keeping most of the
      // bloom on the letter's glass edge instead of the dimmer splash field
      const hue = (t * 0.06) % 1;
      fresnelMat.uniforms.cA.value.setHSL(hue, 0.78, 0.66);
      fresnelMat.uniforms.cB.value.setHSL((hue + 0.4) % 1, 0.8, 0.63);
      fresnelMat.uniforms.uGlow.value = 1.16 + energy * 0.966;
      liquidMat.emissive.setHSL((hue + 0.15) % 1, 0.68, 0.58);
      liquidMat.emissiveIntensity = 0.267 + energy * 0.46;

      composer.render();
    };
    animate();

    const finish = () => {
      document.body.style.overflow = '';
      onDone();
    };

    const onClick = () => {
      if (leavingRef.current || !holder.children.length) return;
      leavingRef.current = true;
      const mark = document.querySelector('.ds-brand-a');
      const m = mark ? mark.getBoundingClientRect() : { left: 40, top: 20, width: 30, height: 30 };
      fly.from.copy(group.position);
      fly.to.copy(worldAtScreen(m.left + m.width / 2, m.top + m.height / 2));
      // shrink so the flying A ≈ the header mark's height
      const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
      const targetWorldH = (m.height / window.innerHeight) * 2 * halfH;
      fly.scaleFrom = group.scale.x;
      fly.scaleTo = Math.max(0.06, (targetWorldH / 2.6) * 1.4);
      fly.active = true;

      overlay.classList.add('ds-gate-leave');
      setTimeout(finish, 1150);
    };
    overlay.addEventListener('click', onClick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      overlay.removeEventListener('click', onClick);
      document.body.style.overflow = '';
      pmrem.dispose();
      composer.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ds-gate" ref={overlayRef} role="button" aria-label="Enter Atelier">
      <style>{GATE_CSS}</style>
      <canvas ref={canvasRef} className="ds-gate-canvas" />
      <div className={`ds-gate-hint${ready ? ' on' : ''}`}>
        {ready ? 'click to enter' : 'pouring the letterform…'}
      </div>
    </div>
  );
}

const GATE_CSS = `
.ds-gate { position: fixed; inset: 0; z-index: 100; background: #0A0C11; cursor: pointer; }
.ds-gate.ds-gate-leave { pointer-events: none; }
.ds-gate-canvas { position: absolute; inset: 0; width: 100% !important; height: 100% !important;
  transition: opacity 0.5s ease 0.5s; }
.ds-gate-leave .ds-gate-canvas { opacity: 0; }

.ds-gate-hint { position: absolute; bottom: 7vh; left: 50%; transform: translateX(-50%);
  font-family: ${MONO}; font-size: 12px; letter-spacing: 0.3em; text-transform: uppercase;
  color: rgba(244,242,236,0.6); opacity: 0.7; transition: opacity 0.4s ease; z-index: 2; }
.ds-gate-hint.on { animation: ds-gate-hint 2.4s ease-in-out infinite; }
@keyframes ds-gate-hint { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
.ds-gate-leave .ds-gate-hint { opacity: 0; }

@media (prefers-reduced-motion: reduce) { .ds-gate-hint.on { animation: none; } }
`;
