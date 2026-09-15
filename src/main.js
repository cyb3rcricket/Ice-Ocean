import * as THREE from 'three';
import './style.css';

const app = document.querySelector('#app');
const sceneMount = document.querySelector('#scene');
const distanceReadout = document.querySelector('#distance');
const chunksReadout = document.querySelector('#chunks');
const discoveriesReadout = document.querySelector('#discoveries');
const stateLabel = document.querySelector('#state-label');
const message = document.querySelector('#message');
const pauseCard = document.querySelector('#pause-card');
const pauseButton = document.querySelector('#pause-button');
const cruiseButton = document.querySelector('#cruise-button');
const restartButton = document.querySelector('#restart-button');
const resumeButton = document.querySelector('#resume-button');
const fullscreenButton = document.querySelector('#fullscreen-button');

const WORLD_SEED = 271828;
const CHUNK_SIZE = 34;
const STREAM_RADIUS = 2;
const SEA_LEVEL = 0;
const EYE_HEIGHT = 2.75;

const state = {
  position: new THREE.Vector3(0, EYE_HEIGHT, 8),
  initialPosition: new THREE.Vector3(0, EYE_HEIGHT, 8),
  yaw: 0,
  pitch: -0.045,
  distance: 0,
  discoveries: 0,
  discoveredIds: new Set(),
  paused: false,
  autoCruise: false,
  currentCell: null,
};

const keys = new Set();
const chunks = new Map();
const colliders = [];
let renderer;
let camera;
let world;
let ocean;
let sky;
let planet;
let planetAtmosphere;
let sun;
let clock;
let elapsed = 0;
let lookPointer = null;
let messageTimer = 0;

init();

function init() {
  clock = new THREE.Clock();
  world = new THREE.Scene();
  world.background = new THREE.Color(0x030817);

  camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 480);
  camera.rotation.order = 'YXZ';

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  sceneMount.appendChild(renderer.domElement);

  world.fog = new THREE.FogExp2(0x081738, 0.0046);
  addLighting();
  addSky();
  addStars();
  addPlanet();
  addOcean();
  updateChunks(true);
  bindControls();
  updateHud();
  requestAnimationFrame(render);
}

function addLighting() {
  world.add(new THREE.HemisphereLight(0x7ddfff, 0x071126, 1.3));
  const moonFill = new THREE.DirectionalLight(0x5eb6e6, 1.6);
  moonFill.position.set(-30, 45, 18);
  world.add(moonFill);
  const warmRim = new THREE.PointLight(0xff9a64, 22, 130, 1.8);
  warmRim.position.set(18, 28, -44);
  world.add(warmRim);
}

function addSky() {
  const geometry = new THREE.SphereGeometry(210, 32, 18);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vDirection = normalize(worldPosition.xyz - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vDirection;
      void main() {
        vec3 d = normalize(vDirection);
        float horizon = smoothstep(-0.28, 0.56, d.y);
        vec3 low = vec3(0.012, 0.017, 0.065);
        vec3 high = vec3(0.042, 0.016, 0.105);
        vec3 col = mix(low, high, horizon);
        col += vec3(0.055, 0.018, 0.095) * smoothstep(0.05, 0.8, d.y);
        float ribbon = sin(d.x * 6.0 + d.y * 14.0 + uTime * 0.018);
        float ribbon2 = sin(d.x * 12.0 - d.y * 7.0 - uTime * 0.012);
        float aurora = smoothstep(0.91, 0.995, ribbon) * smoothstep(-0.04, 0.48, d.y);
        aurora += smoothstep(0.94, 0.998, ribbon2) * 0.28 * smoothstep(-0.12, 0.42, d.y);
        col += vec3(0.32, 0.018, 0.24) * aurora;
        col += vec3(0.06, 0.15, 0.34) * pow(max(0.0, 1.0 - abs(d.y - 0.2) * 2.6), 4.0);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  sky = new THREE.Mesh(geometry, material);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  world.add(sky);
}

function addStars() {
  const rng = mulberry32(88317);
  const count = 1350;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const starColors = [new THREE.Color(0xd9f7ff), new THREE.Color(0x8dc8ff), new THREE.Color(0xffd5d0), new THREE.Color(0xbfaeff)];
  for (let i = 0; i < count; i += 1) {
    const theta = rng() * Math.PI * 2;
    const y = rng() * 0.86 + 0.08;
    const radius = 160 + rng() * 120;
    const spread = Math.sqrt(1 - y * y);
    positions[i * 3] = Math.cos(theta) * spread * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * spread * radius;
    const c = starColors[Math.floor(rng() * starColors.length)];
    const brightness = 0.45 + rng() * 0.55;
    colors[i * 3] = c.r * brightness;
    colors[i * 3 + 1] = c.g * brightness;
    colors[i * 3 + 2] = c.b * brightness;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 0.7, vertexColors: true, transparent: true, opacity: 0.86, sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const stars = new THREE.Points(geometry, material);
  stars.frustumCulled = false;
  world.add(stars);
}

function addPlanet() {
  const geometry = new THREE.SphereGeometry(38, 64, 48);
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorld = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec3 lightDir = normalize(vec3(-0.5, 0.8, 0.35));
        float light = max(0.0, dot(vNormal, lightDir));
        float lat = sin(vWorld.y * 0.18 + sin(vWorld.x * 0.08) * 1.8);
        float bands = smoothstep(-0.2, 0.82, lat);
        vec3 deep = vec3(0.045, 0.08, 0.32);
        vec3 blue = vec3(0.08, 0.3, 0.64);
        vec3 violet = vec3(0.24, 0.09, 0.38);
        vec3 col = mix(deep, blue, bands * 0.76);
        col = mix(col, violet, smoothstep(0.25, 1.0, sin(vWorld.z * 0.11 + vWorld.x * 0.05)) * 0.4);
        col *= 0.46 + light * 0.94;
        float storm = sin(vWorld.x * 0.19 + sin(vWorld.y * 0.07) * 2.4) * sin(vWorld.z * 0.13 - vWorld.y * 0.06);
        float litCloud = smoothstep(0.22, 0.82, storm) * (0.35 + light * 0.65);
        col += vec3(0.07, 0.13, 0.29) * litCloud;
        col += vec3(0.16, 0.18, 0.5) * pow(max(0.0, 1.0 - dot(vNormal, normalize(cameraPosition - vWorld))), 3.0);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  planet = new THREE.Mesh(geometry, material);
  planet.position.set(27, 26, -93);
  planet.renderOrder = -2;
  world.add(planet);

  const atmosphereMaterial = new THREE.MeshBasicMaterial({ color: 0x4ca8ff, transparent: true, opacity: 0.18, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false });
  planetAtmosphere = new THREE.Mesh(new THREE.SphereGeometry(40.3, 48, 32), atmosphereMaterial);
  planetAtmosphere.position.copy(planet.position);
  planetAtmosphere.renderOrder = -1;
  world.add(planetAtmosphere);

  const sunTexture = makeSunTexture();
  sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture, color: 0xffc47c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sun.position.set(32, 31, -54);
  sun.scale.set(17, 17, 1);
  world.add(sun);
  const horizontal = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture, color: 0xff8a62, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }));
  horizontal.position.copy(sun.position);
  horizontal.scale.set(42, 2.5, 1);
  world.add(horizontal);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture, color: 0xff9c58, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.copy(sun.position);
  halo.scale.set(29, 29, 1);
  world.add(halo);
  const sunLight = new THREE.PointLight(0xffa369, 32, 140, 1.6);
  sunLight.position.copy(sun.position);
  world.add(sunLight);
}

function makeSunTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const center = 128;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, 128);
  gradient.addColorStop(0, 'rgba(255,255,240,1)');
  gradient.addColorStop(0.08, 'rgba(255,246,196,.98)');
  gradient.addColorStop(0.2, 'rgba(255,181,105,.7)');
  gradient.addColorStop(0.52, 'rgba(255,92,91,.16)');
  gradient.addColorStop(1, 'rgba(255,73,140,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,255,247,.98)'; ctx.fillRect(123, 25, 10, 206); ctx.fillRect(25, 123, 206, 10);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addOcean() {
  const geometry = new THREE.PlaneGeometry(310, 310, 170, 170);
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying float vHeight;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float value = 0.0; float amp = 0.55;
        for (int i = 0; i < 4; i++) { value += noise(p) * amp; p = p * 2.04 + vec2(17.3, 9.1); amp *= 0.5; }
        return value;
      }
      float wave(vec2 p) {
        vec2 warp = vec2(fbm(p * 0.055 + uTime * 0.018), fbm(p * 0.07 - uTime * 0.014));
        p += (warp - 0.5) * 5.5;
        return sin(p.x * 0.24 + uTime * 0.88) * 0.11
          + sin(p.y * 0.31 - uTime * 0.72) * 0.085
          + sin((p.x * 0.72 + p.y) * 0.42 + uTime * 1.08) * 0.045
          + (fbm(p * 0.16 + uTime * 0.025) - 0.5) * 0.11;
      }
      void main() {
        vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        float h = wave(worldPos.xz);
        worldPos.y += h;
        vWorld = worldPos;
        vHeight = h;
        gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying float vHeight;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float value = 0.0; float amp = 0.55;
        for (int i = 0; i < 4; i++) { value += noise(p) * amp; p = p * 2.04 + vec2(17.3, 9.1); amp *= 0.5; }
        return value;
      }
      void main() {
        float distanceFade = smoothstep(145.0, 18.0, distance(vWorld, cameraPosition));
        vec2 p = vWorld.xz * 0.12;
        p += vec2(fbm(p * 1.8 + uTime * 0.015), fbm(p * 1.4 - uTime * 0.011)) * 0.85;
        float foamField = fbm(p * 2.2 + vec2(uTime * 0.03, -uTime * 0.02));
        float crest = smoothstep(0.59, 0.78, foamField) * smoothstep(0.04, 0.19, vHeight + foamField * 0.045);
        float glint = crest * distanceFade;
        vec3 deep = vec3(0.015, 0.045, 0.15);
        vec3 teal = vec3(0.015, 0.26, 0.38);
        vec3 color = mix(deep, teal, smoothstep(-0.25, 0.28, vHeight) * 0.74 + distanceFade * 0.22);
        color += vec3(0.27, 0.82, 0.86) * glint * 0.9;
        color += vec3(0.22, 0.14, 0.42) * (1.0 - distanceFade) * 0.24;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  ocean = new THREE.Mesh(geometry, material);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = SEA_LEVEL;
  ocean.frustumCulled = false;
  world.add(ocean);
}

function updateChunks(force = false) {
  const cellX = Math.floor(state.position.x / CHUNK_SIZE);
  const cellZ = Math.floor(state.position.z / CHUNK_SIZE);
  if (!force && state.currentCell && state.currentCell.x === cellX && state.currentCell.z === cellZ) return;
  state.currentCell = { x: cellX, z: cellZ };
  for (let x = cellX - STREAM_RADIUS; x <= cellX + STREAM_RADIUS; x += 1) {
    for (let z = cellZ - STREAM_RADIUS; z <= cellZ + STREAM_RADIUS; z += 1) {
      const id = `${x}:${z}`;
      if (!chunks.has(id)) {
        const chunk = createChunk(x, z);
        chunks.set(id, chunk);
        colliders.push(...chunk.userData.colliders);
        world.add(chunk);
      }
    }
  }
  for (const [id, chunk] of chunks) {
    const [x, z] = id.split(':').map(Number);
    if (Math.abs(x - cellX) > STREAM_RADIUS || Math.abs(z - cellZ) > STREAM_RADIUS) {
      world.remove(chunk);
      for (const collider of chunk.userData.colliders) {
        const index = colliders.indexOf(collider);
        if (index !== -1) colliders.splice(index, 1);
      }
      disposeObject(chunk);
      chunks.delete(id);
    }
  }
  chunksReadout.textContent = `${chunks.size} ACTIVE`;
  app.dataset.chunks = String(chunks.size);
}

function createChunk(cx, cz) {
  const rng = mulberry32(hash2D(cx, cz));
  const group = new THREE.Group();
  group.name = `ice-field-${cx}-${cz}`;
  group.userData.colliders = [];

  const special = [];
  if (cx === 0 && cz === -1) {
    special.push({ x: 12.5, z: -34, h: 32, r: 5.4, twist: 0.2 });
    special.push({ x: -8.2, z: -28, h: 14, r: 2.8, twist: 1.4 });
    special.push({ x: 21.2, z: -28, h: 20, r: 3.8, twist: 2.8 });
  } else if (cx === -1 && cz === -1) {
    special.push({ x: -15, z: -35, h: 25, r: 4.6, twist: 2.1 });
    special.push({ x: -7.5, z: -17, h: 11, r: 2.5, twist: 0.3 });
  }
  const count = special.length || 1 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i += 1) {
    const spec = special[i] || {
      x: cx * CHUNK_SIZE + 5 + rng() * (CHUNK_SIZE - 10),
      z: cz * CHUNK_SIZE + 5 + rng() * (CHUNK_SIZE - 10),
      h: 9 + rng() * 27,
      r: 2.2 + rng() * 4.6,
      twist: rng() * Math.PI * 2,
    };
    if (Math.hypot(spec.x - state.initialPosition.x, spec.z - state.initialPosition.z) < 11) {
      spec.x += spec.x < state.initialPosition.x ? -10 : 10;
    }
    // Keep the opening voyage leg readable and give Auto Cruise enough room to reveal new fields.
    if (Math.abs(spec.x) < 4.8 && spec.z < 9 && spec.z > -64) {
      spec.x += spec.x < 0 ? -9 : 9;
    }
    const spire = createSpire(spec.h, spec.r, mulberry32(hash2D(cx * 17 + i, cz * 23 - i)), spec.twist);
    spire.position.set(spec.x, SEA_LEVEL - 0.05, spec.z);
    group.add(spire);
    group.userData.colliders.push({ x: spec.x, z: spec.z, r: spec.r * 0.8, h: spec.h });
  }

  const artifactChance = ((Math.abs(hash2D(cx + 7, cz - 11)) % 9) === 0) || (cx === 0 && cz === -1);
  if (artifactChance) {
    const artifactX = cx === 0 && cz === -1 ? -4.5 : cx * CHUNK_SIZE + 7 + rng() * 20;
    const artifactZ = cx === 0 && cz === -1 ? -40 : cz * CHUNK_SIZE + 7 + rng() * 20;
    const artifact = createArtifact(`artifact-${cx}-${cz}`, artifactX, artifactZ);
    group.add(artifact);
    group.userData.artifact = artifact;
  }
  return group;
}

function createSpire(height, radius, rng, twist = 0) {
  const levels = 8;
  const sides = 7;
  const positions = [];
  const colors = [];
  const ringData = [];
  const cA = new THREE.Color(0x0c4a83);
  const cB = new THREE.Color(0x1c9fbe);
  const cC = new THREE.Color(0x8beef1);
  for (let y = 0; y <= levels; y += 1) {
    const t = y / levels;
    const ring = [];
    const shoulderProfile = [1.04, 0.93, 0.86, 0.96, 0.68, 0.73, 0.42, 0.28, 0.045];
    const ringRadius = radius * shoulderProfile[y] * (0.9 + rng() * 0.2);
    const ringY = height * t + (y > 0 && y < levels ? (rng() - 0.5) * height * 0.045 : 0);
    for (let s = 0; s < sides; s += 1) {
      const angle = twist + (s / sides) * Math.PI * 2 + (rng() - 0.5) * 0.15;
      const wobble = 0.86 + rng() * 0.24;
      const px = Math.cos(angle) * ringRadius * wobble;
      const pz = Math.sin(angle) * ringRadius * wobble;
      positions.push(px, ringY, pz);
      ring.push({ x: px, y: ringY, z: pz });
      const sideShade = 0.55 + 0.45 * ((Math.cos(angle) + 1) / 2);
      const col = cA.clone().lerp(cB, Math.min(1, t * 0.9 + sideShade * 0.22)).lerp(cC, t * t * 0.56 + (s === 0 ? 0.15 : 0));
      colors.push(col.r, col.g, col.b);
    }
    ringData.push(ring);
  }
  const indices = [];
  for (let y = 0; y < levels; y += 1) {
    for (let s = 0; s < sides; s += 1) {
      const a = y * sides + s;
      const b = y * sides + ((s + 1) % sides);
      const c = (y + 1) * sides + s;
      const d = (y + 1) * sides + ((s + 1) % sides);
      if ((s + y) % 2 === 0) indices.push(a, b, c, b, d, c);
      else indices.push(a, b, d, a, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.12, emissive: 0x063c61, emissiveIntensity: 0.5, flatShading: true });
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x7cfcff, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false });
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), edgeMaterial);
  group.add(edges);

  const ridgeCount = 2 + Math.floor(rng() * 3);
  for (let r = 0; r < ridgeCount; r += 1) {
    const side = Math.floor(rng() * sides);
    const points = [];
    for (let y = 0; y <= levels; y += 1) {
      const p = ringData[y][side];
      points.push(new THREE.Vector3(p.x * 1.018, p.y + 0.035, p.z * 1.018));
    }
    const ridgeGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const ridgeMaterial = new THREE.LineBasicMaterial({ color: r % 2 ? 0x72eaff : 0xd0ffff, transparent: true, opacity: 0.23, blending: THREE.AdditiveBlending, depthWrite: false });
    group.add(new THREE.Line(ridgeGeometry, ridgeMaterial));
    if (r < 2) {
      const shoulder = ringData[2 + Math.floor(rng() * 4)][side];
      const shardBase = new THREE.Vector3(shoulder.x * 0.96, shoulder.y, shoulder.z * 0.96);
      const shardTip = new THREE.Vector3(shoulder.x * (1.15 + rng() * 0.35), shoulder.y + 2.5 + rng() * 6.5, shoulder.z * (1.15 + rng() * 0.35));
      const tangent = new THREE.Vector3(-shoulder.z, 0, shoulder.x).normalize().multiplyScalar(0.55 + rng() * 0.65);
      const shardGeometry = new THREE.BufferGeometry();
      shardGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
        shardBase.x - tangent.x, shardBase.y - 0.3, shardBase.z - tangent.z,
        shardBase.x + tangent.x, shardBase.y - 0.3, shardBase.z + tangent.z,
        shardBase.x, shardBase.y + 0.8, shardBase.z,
        shardTip.x, shardTip.y, shardTip.z,
      ], 3));
      shardGeometry.setIndex([0, 1, 3, 1, 2, 3, 2, 0, 3, 0, 2, 1]);
      shardGeometry.computeVertexNormals();
      group.add(new THREE.Mesh(shardGeometry, new THREE.MeshStandardMaterial({ color: r ? 0x1d9fb8 : 0x83e7ee, emissive: 0x0b6584, emissiveIntensity: 0.75, roughness: 0.2, flatShading: true })));
    }
  }
  return group;
}

function createArtifact(id, x, z) {
  const group = new THREE.Group();
  group.name = id;
  group.position.set(x, 2.1, z);
  group.userData.artifactId = id;
  const coreMaterial = new THREE.MeshStandardMaterial({ color: 0xff74e8, emissive: 0xa314c0, emissiveIntensity: 2.4, roughness: 0.16, metalness: 0.28 });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 2), coreMaterial);
  core.scale.y = 1.55;
  group.add(core);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffa6f0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.045, 8, 32), ringMaterial);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const ring2 = ring.clone();
  ring2.rotation.y = Math.PI / 2;
  ring2.material = ringMaterial.clone();
  group.add(ring2);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xf05ee6, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(5.4, 5.4, 1);
  group.add(glow);
  group.add(new THREE.PointLight(0xd943ff, 8, 18, 2));
  group.userData.core = core;
  group.userData.ring = ring;
  group.userData.ring2 = ring2;
  group.userData.discovered = state.discoveredIds.has(id);
  if (group.userData.discovered) markArtifactDiscovered(group);
  return group;
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,126,241,.72)');
  gradient.addColorStop(1, 'rgba(241,62,218,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function markArtifactDiscovered(artifact) {
  artifact.userData.discovered = true;
  artifact.userData.core.material.emissiveIntensity = 0.45;
  artifact.userData.ring.material.opacity = 0.22;
  artifact.userData.ring2.material.opacity = 0.22;
  artifact.scale.setScalar(0.75);
}

function bindControls() {
  window.addEventListener('resize', onResize);
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('keydown', (event) => {
    if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement?.tagName)) return;
    if (event.code === 'Space') { event.preventDefault(); togglePause(); return; }
    if (event.code === 'KeyR') { restartVoyage(); return; }
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    lookPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    renderer.domElement.setPointerCapture(event.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!lookPointer || lookPointer.id !== event.pointerId) return;
    const dx = event.clientX - lookPointer.x;
    const dy = event.clientY - lookPointer.y;
    lookPointer.x = event.clientX; lookPointer.y = event.clientY;
    state.yaw -= dx * 0.0032;
    state.pitch = THREE.MathUtils.clamp(state.pitch - dy * 0.0026, -0.65, 0.5);
  });
  const endLook = (event) => { if (lookPointer?.id === event.pointerId) lookPointer = null; };
  renderer.domElement.addEventListener('pointerup', endLook);
  renderer.domElement.addEventListener('pointercancel', endLook);

  document.querySelectorAll('[data-move]').forEach((button) => {
    const codeByMove = { forward: 'KeyW', left: 'KeyA', back: 'KeyS', right: 'KeyD' };
    const code = codeByMove[button.dataset.move];
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); keys.add(code); button.setPointerCapture(event.pointerId); });
    const clear = (event) => { event.preventDefault(); keys.delete(code); };
    button.addEventListener('pointerup', clear); button.addEventListener('pointercancel', clear); button.addEventListener('pointerleave', clear);
  });
  cruiseButton.addEventListener('click', () => {
    state.autoCruise = !state.autoCruise;
    cruiseButton.textContent = state.autoCruise ? 'PAUSE CRUISE' : 'AUTO CRUISE';
    if (state.autoCruise && state.paused) togglePause();
    showMessage(state.autoCruise ? 'AUTO CRUISE ENGAGED · DRAG TO STEER' : 'AUTO CRUISE DISENGAGED');
  });
  pauseButton.addEventListener('click', togglePause);
  resumeButton.addEventListener('click', togglePause);
  restartButton.addEventListener('click', restartVoyage);
  fullscreenButton.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  });
}

function togglePause() {
  state.paused = !state.paused;
  keys.clear();
  pauseCard.hidden = !state.paused;
  pauseButton.textContent = state.paused ? 'RESUME' : 'PAUSE';
  stateLabel.textContent = state.paused ? 'VOYAGE PAUSED' : 'VOYAGE ACTIVE';
  app.classList.toggle('paused', state.paused);
}

function restartVoyage() {
  keys.clear();
  state.position.copy(state.initialPosition);
  state.yaw = 0; state.pitch = -0.045;
  state.distance = 0; state.discoveries = 0; state.discoveredIds.clear(); state.currentCell = null;
  for (const chunk of chunks.values()) { world.remove(chunk); disposeObject(chunk); }
  chunks.clear(); colliders.length = 0;
  state.paused = false; state.autoCruise = false;
  pauseCard.hidden = true; pauseButton.textContent = 'PAUSE'; cruiseButton.textContent = 'AUTO CRUISE'; stateLabel.textContent = 'VOYAGE ACTIVE'; app.classList.remove('paused');
  updateChunks(true); updateHud(); showMessage('VOYAGE RESET · THE ICE REMEMBERS');
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => { if (material.map) material.map.dispose(); material.dispose(); });
    }
  });
}

function movePlayer(delta) {
  if (state.paused) return;
  const input = new THREE.Vector2();
  if (keys.has('KeyA') || keys.has('ArrowLeft')) input.x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) input.x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) input.y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) input.y -= 1;
  if (state.autoCruise) input.y = Math.max(input.y, 0.7);
  if (input.lengthSq() === 0) return;
  input.normalize();
  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 13 : 6.2) * delta * (state.autoCruise && input.y > 0.7 ? 0.78 : 1);
  let forward = new THREE.Vector3(Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  if (state.autoCruise && !lookPointer && isBlocked(state.position.x + forward.x * 5.5, state.position.z + forward.z * 5.5)) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const collider of colliders) {
      const distance = Math.hypot(state.position.x - collider.x, state.position.z - collider.z);
      if (distance < nearestDistance) { nearest = collider; nearestDistance = distance; }
    }
    if (nearest) state.yaw += (nearest.x >= state.position.x ? -1 : 1) * delta * 0.9;
    forward = new THREE.Vector3(Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  }
  const right = new THREE.Vector3(Math.cos(state.yaw), 0, Math.sin(state.yaw));
  const velocity = forward.multiplyScalar(input.y * speed).add(right.multiplyScalar(input.x * speed));
  const before = state.position.clone();
  const tryX = state.position.x + velocity.x;
  const tryZ = state.position.z + velocity.z;
  if (!isBlocked(tryX, state.position.z)) state.position.x = tryX;
  if (!isBlocked(state.position.x, tryZ)) state.position.z = tryZ;
  state.position.y = EYE_HEIGHT;
  state.distance += Math.hypot(state.position.x - before.x, state.position.z - before.z) * 0.018;
}

function isBlocked(x, z) {
  for (const collider of colliders) {
    const dx = x - collider.x;
    const dz = z - collider.z;
    if (dx * dx + dz * dz < (collider.r + 1.45) ** 2 && collider.h > 1.6) return true;
  }
  return false;
}

function checkDiscoveries() {
  for (const chunk of chunks.values()) {
    const artifact = chunk.userData.artifact;
    if (!artifact || artifact.userData.discovered) continue;
    const dx = state.position.x - artifact.position.x;
    const dz = state.position.z - artifact.position.z;
    if (Math.hypot(dx, dz) < 5.2) {
      const id = artifact.userData.artifactId;
      state.discoveredIds.add(id); state.discoveries += 1;
      markArtifactDiscovered(artifact);
      showMessage('DISCOVERY LOGGED · A SIGNAL IN THE ICE');
      updateHud();
    }
  }
}

function updateHud() {
  distanceReadout.innerHTML = `${state.distance.toFixed(1)} <small>NM</small>`;
  discoveriesReadout.innerHTML = `${state.discoveries} <small>FOUND</small>`;
  chunksReadout.innerHTML = `${chunks.size} <small>ACTIVE</small>`;
  app.dataset.distance = state.distance.toFixed(2);
  app.dataset.chunks = String(chunks.size);
  app.dataset.discoveries = String(state.discoveries);
  app.dataset.position = `${state.position.x.toFixed(2)},${state.position.y.toFixed(2)},${state.position.z.toFixed(2)}`;
}

function showMessage(text) {
  message.textContent = text; message.classList.add('show');
  clearTimeout(messageTimer); messageTimer = setTimeout(() => message.classList.remove('show'), 3200);
}

function render() {
  const delta = Math.min(clock.getDelta(), 0.05);
  elapsed += delta;
  movePlayer(delta);
  updateChunks();
  checkDiscoveries();
  camera.position.set(state.position.x, state.position.y + (state.paused ? 0 : Math.sin(elapsed * 1.35) * 0.07), state.position.z);
  camera.rotation.set(state.pitch, state.yaw, 0);
  ocean.position.x = Math.floor(state.position.x / 32) * 32;
  ocean.position.z = Math.floor(state.position.z / 32) * 32;
  sky.material.uniforms.uTime.value = elapsed;
  ocean.material.uniforms.uTime.value = elapsed;
  planet.material.uniforms.uTime.value = elapsed;
  for (const chunk of chunks.values()) {
    const artifact = chunk.userData.artifact;
    if (artifact && !artifact.userData.discovered) {
      artifact.rotation.y += delta * 0.8;
      artifact.userData.ring.rotation.z += delta * 1.8;
      artifact.userData.ring2.rotation.x += delta * 1.25;
      artifact.userData.core.position.y = Math.sin(elapsed * 2.5 + artifact.position.x) * 0.18;
    }
  }
  if (Math.floor(elapsed * 8) % 4 === 0) updateHud();
  renderer.render(world, camera);
  requestAnimationFrame(render);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
}

function hash2D(x, z) {
  let h = WORLD_SEED;
  h = Math.imul(h ^ Math.imul(x, 374761393), 668265263);
  h = Math.imul(h ^ Math.imul(z, 1274126177), 2246822519);
  return (h ^ (h >>> 13)) >>> 0;
}

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
