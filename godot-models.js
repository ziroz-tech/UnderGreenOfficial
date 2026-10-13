// Godot 版（本編）のモデルを栽培デモで使う：サポートロボット・栽培ポッド・レタス。
// 本編の anime_tv の見た目（光と影の2段・紺色の細い輪郭線）に寄せ、アニメーションも本編のクリップを使う。
// 読み込みが終わるまでは models3d.js の仮モデルのまま動く（ready() が false の間）。
import * as THREE from "./three.module.min.js";
import { GLTFLoader } from "./site/vendor/GLTFLoader.js";
import { clone as cloneSkinned } from "./site/vendor/SkeletonUtils.js";

const MODEL_DIR = "site/models/";
// 本編の pod.glb はメートル。デモのマス（1）に合わせて少し大きくする
export const POD_SCALE = 1.12;
// 作物の位置：本編 grow_pod.tscn の 0.62（ポッドの原点は床から 0.09 上・モデルは 0.09 下げてある）
export const POD_DECK = 0.03 + 0.71 * POD_SCALE;
// 本編 lettuce.tscn の ModelMount の倍率
const LETTUCE_SCALE = 2.4 * POD_SCALE;
// 本編 crop_model_3d.gd の stage_days（Day69 は基本形＝収穫期）
const STAGE_DAYS = [0, 2, 3, 4, 6, 8, 10, 13, 16, 20, 24, 28, 33, 38, 44, 50, 56, 62, 69];
const ROBOT_HEIGHT = 0.8;
const ROBOT_CLIPS = { idle: "SR_Idle", move: "SR_Walk", work: "SR_Work", joy: "SR_Celebrate" };
const OUTLINE_COLOR = new THREE.Color().setRGB(0.11, 0.13, 0.2, THREE.SRGBColorSpace);

const templates = {};
const live = new Set();
const podStates = new Map();
const plants = new Map();
const pods = new Map();
const lightWorld = new THREE.Vector3();
const parentScale = new THREE.Vector3();
const rootWorld = new THREE.Vector3();
let loading = null;
let isReady = false;

export const ready = () => isReady;

function toonGradient() {
  // 本編 anime_tv：2段（影は青みのある暗さ、光の側はそのまま）
  const data = new Uint8Array([118, 118, 118, 255, 255, 255, 255, 255]);
  const texture = new THREE.DataTexture(data, 2, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
const GRADIENT = toonGradient();

function toonFrom(source, overrides = {}) {
  const material = new THREE.MeshToonMaterial({
    name: source.name,
    color: source.color ? source.color.clone() : new THREE.Color(1, 1, 1),
    map: source.map || null,
    emissive: source.emissive ? source.emissive.clone() : new THREE.Color(0, 0, 0),
    emissiveMap: source.emissiveMap || null,
    emissiveIntensity: source.emissiveIntensity ?? 1,
    gradientMap: GRADIENT,
    transparent: Boolean(source.transparent),
    opacity: source.opacity ?? 1,
    side: source.side ?? THREE.FrontSide,
    alphaTest: source.alphaTest || 0
  });
  Object.assign(material, overrides);
  return material;
}

function outlineMaterial(width) {
  const material = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.outlineWidth = { value: width };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float outlineWidth;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += normalize( normal ) * outlineWidth;");
  };
  material.customProgramCacheKey = () => `ug-outline-${width.toFixed(5)}`;
  return material;
}

/** 輪郭線：同じ形を裏返して法線方向へ少し太らせる（本編 pod_outline.gdshader と同じ考え方） */
function addOutlines(root, worldWidth) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((node) => { if (node.isMesh && !node.userData.isOutline) meshes.push(node); });
  const worldBox = new THREE.Box3();
  const worldSize = new THREE.Vector3();
  const localSize = new THREE.Vector3();
  meshes.forEach((mesh) => {
    // 頂点の座標系と見た目の大きさの比（スキンのあるモデルは骨の倍率が頂点側に効く）から、太さを頂点の単位に直す
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (mesh.isSkinnedMesh) mesh.computeBoundingBox();
    worldBox.setFromObject(mesh);
    const ratio = worldBox.getSize(worldSize).length() / Math.max(1e-6, mesh.geometry.boundingBox.getSize(localSize).length());
    const local = worldWidth / Math.max(1e-6, ratio);
    const material = outlineMaterial(local);
    let outline;
    if (mesh.isSkinnedMesh) {
      outline = new THREE.SkinnedMesh(mesh.geometry, material);
      outline.bind(mesh.skeleton, mesh.bindMatrix);
    } else {
      outline = new THREE.Mesh(mesh.geometry, material);
    }
    outline.userData.isOutline = true;
    outline.userData.sharedAsset = true;
    outline.raycast = () => {};
    mesh.add(outline);
  });
}

function markShared(root) {
  root.traverse((node) => {
    if (node.isMesh) {
      node.userData.sharedAsset = true;
      node.castShadow = false;
      node.receiveShadow = false;
    }
  });
}

function convertMaterials(root, overridesByName = {}) {
  const cache = new Map();
  root.traverse((node) => {
    if (!node.isMesh) return;
    const convert = (material) => {
      if (!material) return material;
      if (!cache.has(material)) cache.set(material, toonFrom(material, overridesByName[material.name] || {}));
      return cache.get(material);
    };
    node.material = Array.isArray(node.material) ? node.material.map(convert) : convert(node.material);
  });
}

/** 足元を原点・高さ height にそろえる（スキンのあるモデルはポーズを付けてから測る） */
function normalize(scene, height, clips = [], poseClip = "") {
  const wrapper = new THREE.Group();
  wrapper.add(scene);
  const pose = clips.find((clip) => clip.name === poseClip);
  if (pose) {
    const mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(pose).play();
    mixer.update(0.01);
  }
  scene.updateMatrixWorld(true);
  scene.traverse((node) => { if (node.isSkinnedMesh) node.computeBoundingBox(); });
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const factor = height ? height / Math.max(1e-4, size.y) : 1;
  scene.scale.multiplyScalar(factor);
  scene.updateMatrixWorld(true);
  scene.traverse((node) => { if (node.isSkinnedMesh) node.computeBoundingBox(); });
  box.setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= box.min.y;
  return wrapper;
}

async function loadTextures(names) {
  const loader = new THREE.TextureLoader();
  const entries = await Promise.all(names.map((name) => loader.loadAsync(MODEL_DIR + name).then((texture) => {
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    return [name, texture];
  })));
  return Object.fromEntries(entries);
}

export function load() {
  if (loading) return loading;
  const loader = new GLTFLoader();
  loading = Promise.all([
    loader.loadAsync(MODEL_DIR + "pod.glb"),
    loader.loadAsync(MODEL_DIR + "lettuce.glb"),
    loader.loadAsync(MODEL_DIR + "support-robot.glb"),
    loadTextures(["pod_anime_albedo.webp", "pod_anime_emission.webp"]).catch(() => ({}))
  ]).then(([pod, lettuce, robot, anime]) => {
    // ポッド：本編のアニメ風アトラス（アトラスを使う材質だけ差し替え）
    convertMaterials(pod.scene);
    pod.scene.traverse((node) => {
      if (!node.isMesh) return;
      const material = node.material;
      if (material?.map && anime["pod_anime_albedo.webp"]) {
        material.map = anime["pod_anime_albedo.webp"];
        material.color.setRGB(1, 1, 1);
        if (anime["pod_anime_emission.webp"]) {
          material.emissiveMap = anime["pod_anime_emission.webp"];
          material.emissive.setRGB(1, 1, 1);
        }
        material.needsUpdate = true;
      }
    });
    templates.pod = normalize(pod.scene, 0);
    templates.pod.scale.setScalar(POD_SCALE);
    addOutlines(templates.pod, 0.006);
    markShared(templates.pod);
    templates.podClips = new Map(pod.animations.map((clip) => [clip.name, clip]));

    convertMaterials(lettuce.scene);
    // 原点はもともと株元。形のキー（種の形は地中にある）で箱が広がるので、そろえ直さない
    templates.lettuce = new THREE.Group();
    templates.lettuce.add(lettuce.scene);
    templates.lettuce.scale.setScalar(LETTUCE_SCALE);
    markShared(templates.lettuce);

    convertMaterials(robot.scene);
    templates.robot = normalize(robot.scene, ROBOT_HEIGHT, robot.animations, "SR_Idle");
    addOutlines(templates.robot, 0.009);
    markShared(templates.robot);
    templates.robotClips = new Map(robot.animations.map((clip) => [clip.name, clip]));
    isReady = true;
    return true;
  }).catch((error) => {
    console.warn("Godot models unavailable; keeping placeholder models", error);
    return false;
  });
  return loading;
}

function attached(object) {
  let node = object;
  while (node.parent) node = node.parent;
  return node.isScene === true;
}

/** 毎フレーム：ミキサーを進め、世界の作り直しで外れたものは忘れる */
export function update(delta) {
  live.forEach((instance) => {
    if (!attached(instance.root)) {
      live.delete(instance);
      if (instance.plantKey && plants.get(instance.plantKey) === instance) plants.delete(instance.plantKey);
      pods.forEach((value, key) => { if (value === instance) pods.delete(key); });
      return;
    }
    instance.mixer?.update(delta);
    instance.tick?.(delta);
  });
}

/* ---------------- 栽培ポッド ---------------- */
export function pod({ key, running }) {
  const root = templates.pod.clone(true);
  const mixer = new THREE.AnimationMixer(root);
  const clip = (name) => {
    const source = templates.podClips.get(name);
    return source ? mixer.clipAction(source) : null;
  };
  const steady = (name, loop) => {
    const action = clip(name);
    if (!action) return;
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    if (loop) action.time = Math.random() * action.getClip().duration;
    else action.time = action.getClip().duration;
    action.play();
  };
  const previous = podStates.get(key);
  podStates.set(key, running);
  if (previous === undefined || previous === running) {
    steady(running ? "Pod_Hover" : "Pod_Off", running);
  } else {
    const transition = clip(running ? "Pod_Startup" : "Pod_Shutdown");
    if (transition) {
      transition.setLoop(THREE.LoopOnce, 1);
      transition.clampWhenFinished = true;
      transition.play();
      mixer.addEventListener("finished", () => {
        transition.stop();
        steady(running ? "Pod_Hover" : "Pod_Off", running);
      });
    } else {
      steady(running ? "Pod_Hover" : "Pod_Off", running);
    }
  }
  const light = root.getObjectByName("hoverLight");
  const instance = {
    root,
    mixer,
    running,
    cropHeight: 0,
    tick() {
      // 本編 pod_model.gd：浮いている間、ライトは作物のてっぺん＋8 cm まで持ち上がる
      if (!light || !instance.running || instance.cropHeight <= 0) return;
      root.getWorldPosition(rootWorld);
      const minimum = rootWorld.y + (POD_DECK - 0.03) + instance.cropHeight + 0.08;
      light.getWorldPosition(lightWorld);
      const deficit = minimum - lightWorld.y;
      if (deficit > 0) {
        light.parent.getWorldScale(parentScale);
        light.position.y += deficit / Math.max(1e-4, parentScale.y);
      }
    }
  };
  live.add(instance);
  pods.set(key, instance);
  root.userData.godotModel = "pod";
  return root;
}

/* ---------------- レタス ---------------- */
function applyGrowth(meshes, growth) {
  const day = THREE.MathUtils.clamp(growth, 0, 1) * STAGE_DAYS[STAGE_DAYS.length - 1];
  let segment = STAGE_DAYS.length - 2;
  for (let index = 0; index < STAGE_DAYS.length - 1; index += 1) {
    if (day >= STAGE_DAYS[index] && day <= STAGE_DAYS[index + 1]) {
      segment = index;
      break;
    }
  }
  const weight = (day - STAGE_DAYS[segment]) / Math.max(1e-4, STAGE_DAYS[segment + 1] - STAGE_DAYS[segment]);
  meshes.forEach((mesh) => {
    const influences = mesh.morphTargetInfluences;
    const dictionary = mesh.morphTargetDictionary;
    if (!influences || !dictionary) return;
    influences.fill(0);
    const from = dictionary[`Day${String(STAGE_DAYS[segment]).padStart(2, "0")}`];
    const to = dictionary[`Day${String(STAGE_DAYS[segment + 1]).padStart(2, "0")}`];
    if (from !== undefined) influences[from] = 1 - weight;
    if (to !== undefined) influences[to] = weight;
  });
}

export function lettuce({ key, podKey = null, growth = 0, dead = false }) {
  const root = templates.lettuce.clone(true);
  const meshes = [];
  root.traverse((node) => {
    if (node.isMesh && !node.userData.isOutline && node.morphTargetInfluences) meshes.push(node);
  });
  root.traverse((node) => {
    if (node.userData.isOutline && node.parent?.morphTargetInfluences) node.morphTargetInfluences = node.parent.morphTargetInfluences;
  });
  if (dead) {
    meshes.forEach((mesh) => {
      mesh.material = mesh.material.clone();
      mesh.material.color.set(0x856039);
    });
  }
  const instance = {
    root,
    plantKey: key,
    growth: -1,
    target: growth,
    setGrowth(value) { instance.target = value; },
    tick(delta) {
      // 成長は滑らかに追いかける（スナップショットは 0.18 秒ごと）
      const next = instance.growth < 0 ? instance.target : instance.growth + (instance.target - instance.growth) * Math.min(1, delta * 6);
      if (Math.abs(next - instance.growth) > 1e-4) {
        instance.growth = next;
        applyGrowth(meshes, next);
      }
      const pod = podKey !== null ? pods.get(podKey) : null;
      if (pod) pod.cropHeight = lettuceHeight(instance.growth);
    }
  };
  instance.tick(1);
  live.add(instance);
  if (key) plants.set(key, instance);
  root.userData.godotModel = "lettuce";
  return root;
}

export const lettuceHeight = (growth) => 0.03 + Math.pow(THREE.MathUtils.clamp(growth, 0, 1), 0.9) * 0.13 * LETTUCE_SCALE;

/** スナップショットの成長を、今あるレタスへ渡す */
export function syncPlants(next, keyFor) {
  if (!isReady || !plants.size) return;
  next?.bases?.forEach((base) => base.shelves.forEach((unit) => unit.slots.forEach((plant, slotIndex) => {
    if (!plant) return;
    const instance = plants.get(keyFor(base.id, unit.id, slotIndex));
    if (instance) instance.setGrowth(plant.ready ? 1 : Number(plant.growth) || 0);
  })));
}

/* ---------------- サポートロボット ---------------- */
export function robot() {
  const root = cloneSkinned(templates.robot);
  const mixer = new THREE.AnimationMixer(root);
  let current = null;
  let currentMotion = "";
  const setMotion = (motion) => {
    if (motion === currentMotion) return;
    currentMotion = motion;
    const source = templates.robotClips.get(ROBOT_CLIPS[motion] || ROBOT_CLIPS.idle);
    if (!source) return;
    const action = mixer.clipAction(source);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    // 複数のロボットが同じ動きにそろわないよう、開始位置をずらす
    action.time = Math.random() * source.duration;
    action.enabled = true;
    action.play();
    if (current && current !== action) current.crossFadeTo(action, 0.3, false);
    current = action;
  };
  setMotion("idle");
  const instance = { root, mixer };
  live.add(instance);
  root.userData.godot = { setMotion };
  root.userData.godotModel = "robot";
  return root;
}
