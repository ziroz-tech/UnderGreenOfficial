// Live support robot (Godot model) for the contact section. site.js builds it ahead of time;
// `calm` resolves at a quiet moment, and each one-off heavy step waits for it.
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";

const REACTIONS = ["SR_Celebrate", "SR_Clap", "SR_Surprise", "SR_Nod", "SR_Wave"];

export async function mountRobot(container, { url, reduced = false, calm = () => Promise.resolve() } = {}) {
  await calm();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  await calm();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 60);
  camera.position.set(0, 1.45, 7.1);

  scene.add(new THREE.HemisphereLight(0xd8fff0, 0x06120c, 0.6));
  const key = new THREE.DirectionalLight(0xfff3e0, 2.2);
  key.position.set(-2.4, 4.2, 3.2);
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
  scene.add(floor);
  // soft contact shadow painted on the floor (a real-time shadow map cost ~1 s of shader compiling)
  const soft = document.createElement("canvas");
  soft.width = soft.height = 64;
  const softContext = soft.getContext("2d");
  const blobGradient = softContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  blobGradient.addColorStop(0, "#fff");
  blobGradient.addColorStop(0.45, "#999");
  blobGradient.addColorStop(1, "#000");
  softContext.fillStyle = blobGradient;
  softContext.fillRect(0, 0, 64, 64);
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.62, alphaMap: new THREE.CanvasTexture(soft), depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.004;
  scene.add(blob);
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
  await calm();
  const model = gltf.scene;
  model.traverse((node) => {
    if (!node.isMesh) return;
    // the back tank is see-through already; true refraction needs a second full pass (and ~1 s of compiling)
    [].concat(node.material).forEach((material) => { if (material.transmission) material.transmission = 0; });
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
  const footprint = box.getSize(new THREE.Vector3());
  blob.scale.set(Math.min(2.1, footprint.x * 0.78), Math.min(1.6, footprint.z * 1.45), 1);
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
  // compile every shader off the main thread, then make the first draw of each material in its
  // own quiet moment (the GPU driver still finishes a shader when it is first used)
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  const meshes = [];
  scene.traverse((node) => { if (node.isMesh && node.visible) meshes.push(node); });
  const byMaterial = new Map();
  meshes.forEach((mesh) => {
    const id = [].concat(mesh.material).map((material) => material.uuid).join();
    if (!byMaterial.has(id)) byMaterial.set(id, []);
    byMaterial.get(id).push(mesh);
  });
  for (const group of byMaterial.values()) {
    await calm();
    meshes.forEach((mesh) => { mesh.visible = group.includes(mesh); });
    renderer.render(scene, camera);
  }
  meshes.forEach((mesh) => { mesh.visible = true; });
  await calm();
  renderer.render(scene, camera);
  return { setVisible, react };
}
