// Live support robot (Godot model) for the contact section. Loaded on demand by site.js.
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";

const REACTIONS = ["SR_Celebrate", "SR_Clap", "SR_Surprise", "SR_Nod", "SR_Wave"];

export async function mountRobot(container, { url, reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 60);
  camera.position.set(0, 1.45, 7.1);

  scene.add(new THREE.HemisphereLight(0xd8fff0, 0x06120c, 0.6));
  const key = new THREE.DirectionalLight(0xfff3e0, 2.2);
  key.position.set(-2.4, 4.2, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 14;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6dffc4, 3.4);
  rim.position.set(2.8, 2.4, -3.2);
  scene.add(rim);
  const grow = new THREE.PointLight(0x8affb6, 6, 6, 1.6);
  grow.position.set(0, 3.1, 0.6);
  scene.add(grow);

  // platform: dark disc + glowing ring, like the farm floor tiles
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.25, 64),
    new THREE.MeshStandardMaterial({ color: 0x0b1712, roughness: 0.85, metalness: 0.1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.18, 1.24, 96),
    new THREE.MeshBasicMaterial({ color: 0x8affb6, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  scene.add(ring);
  const fade = document.createElement("canvas");
  fade.width = 4;
  fade.height = 128;
  const fadeContext = fade.getContext("2d");
  const gradient = fadeContext.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, "#fff");
  gradient.addColorStop(0.55, "#666");
  gradient.addColorStop(1, "#222");
  fadeContext.fillStyle = gradient;
  fadeContext.fillRect(0, 0, 4, 128);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 1.28, 3.4, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x8affb6, transparent: true, opacity: 0.16, alphaMap: new THREE.CanvasTexture(fade), side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  beam.position.y = 1.7;
  scene.add(beam);

  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  model.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  // measure in the idle pose (skinned bounds follow the bones)
  const idleClip = gltf.animations.find((clip) => clip.name === "SR_Idle");
  if (idleClip) {
    const probe = new THREE.AnimationMixer(model);
    probe.clipAction(idleClip).play();
    probe.update(0.01);
    probe.stopAllAction();
  }
  model.updateMatrixWorld(true);
  model.traverse((node) => { if (node.isSkinnedMesh) node.computeBoundingBox(); });
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = 1.9 / Math.max(size.y, 0.001);
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  model.traverse((node) => { if (node.isSkinnedMesh) node.computeBoundingBox(); });
  box.setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
  const pivot = new THREE.Group();
  pivot.add(model);
  scene.add(pivot);
  const target = new THREE.Vector3(0, 0.92, 0);
  camera.lookAt(target);

  const head = model.getObjectByName("head.x") || model.getObjectByName("roboHead");
  const headBase = head ? head.quaternion.clone() : null;
  const mixer = new THREE.AnimationMixer(model);
  const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
  const actions = new Map();
  const action = (name) => {
    if (!clips.has(name)) return null;
    if (!actions.has(name)) actions.set(name, mixer.clipAction(clips.get(name)));
    return actions.get(name);
  };
  let current = null;
  const play = (name, { once = false, fade = 0.35 } = {}) => {
    const next = action(name);
    if (!next) return;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.enabled = true;
    if (current && current !== next) current.crossFadeTo(next, fade, false);
    next.play();
    current = next;
  };
  mixer.addEventListener("finished", () => play("SR_Idle", { fade: 0.45 }));
  play("SR_Idle");

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onMove = (event) => {
    pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  let reaction = 0;
  const react = () => {
    play(REACTIONS[reaction % REACTIONS.length], { once: true, fade: 0.2 });
    reaction += 1;
  };
  renderer.domElement.addEventListener("click", react);

  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();

  const clock = new THREE.Clock();
  let visible = false;
  let raf = 0;
  const tick = () => {
    raf = 0;
    if (!visible || document.hidden) return;
    const delta = Math.min(0.05, clock.getDelta());
    const time = clock.elapsedTime;
    if (head) head.quaternion.copy(headBase);
    mixer.update(reduced ? 0 : delta);
    if (head) headBase.copy(head.quaternion);
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;
    pivot.rotation.y = pointer.x * 0.55 + Math.sin(time * 0.4) * 0.05;
    if (head) {
      head.rotateY(pointer.x * 0.35);
      head.rotateX(pointer.y * 0.18);
    }
    ring.material.opacity = 0.65 + Math.sin(time * 2.2) * 0.2;
    grow.intensity = 5.5 + Math.sin(time * 1.3) * 0.8 + (Math.random() < 0.01 ? -3 : 0);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  const setVisible = (on) => {
    const wasVisible = visible;
    visible = on;
    if (on && !raf) {
      clock.getDelta();
      raf = requestAnimationFrame(tick);
    }
    if (on && !wasVisible && !reduced) play("SR_Wave", { once: true, fade: 0.2 });
  };
  document.addEventListener("visibilitychange", () => setVisible(visible));
  renderer.render(scene, camera);
  return { setVisible, react };
}
