// MARISOL HEAT — render.js
// One job: the look. Golden-hour sun (1 shadowed directional light, tight
// frustum following the player), gradient sky dome with a visible sun disc,
// warm fog, and a CORRECT post chain done by hand because three r160's
// renderer tone mapping is silently skipped once you render to a target:
// scene -> HalfFloat MSAA target -> fullscreen grade pass (ACES filmic +
// selective bloom from HDR brights + vignette + grain + sRGB encode).
// No UnrealBloomPass addon is vendored, so bloom is a 9-tap bright-pass blur
// inside the grade shader; only neon / lamps / sun / muzzle flash exceed the
// HDR threshold, so streets never bloom. Low quality renders direct with the
// renderer's own ACES tone mapping.
import * as THREE from "three";
import { CONFIG } from "./config.js";
import { particleTexture, blobTexture } from "./textures.js";

const GRADE_VERT = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
// ACES approximation (Narkowicz), selective bloom, vignette, grain.
const GRADE_FRAG = `
uniform sampler2D tDiffuse;
uniform float uExposure; uniform float uTime; uniform float uBloom;
varying vec2 vUv;
vec3 aces(vec3 x){
  return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0);
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  vec3 c = texture2D(tDiffuse, uv).rgb;
  // selective bloom: 9-tap blur of only the HDR brights (threshold ~1.6 linear)
  vec2 texel = vec2(1.0/1280.0, 1.0/720.0);
  vec3 bloom = vec3(0.0);
  for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++){
    vec3 s = texture2D(tDiffuse, uv + vec2(float(i),float(j))*texel*3.0).rgb;
    bloom += max(s - vec3(1.6), vec3(0.0));
  }
  bloom /= 9.0;
  c += bloom * uBloom;
  c = aces(c * uExposure);
  // sRGB encode
  c = pow(c, vec3(1.0/2.2));
  // vignette
  float d = distance(uv, vec2(0.5));
  c *= 1.0 - 0.28 * smoothstep(0.45, 0.85, d);
  // film grain, just above perception (0.05)
  c += (hash(uv * (uTime + 1.0)) - 0.5) * 0.05;
  gl_FragColor = vec4(c, 1.0);
}
`;

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe08a5a, 180, 620);

  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 1200);
  camera.position.set(0, 8, -20);

  // Sky dome: gradient shader (orange horizon -> violet top) + sun disc.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x4a3a78) },
      midColor: { value: new THREE.Color(0xe08a5a) },
      botColor: { value: new THREE.Color(0xffc978) },
      sunDir: { value: new THREE.Vector3(0.4, 0.25, -0.6).normalize() },
      sunColor: { value: new THREE.Color(0xffd9a0) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 topColor, midColor, botColor, sunColor; uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.1, 1.0);
        vec3 col = mix(botColor, midColor, smoothstep(-0.05, 0.18, h));
        col = mix(col, topColor, smoothstep(0.18, 0.75, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * (pow(s, 220.0) * 4.0 + pow(s, 18.0) * 0.55);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), skyMat);
  scene.add(sky);

  // The one shadowed light: low warm sun. Frustum follows the player.
  const sun = new THREE.DirectionalLight(0xffb36b, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(CONFIG.SHADOW_MAP_SIZE, CONFIG.SHADOW_MAP_SIZE);
  sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0x8a7bd8, 0x3a2f2a, 1.05);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0x604a50, 0.5);
  scene.add(amb);

  // Post target: HalfFloat (HDR brights survive) + 4x MSAA.
  const target = new THREE.WebGLRenderTarget(960, 540, { type: THREE.HalfFloatType, samples: 4 });
  const gradeMat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: target.texture },
      uExposure: { value: 1.15 }, uTime: { value: 0 }, uBloom: { value: 0.85 },
    },
    vertexShader: GRADE_VERT, fragmentShader: GRADE_FRAG, depthTest: false, depthWrite: false,
  });
  const gradeScene = new THREE.Scene();
  const gradeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  gradeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), gradeMat));

  const api = {
    renderer, scene, camera, sun, hemi, amb, skyMat, target, gradeMat,
    quality: "high",
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      target.setSize(Math.floor(w * renderer.getPixelRatio()), Math.floor(h * renderer.getPixelRatio()));
    },
    // Apply a time preset (golden / noon / night). Sun position follows the hour.
    applyTime(name) {
      const p = CONFIG.TIME_PRESETS[name];
      const ang = ((p.hour - 6) / 12) * Math.PI; // sunrise 6h -> sunset 18h
      // Sunset in the SOUTH-WEST so the beach vista gets the sun over the
      // ocean and the city's south faces catch the warm light.
      const dir = new THREE.Vector3(Math.cos(ang) * 0.7, Math.max(Math.sin(ang), 0.06), 0.55).normalize();
      this.sunDir = dir;
      sun.position.copy(dir).multiplyScalar(180);
      sun.color.setHex(p.sunColor); sun.intensity = p.sunIntensity;
      hemi.color.setHex(p.hemiSky); hemi.groundColor.setHex(p.hemiGround);
      scene.fog.color.setHex(p.fog);
      gradeMat.uniforms.uExposure.value = p.exposure;
      renderer.toneMappingExposure = p.exposure;
      skyMat.uniforms.sunDir.value.copy(dir);
      skyMat.uniforms.sunColor.value.setHex(p.sunColor);
      const night = name === "night";
      skyMat.uniforms.topColor.value.setHex(night ? 0x0a0a22 : 0x4a3a78);
      skyMat.uniforms.midColor.value.setHex(night ? 0x2a1a44 : 0xe08a5a);
      skyMat.uniforms.botColor.value.setHex(night ? 0x3a2a55 : 0xffc978);
      return p;
    },
    // Keep the shadow frustum tight around the subject (player / shot),
    // with the sun coming from the time preset's direction.
    followShadow(x, z) {
      const d = this.sunDir || new THREE.Vector3(-0.7, 0.3, 0.55).normalize();
      sun.target.position.set(x, 0, z);
      sun.position.set(x + d.x * 180, 40 + d.y * 180, z + d.z * 180);
    },
    render(time) {
      gradeMat.uniforms.uTime.value = time;
      if (this.quality === "high") {
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        this.sceneDrawCalls = renderer.info.render.calls;
        renderer.setRenderTarget(null);
        renderer.render(gradeScene, gradeCam);
      } else {
        renderer.render(scene, camera);
        this.sceneDrawCalls = renderer.info.render.calls;
      }
    },
    sceneDrawCalls: 0,
  };
  return api;
}

// ---- pooled blob shadows: ONE InstancedMesh for every car / ped / player.
// Per-object blob planes were ~35 draw calls; this is 1.
export function createBlobShadows(scene, count) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
  const im = new THREE.InstancedMesh(geo, mat, count);
  im.frustumCulled = false;
  scene.add(im);
  const m = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) im.setMatrixAt(i, hidden);
  return {
    set(i, x, z, w, d, rotY = 0) {
      m.makeRotationY(rotY);
      m.scale(new THREE.Vector3(w, 1, d));
      m.setPosition(x, 0.04, z);
      im.setMatrixAt(i, m);
      im.instanceMatrix.needsUpdate = true;
    },
    hide(i) { im.setMatrixAt(i, hidden); im.instanceMatrix.needsUpdate = true; },
  };
}

export { blobTexture };
export function createParticles(scene) {
  const MAX = 500;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const size = new Float32Array(MAX);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { map: { value: particleTexture() } },
    vertexShader: `
      attribute float size; attribute vec3 color; varying vec3 vC;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = size * (220.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform sampler2D map; varying vec3 vC;
      void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a * 0.85); }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const parts = [];
  for (let i = 0; i < MAX; i++) parts.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, s: 1, max: 1 });
  let cursor = 0;
  function spawn(x, y, z, vx, vy, vz, life, r, g, b, s) {
    const p = parts[cursor]; cursor = (cursor + 1) % MAX;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.max = life; p.r = r; p.g = g; p.b = b; p.s = s;
  }
  return {
    spawn,
    burst(x, y, z, n, color, speed, life, sizePx) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
        const sp = speed * (0.4 + Math.random() * 0.8);
        spawn(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.abs(Math.sin(e)) * sp + 1, Math.sin(a) * Math.cos(e) * sp,
          life * (0.6 + Math.random() * 0.7), color[0], color[1], color[2], sizePx * (0.7 + Math.random() * 0.6));
      }
    },
    smoke(x, y, z) { spawn(x, y, z, (Math.random() - 0.5) * 1.5, 1.5 + Math.random(), (Math.random() - 0.5) * 1.5, 1.1, 0.25, 0.25, 0.28, 1.8); },
    update(dt) {
      for (let i = 0; i < MAX; i++) {
        const p = parts[i];
        if (p.life > 0) {
          p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy += 0.6 * dt;
          const f = Math.max(p.life / p.max, 0);
          pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
          col[i * 3] = p.r * f; col[i * 3 + 1] = p.g * f; col[i * 3 + 2] = p.b * f;
          size[i] = p.s * (1 + (1 - f) * 1.5);
        } else { pos[i * 3 + 1] = -100; size[i] = 0; }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
    },
  };
}
