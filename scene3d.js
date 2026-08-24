import * as THREE from "./vendor/three.module.min.js";
import {
  buildPodModel,
  buildRobotModel,
  buildCleaningBrushModel,
  buildCleaningBucketModel,
  buildPlantSprayerModel
} from "./models3d.js";

const canvas = document.getElementById("farm3d-canvas");
const frame = document.getElementById("scene-frame");
const loading = document.getElementById("scene-loading");
const markers = [...document.querySelectorAll(".pod-marker")];

if (!canvas || !frame) throw new Error("3D farm host is missing.");

const podPositions = [
  new THREE.Vector3(-1.62, 0, 0.45),
  new THREE.Vector3(0, 0, -0.08),
  new THREE.Vector3(1.62, 0, 0.42)
];
const podStates = [
  { stage: 5, dirt: 0 },
  { stage: 2, dirt: 0 },
  { stage: 0, dirt: 0 }
];

let renderer;
let scene;
let camera;
let robot;
let robotParts;
let selectedTool = "seed";
let hoveredPod = -1;
let cameraYaw = 0.69;
let cameraPitch = 0.58;
let cameraDistance = 10.8;
let cameraYawGoal = cameraYaw;
let cameraPitchGoal = cameraPitch;
let cameraDistanceGoal = cameraDistance;
let pointerDown = null;
let dragging = false;
let lastFrame = performance.now();

const cameraTarget = new THREE.Vector3(0, 0.9, 0.15);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const textureLoader = new THREE.TextureLoader();
const podVisuals = [];
const hitTargets = [];
const effects = [];

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .68, metalness: .32, ...options });
}

function glowMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });
}

function addBox(parent, size, position, meshMaterial) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), meshMaterial);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, radius, height, position, meshMaterial, segments = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), meshMaterial);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function pipeBetween(parent, start, end, radius, meshMaterial) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const direction = to.clone().sub(from);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 10), meshMaterial);
  mesh.position.copy(from).add(to).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  parent.add(mesh);
  return mesh;
}

function buildRoom() {
  const room = new THREE.Group();
  const floorTop = material(0x15211f, { roughness: .82, metalness: .42 });
  const floorSide = material(0x070c0b, { roughness: .9, metalness: .28 });
  const wall = material(0x111b19, { roughness: .78, metalness: .5 });
  const wallDark = material(0x070d0c, { roughness: .88, metalness: .5 });
  const trim = material(0x3b4a47, { roughness: .54, metalness: .75 });
  const pipe = material(0x222c2a, { roughness: .48, metalness: .82 });
  const cyan = glowMaterial(0x34f0d2);
  const amber = glowMaterial(0xffa83b);

  const floor = addBox(room, [8.2, .25, 5.8], [0, -.15, 0], floorSide);
  floor.material = [floorSide, floorSide, floorTop, floorSide, floorSide, floorSide];
  floor.receiveShadow = true;

  for (let x = -4; x <= 4; x += 1) addBox(room, [.022, .018, 5.65], [x, -.005, 0], trim);
  for (let z = -2.8; z <= 2.8; z += 1) addBox(room, [8.05, .018, .022], [0, -.004, z], trim);

  addBox(room, [8.35, 3.75, .3], [0, 1.73, -2.92], wall);
  addBox(room, [.3, 3.75, 6.1], [-4.18, 1.73, 0], wallDark);

  for (let x = -3.7; x <= 3.7; x += 1.05) {
    addBox(room, [.07, 3.4, .08], [x, 1.7, -2.73], trim);
  }
  for (let y = .28; y <= 3.25; y += .58) {
    addBox(room, [8.02, .045, .07], [0, y, -2.72], wallDark);
  }
  for (let z = -2.55; z <= 2.55; z += .85) {
    addBox(room, [.08, 3.45, .07], [-4, 1.72, z], trim);
  }

  const door = new THREE.Group();
  addBox(door, [1.7, 2.75, .16], [0, 1.42, 0], wallDark);
  addBox(door, [1.88, .12, .22], [0, 2.82, .02], trim);
  addBox(door, [1.88, .12, .22], [0, .05, .02], trim);
  addBox(door, [.12, 2.75, .22], [-.94, 1.42, .02], trim);
  addBox(door, [.12, 2.75, .22], [.94, 1.42, .02], trim);
  addBox(door, [.08, .95, .25], [.65, 1.5, .08], cyan);
  addBox(door, [.13, .18, .26], [.66, .58, .08], amber);
  door.position.set(2.62, 0, -2.68);
  room.add(door);

  pipeBetween(room, [-3.88, 2.95, -2.66], [3.72, 2.95, -2.66], .07, pipe);
  pipeBetween(room, [-3.9, 2.63, -2.62], [1.32, 2.63, -2.62], .045, trim);
  pipeBetween(room, [-3.91, .25, -2.45], [-3.91, 3.32, -2.45], .08, pipe);
  pipeBetween(room, [-3.86, 3.18, -2.45], [-1.1, 3.18, -2.45], .08, pipe);

  addBox(room, [2.8, .045, .045], [-1.25, 3.28, -2.51], cyan);
  addBox(room, [.045, 2.1, .045], [-3.76, 1.85, 1.7], cyan);

  const deck = addBox(room, [6.2, .055, 3.35], [0, .025, .35], material(0x132b24, { transparent: true, opacity: .45, emissive: 0x03120c }));
  deck.receiveShadow = true;
  const deckOutline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(6.2, .06, 3.35)),
    new THREE.LineBasicMaterial({ color: 0x40e69d, transparent: true, opacity: .28 })
  );
  deckOutline.position.set(0, .03, .35);
  room.add(deckOutline);

  room.traverse((child) => {
    if (!child.isMesh) return;
    child.receiveShadow = true;
  });
  scene.add(room);
}

function makePlant(stage) {
  const height = 1.25 + stage * .16;
  const texture = textureLoader.load(`data/assets/plants/growth/lettuce-stage-${stage}.webp`);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const mesh = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    alphaTest: .08,
    depthWrite: true,
    toneMapped: false,
    fog: true
  }));
  mesh.scale.set(height, height, 1);
  // Align the painted half of the current game's growth sheet with the POD
  // deck; the other half of the source texture is transparent padding.
  mesh.position.y = 2.34;
  mesh.renderOrder = 5;
  mesh.userData.plantStage = stage;
  mesh.userData.baseScale = height;
  mesh.userData.grow = .08;
  return mesh;
}

function createPods() {
  podPositions.forEach((position, index) => {
    const root = new THREE.Group();
    root.position.copy(position);
    const model = buildPodModel({ extentX: 1.45, extentZ: 1.45, deckHeight: 1.65 });
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    root.add(model);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(.68, .026, 8, 40),
      glowMaterial(0x6dffc0, 0)
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = .045;
    root.add(ring);

    const dirt = new THREE.Group();
    for (let particle = 0; particle < 10; particle += 1) {
      const angle = particle / 10 * Math.PI * 2;
      const spot = new THREE.Mesh(new THREE.SphereGeometry(.045 + (particle % 3) * .012, 6, 4), material(0x5c3018, { roughness: 1 }));
      spot.position.set(Math.cos(angle) * .39, 1.54 + (particle % 2) * .025, Math.sin(angle) * .39);
      dirt.add(spot);
    }
    dirt.visible = false;
    root.add(dirt);

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(.73, .73, 2.15, 14),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hit.position.y = 1.05;
    hit.userData.podIndex = index;
    root.add(hit);
    hitTargets.push(hit);

    scene.add(root);
    podVisuals.push({ root, model, ring, dirt, plant: null });
  });
}

function createRobot() {
  robot = buildRobotModel({ extentX: 1.48, extentZ: 1.48 });
  robot.position.set(2.42, .02, -1.18);
  robot.rotation.y = -2.2;
  robot.scale.setScalar(.84);
  robot.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  robotParts = robot.userData.parts;
  scene.add(robot);

  const dock = new THREE.Mesh(new THREE.CylinderGeometry(.72, .78, .1, 12), material(0x1a2523, { metalness: .75 }));
  dock.position.set(2.42, .01, -1.18);
  dock.receiveShadow = true;
  scene.add(dock);
}

function setPodState(index, state) {
  const visual = podVisuals[index];
  if (!visual) return;
  podStates[index] = { stage: Number(state.stage) || 0, dirt: Number(state.dirt) || 0 };
  if (visual.plant) {
    visual.root.remove(visual.plant);
    visual.plant.geometry?.dispose();
    visual.plant.material.map?.dispose();
    visual.plant.material.dispose();
    visual.plant = null;
  }
  if (podStates[index].stage > 0) {
    visual.plant = makePlant(podStates[index].stage);
    visual.root.add(visual.plant);
  }
  visual.dirt.visible = podStates[index].dirt > 0;
  visual.dirt.scale.setScalar(podStates[index].dirt === 1 ? .78 : 1);
  visual.dirt.children.forEach((spot) => { spot.material.opacity = podStates[index].dirt === 1 ? .45 : 1; spot.material.transparent = podStates[index].dirt === 1; });
}

function createParticles(parent, position, color, count, spread = .65) {
  const particles = [];
  for (let index = 0; index < count; index += 1) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(.025 + Math.random() * .024, 6, 4), glowMaterial(color, .9));
    mesh.position.copy(position).add(new THREE.Vector3((Math.random() - .5) * spread, .6 + Math.random() * .5, (Math.random() - .5) * spread));
    mesh.userData.velocity = new THREE.Vector3((Math.random() - .5) * .4, .25 + Math.random() * .55, (Math.random() - .5) * .4);
    particles.push(mesh);
    parent.add(mesh);
  }
  return particles;
}

function animateTool(index, type) {
  const visual = podVisuals[index];
  if (!visual) return;
  const now = performance.now() * .001;
  const position = visual.root.position.clone();
  const effect = { type, start: now, duration: type === "bucket" || type === "brush" ? 1.2 : .9, group: new THREE.Group(), position };

  if (type === "spray") {
    const tool = buildPlantSprayerModel();
    tool.scale.setScalar(.72);
    tool.position.set(position.x + .95, 1.85, position.z + .65);
    tool.rotation.set(-.5, -1.05, -.22);
    effect.group.add(tool);
    effect.particles = createParticles(effect.group, new THREE.Vector3(position.x + .38, 1.7, position.z + .22), 0x62edff, 22, .42);
  } else if (type === "bucket") {
    const tool = buildCleaningBucketModel();
    tool.scale.setScalar(.58);
    tool.position.set(position.x + .9, 1.8, position.z + .55);
    effect.tool = tool;
    effect.group.add(tool);
    const water = new THREE.Mesh(new THREE.TorusGeometry(.34, .028, 8, 32), glowMaterial(0x46dff4, .85));
    water.rotation.x = Math.PI / 2;
    water.position.set(position.x, 1.55, position.z);
    effect.water = water;
    effect.group.add(water);
  } else if (type === "brush") {
    const tool = buildCleaningBrushModel();
    tool.scale.setScalar(.72);
    tool.position.set(position.x - .7, 1.64, position.z + .2);
    tool.rotation.set(0, .25, -.12);
    effect.tool = tool;
    effect.group.add(tool);
  } else {
    const color = type === "harvest" ? 0xc9ee55 : 0xb27a40;
    effect.particles = createParticles(effect.group, new THREE.Vector3(position.x, 1.55, position.z), color, type === "harvest" ? 28 : 14, .8);
  }

  if (!effect.group.parent) scene.add(effect.group);
  effects.push(effect);
}

function disposeGroup(group) {
  group.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((entry) => entry.dispose?.());
    else child.material?.dispose?.();
  });
  group.removeFromParent();
}

function updateEffects(time, delta) {
  for (let index = effects.length - 1; index >= 0; index -= 1) {
    const effect = effects[index];
    const age = time - effect.start;
    const progress = Math.min(1, age / effect.duration);
    if (effect.particles) {
      effect.particles.forEach((particle) => {
        particle.position.addScaledVector(particle.userData.velocity, delta);
        particle.userData.velocity.y -= delta * 1.5;
        particle.material.opacity = Math.max(0, 1 - progress);
      });
    }
    if (effect.type === "bucket" && effect.tool) {
      effect.tool.rotation.z = -Math.sin(progress * Math.PI) * 1.15;
      effect.water.scale.setScalar(.4 + progress * 1.8);
      effect.water.material.opacity = Math.sin(progress * Math.PI) * .85;
    }
    if (effect.type === "brush" && effect.tool) {
      effect.tool.position.x = effect.position.x - .7 + Math.sin(progress * Math.PI * 8) * .5;
      effect.tool.rotation.z = Math.sin(progress * Math.PI * 8) * .1;
    }
    if (progress >= 1) {
      disposeGroup(effect.group);
      effects.splice(index, 1);
    }
  }
}

function updateCamera() {
  cameraYaw += (cameraYawGoal - cameraYaw) * .09;
  cameraPitch += (cameraPitchGoal - cameraPitch) * .09;
  cameraDistance += (cameraDistanceGoal - cameraDistance) * .1;
  const horizontal = Math.cos(cameraPitch) * cameraDistance;
  camera.position.set(
    cameraTarget.x + Math.sin(cameraYaw) * horizontal,
    cameraTarget.y + Math.sin(cameraPitch) * cameraDistance,
    cameraTarget.z + Math.cos(cameraYaw) * horizontal
  );
  camera.lookAt(cameraTarget);
}

function updateMarkers() {
  const width = frame.clientWidth;
  const height = frame.clientHeight;
  podVisuals.forEach((visual, index) => {
    const projected = visual.root.position.clone().add(new THREE.Vector3(0, 1.86, 0)).project(camera);
    const marker = markers[index];
    marker.style.left = `${(projected.x * .5 + .5) * width}px`;
    marker.style.top = `${(-projected.y * .5 + .5) * height}px`;
    marker.hidden = projected.z < -1 || projected.z > 1;
  });
}

function updatePlantBillboards(time) {
  podVisuals.forEach((visual, index) => {
    visual.ring.material.opacity += (((hoveredPod === index) ? .88 : .16) - visual.ring.material.opacity) * .12;
    if (!visual.plant) return;
    const target = 1 + Math.sin(time * 1.6 + index) * .012;
    visual.plant.userData.grow += (target - visual.plant.userData.grow) * .085;
    visual.plant.scale.setScalar(visual.plant.userData.baseScale * visual.plant.userData.grow);
  });
}

function updateRobot(time) {
  if (!robot || !robotParts) return;
  robot.position.y = .02 + Math.sin(time * 1.8) * .025;
  robot.rotation.y = -2.2 + Math.sin(time * .45) * .09;
  robotParts.arms.forEach((arm, index) => { arm.rotation.x = Math.sin(time * 1.4 + index * Math.PI) * .08; });
  robotParts.eyes.forEach((eye) => { eye.scale.y = Math.sin(time * .83) > .985 ? .15 : 1; });
}

function render(now) {
  const time = now * .001;
  const delta = Math.min(.05, (now - lastFrame) * .001);
  lastFrame = now;
  updateCamera();
  updatePlantBillboards(time);
  updateRobot(time);
  updateEffects(time, delta);
  updateMarkers();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

function resize() {
  const width = Math.max(1, frame.clientWidth);
  const height = Math.max(1, frame.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function pointerNdc(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
}

function hitPod(event) {
  pointerNdc(event);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(hitTargets, false)[0];
  return hit ? Number(hit.object.userData.podIndex) : -1;
}

function initInteractions() {
  canvas.addEventListener("pointerdown", (event) => {
    pointerDown = { x: event.clientX, y: event.clientY, yaw: cameraYawGoal, pitch: cameraPitchGoal };
    dragging = false;
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (pointerDown) {
      const dx = event.clientX - pointerDown.x;
      const dy = event.clientY - pointerDown.y;
      if (Math.hypot(dx, dy) > 5) dragging = true;
      if (dragging) {
        cameraYawGoal = pointerDown.yaw - dx * .006;
        cameraPitchGoal = THREE.MathUtils.clamp(pointerDown.pitch + dy * .004, .28, .92);
        canvas.classList.add("is-dragging");
        return;
      }
    }
    hoveredPod = hitPod(event);
    canvas.classList.toggle("is-hovering", hoveredPod >= 0);
    if (hoveredPod >= 0) document.dispatchEvent(new CustomEvent("official-farm3d:hover", { detail: { index: hoveredPod } }));
  });
  canvas.addEventListener("pointerup", (event) => {
    canvas.releasePointerCapture?.(event.pointerId);
    canvas.classList.remove("is-dragging");
    if (!dragging) {
      const index = hitPod(event);
      if (index >= 0) document.dispatchEvent(new CustomEvent("official-farm3d:pod", { detail: { index } }));
    }
    pointerDown = null;
    dragging = false;
  });
  canvas.addEventListener("pointerleave", () => {
    if (!pointerDown) hoveredPod = -1;
    canvas.classList.remove("is-hovering");
  });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    cameraDistanceGoal = THREE.MathUtils.clamp(cameraDistanceGoal + Math.sign(event.deltaY) * .75, 7.2, 15.5);
  }, { passive: false });

  document.querySelectorAll("[data-camera]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.camera;
    if (action === "left") cameraYawGoal -= .34;
    if (action === "right") cameraYawGoal += .34;
    if (action === "zoom-in") cameraDistanceGoal = Math.max(7.2, cameraDistanceGoal - 1);
    if (action === "zoom-out") cameraDistanceGoal = Math.min(15.5, cameraDistanceGoal + 1);
    if (action === "reset") {
      cameraYawGoal = .69;
      cameraPitchGoal = .58;
      cameraDistanceGoal = 10.8;
    }
  }));
}

function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.32;
  renderer.setClearColor(0x020806, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020806);
  scene.fog = new THREE.Fog(0x020806, 14, 29);
  camera = new THREE.PerspectiveCamera(39, 1, .1, 80);

  scene.add(new THREE.HemisphereLight(0xcafff5, 0x0c241b, 3.05));
  const key = new THREE.DirectionalLight(0xe5fff4, 4.35);
  key.position.set(3.5, 8, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  scene.add(key);
  const cyan = new THREE.PointLight(0x38f4df, 9.5, 8, 2);
  cyan.position.set(-2.8, 3.1, -1.8);
  scene.add(cyan);
  const amber = new THREE.PointLight(0xffa83b, 4.8, 7, 2);
  amber.position.set(3.1, 1.2, -2.1);
  scene.add(amber);

  buildRoom();
  createPods();
  createRobot();
  podStates.forEach((state, index) => setPodState(index, state));
  initInteractions();
  new ResizeObserver(resize).observe(frame);
  resize();
  updateCamera();
  loading?.classList.add("is-hidden");
  loading?.setAttribute("hidden", "");
  requestAnimationFrame(render);

  window.officialFarm3d = {
    setPodState,
    setSelectedTool(tool) { selectedTool = tool; canvas.dataset.tool = tool; },
    animateTool,
    getState() { return { selectedTool, podStates: podStates.map((state) => ({ ...state })) }; }
  };
  document.dispatchEvent(new CustomEvent("official-farm3d:ready"));
}

try {
  init();
} catch (error) {
  console.error(error);
  loading.textContent = "3D FACILITY UNAVAILABLE";
  loading.classList.add("is-error");
}
