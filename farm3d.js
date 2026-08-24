import * as THREE from "./three.module.min.js";
import { buildChargeDockModel, buildRobotModel, buildCleaningBrushModel, buildCleaningBucketModel, buildPlantSprayerModel, buildMaintenanceWrenchModel, buildMarketCourierScooterModel, MODEL_BUILDERS } from "./models3d.js?v=20260821fluorescent1";

const FLOOR_HEIGHT = 0.18;
const BASE_GAP = 3.4;
const CAMERA_MIN_DISTANCE = 4.5;
const CAMERA_MAX_DISTANCE = 80;
const INITIAL_CAMERA_YAW = THREE.MathUtils.degToRad(48.5);
const INITIAL_CAMERA_PITCH = THREE.MathUtils.degToRad(34);
const INITIAL_CAMERA_TARGET_OFFSET = new THREE.Vector3(0.695, 0, 1.19);
const SYNC_INTERVAL = 180;
const CITY_NORMAL_UPDATE_INTERVAL = 0.1;
const CITY_LOW_SPEC_UPDATE_INTERVAL = 0.25;
const FURNITURE_SET_STATUS_VISIBLE = false;
const textureLoader = new THREE.TextureLoader();
const textureCache = new Map();
const textTextureCache = new Map();
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const worldUp = new THREE.Vector3(0, 1, 0);
const billboardWorldPosition = new THREE.Vector3();
const cameraBoundsSize = new THREE.Vector3();
const cameraTravelLimits = {
  minX: Number.NEGATIVE_INFINITY,
  maxX: Number.POSITIVE_INFINITY,
  minZ: Number.NEGATIVE_INFINITY,
  maxZ: Number.POSITIVE_INFINITY,
  maxDistance: CAMERA_MAX_DISTANCE
};
const equipmentDragPlane = new THREE.Plane(worldUp, 0);
const equipmentDragPlanePoint = new THREE.Vector3();

let shell, canvas, renderer, scene, camera, world, hoverOutline, hoverLabel, hud, loadingPanel, hoveredExpansionObject;
let snapshot = null;
let snapshotSignature = "";
let lastSyncAt = 0;
let forceSync = true;
const pendingSceneSyncRequests = new Set();
let lastFrameAt = 0;
let activeBaseId = "";
let cleanToolWheelIndex = 0;
let cleanToolWheelLastAt = 0;
let cleanToolWheelObserver = null;
const TOOL_STORAGE_RING_VISIBLE_LIMIT = 5;
const TOOL_STORAGE_RING_SCROLL_INTERVAL = 120;
const toolStorageRingOffsets = { equipment: 0, seed: 0 };
const toolStorageRingLastAt = { equipment: 0, seed: 0 };
const cleanToolPreviews = new Map();
let navigationMode = "pan";
let worldBounds = new THREE.Box3();
let worldCenter = new THREE.Vector3();
let undergroundCity = null;
let undergroundCitySignature = "";
let undergroundCityAnimation = null;
let undergroundCityStats = { buildings: 0, windows: 0, neon: 0, movers: 0, drawGroups: 0, tiers: 0 };
let interactables = [];
let floorTargets = [];
let equipmentTargets = [];
let baseLayouts = new Map();
const radioEmitterObjects = new Map();
const radioEmitterWorldPosition = new THREE.Vector3();
const radioCameraRight = new THREE.Vector3();
let lastRadioSpatialUpdateAt = 0;
let animatedObjects = [];
let transientEffects = [];
let plantVisualStates = new Map();
let plantAnchors = new Map();
let pendingPlantTransitions = [];
let plantVisualStateInitialized = false;
let hoveredHit = null;
let pointerAction = null;
let contextMenuSuppressedUntil = 0;
let equipmentDragVisual = null;
let dragCoverageVisual = null;
let seedDrag = null;
let stockEquipmentDrag = null;
let cleanToolDrag = null;
let officialPlantTutorialPhase = "idle";
let officialPlantTutorialLayer = null;
let officialPlantTutorialAnimation = null;
let officialSeedHoverHint = null;
const textureAlphaMaskCache = new WeakMap();
const activePointers = new Map();
let gestureState = null;
let waterDropletTexture = null;
let waterSheetTexture = null;
let dustParticleTexture = null;
let brushStreakTexture = null;

const cameraState = {
  target: new THREE.Vector3(), targetGoal: new THREE.Vector3(),
  yaw: INITIAL_CAMERA_YAW, yawGoal: INITIAL_CAMERA_YAW,
  pitch: INITIAL_CAMERA_PITCH, pitchGoal: INITIAL_CAMERA_PITCH,
  distance: 14, distanceGoal: 14
};

const bridge = () => window.farm3dBridge;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const isOfficialPlantTutorial = () => document.body.classList.contains("official-demo-mode");

function officialPlantCount(next = snapshot) {
  return (next?.bases || []).reduce((total, base) => total + (base.shelves || []).reduce((baseTotal, unit) => (
    baseTotal + (unit.slots || []).filter(Boolean).length
  ), 0), 0);
}

function setOfficialPlantTutorialPhase(phase) {
  officialPlantTutorialPhase = phase;
  document.body.classList.remove(
    "official-plant-tutorial-waiting",
    "official-plant-tutorial-demo",
    "official-plant-tutorial-ready"
  );
  if (phase !== "complete" && phase !== "idle") document.body.classList.add(`official-plant-tutorial-${phase}`);
  document.body.dataset.officialPlantTutorial = phase;
}

function clearOfficialPlantTutorialLayer() {
  officialPlantTutorialAnimation?.cancel();
  officialPlantTutorialAnimation = null;
  officialPlantTutorialLayer?.remove();
  officialPlantTutorialLayer = null;
  if (canvas) delete canvas.dataset.officialPlantTutorialTarget;
}

function hideOfficialSeedHoverHint() {
  officialSeedHoverHint?.remove();
  officialSeedHoverHint = null;
}

function updateOfficialSeedHoverHint(event) {
  const seed = event.pointerType === "touch"
    ? null
    : event.target.closest?.('[data-toolbox-seed-list] .seed-option[data-drag-crop="lettuce"]');
  if (!isOfficialPlantTutorial() || officialPlantTutorialPhase === "complete" || seedDrag || !seed) {
    hideOfficialSeedHoverHint();
    return;
  }
  if (!officialSeedHoverHint) {
    officialSeedHoverHint = document.createElement("div");
    officialSeedHoverHint.className = "official-seed-hover-hint";
    officialSeedHoverHint.textContent = "ドラッグ！";
    officialSeedHoverHint.setAttribute("aria-hidden", "true");
    document.body.appendChild(officialSeedHoverHint);
  }
  officialSeedHoverHint.style.left = `${event.clientX + 17}px`;
  officialSeedHoverHint.style.top = `${event.clientY - 30}px`;
}

function stopOfficialPlantTutorialDemo() {
  if (!isOfficialPlantTutorial() || officialPlantTutorialPhase === "complete") return;
  clearOfficialPlantTutorialLayer();
  setOfficialPlantTutorialPhase("ready");
}

function completeOfficialPlantTutorial() {
  if (!isOfficialPlantTutorial()) return;
  hideOfficialSeedHoverHint();
  clearOfficialPlantTutorialLayer();
  setOfficialPlantTutorialPhase("complete");
}

function syncOfficialPlantTutorial(next = snapshot) {
  if (!isOfficialPlantTutorial()) return;
  if (officialPlantCount(next) > 0) {
    completeOfficialPlantTutorial();
    return;
  }
  if (officialPlantTutorialPhase === "idle") setOfficialPlantTutorialPhase("waiting");
}

function officialFrontPodScreenTarget() {
  if (!canvas || !camera || !snapshot) return null;
  const base = snapshot.bases.find((entry) => entry.id === snapshot.activeBaseId) || snapshot.bases[0];
  if (!base) return null;
  const rect = canvas.getBoundingClientRect();
  return (base.shelves || [])
    .filter((unit) => unit.type === "pod" && unit.placed && unit.slots?.some((plant) => !plant))
    .map((unit) => {
      const point = worldPositionForGrid(base.id, unit.x, unit.y, FLOOR_HEIGHT + 0.66);
      point.project(camera);
      return {
        unit,
        clientX: rect.left + (point.x * 0.5 + 0.5) * rect.width,
        clientY: rect.top + (-point.y * 0.5 + 0.5) * rect.height
      };
    })
    .sort((left, right) => right.clientY - left.clientY)[0] || null;
}

function startOfficialPlantTutorial(seedButton) {
  if (!isOfficialPlantTutorial() || !["waiting", "ready"].includes(officialPlantTutorialPhase)) return false;
  const target = officialFrontPodScreenTarget();
  if (!target) return false;
  hideOfficialSeedHoverHint();
  clearOfficialPlantTutorialLayer();
  setOfficialPlantTutorialPhase("demo");

  const seedRect = seedButton.getBoundingClientRect();
  const startX = seedRect.left + seedRect.width / 2;
  const startY = seedRect.top + seedRect.height / 2;
  const endX = target.clientX;
  const endY = target.clientY;
  const layer = document.createElement("div");
  layer.className = "official-plant-tutorial-layer";
  layer.dataset.targetUnitId = target.unit.id;
  layer.setAttribute("aria-hidden", "true");

  const targetBeacon = document.createElement("div");
  targetBeacon.className = "official-plant-tutorial-target";
  targetBeacon.style.left = `${endX}px`;
  targetBeacon.style.top = `${endY}px`;
  targetBeacon.innerHTML = "<i></i><span>DROP HERE</span>";

  const dragDemo = document.createElement("div");
  dragDemo.className = "official-plant-tutorial-drag";
  dragDemo.style.left = `${startX}px`;
  dragDemo.style.top = `${startY}px`;
  dragDemo.innerHTML = '<span class="official-plant-tutorial-mouse"><i></i></span>';
  const seedIcon = seedButton.querySelector(".seed-glyph img")?.cloneNode(true) || document.createElement("img");
  seedIcon.className = "official-plant-tutorial-seed";
  seedIcon.alt = "";
  dragDemo.appendChild(seedIcon);
  layer.append(targetBeacon, dragDemo);
  document.body.appendChild(layer);
  officialPlantTutorialLayer = layer;
  if (canvas) canvas.dataset.officialPlantTutorialTarget = target.unit.id;

  const duration = 2700;
  officialPlantTutorialAnimation = dragDemo.animate([
    { left: `${startX}px`, top: `${startY}px`, opacity: 0, transform: "translate(-50%, -50%) scale(.72)" },
    { offset: .12, left: `${startX}px`, top: `${startY}px`, opacity: .72, transform: "translate(-50%, -50%) scale(1)" },
    { offset: .26, left: `${startX}px`, top: `${startY}px`, opacity: .72, transform: "translate(-50%, -50%) scale(1)" },
    { offset: .8, left: `${endX}px`, top: `${endY - 18}px`, opacity: .72, transform: "translate(-50%, -50%) scale(1)" },
    { offset: .9, left: `${endX}px`, top: `${endY}px`, opacity: .78, transform: "translate(-50%, -50%) scale(.88)" },
    { left: `${endX}px`, top: `${endY}px`, opacity: 0, transform: "translate(-50%, -50%) scale(.62)" }
  ], { duration, easing: "cubic-bezier(.32,.02,.2,1)", iterations: Infinity });
  return true;
}

const normalizeQuarterTurn = (value) => {
  const turn = Math.trunc(Number(value) || 0);
  return ((turn % 4) + 4) % 4;
};
const quarterTurnYaw = (value) => normalizeQuarterTurn(value) * Math.PI / 2;
const rotatedFootprint = (baseWidth, baseHeight, rotationQuarter) => (
  normalizeQuarterTurn(rotationQuarter) % 2
    ? { width: baseHeight, height: baseWidth }
    : { width: baseWidth, height: baseHeight }
);
const robotVisualStates = new Map();
const ROBOT_MOTION_SECONDS = Object.freeze({ work: 1.1, joy: 1.3 });
const ROBOT_MOTION_HANDLERS = Object.freeze({
  idle(parts, time) {
    const { torso, radius } = parts;
    torso.position.y = parts.rest.get(torso).y + Math.sin(time * 1.9) * radius * 0.045;
    parts.arms.forEach((arm, index) => {
      arm.rotation.x = Math.sin(time * 1.5 + index * Math.PI) * 0.07;
    });
    parts.eyes.forEach((eye) => { eye.scale.y = 1; });
  },
  move(parts, time) {
    const { torso, radius } = parts;
    const stride = time * 11;
    torso.position.y = parts.rest.get(torso).y + Math.abs(Math.sin(stride)) * radius * 0.13;
    torso.rotation.x = 0.1;
    parts.legs.forEach((leg, index) => {
      const swing = Math.sin(stride + index * Math.PI);
      leg.position.z = parts.rest.get(leg).z + swing * radius * 0.3;
      leg.position.y = parts.rest.get(leg).y + Math.max(0, Math.cos(stride + index * Math.PI)) * radius * 0.1;
    });
    parts.arms.forEach((arm, index) => {
      arm.rotation.x = Math.sin(stride + index * Math.PI) * 0.5;
    });
  },
  work(parts, time) {
    const { torso, radius } = parts;
    const beat = Math.sin(time * 7);
    torso.rotation.x = 0.24;
    torso.position.y = parts.rest.get(torso).y - radius * 0.06;
    parts.arms.forEach((arm, index) => {
      arm.rotation.x = -0.9 + beat * 0.45 * (index ? 1 : -1);
      arm.position.z = parts.rest.get(arm).z + radius * 0.2;
    });
    parts.eyes.forEach((eye) => { eye.scale.y = 0.55; });
  },
  joy(parts, time) {
    const { torso, radius } = parts;
    const hop = Math.abs(Math.sin(time * 6.4));
    torso.position.y = parts.rest.get(torso).y + hop * radius * 0.34;
    parts.legs.forEach((leg) => { leg.position.y = parts.rest.get(leg).y + hop * radius * 0.34; });
    parts.arms.forEach((arm, index) => {
      arm.rotation.x = -2.1;
      arm.position.y = parts.rest.get(arm).y + hop * radius * 0.34;
      arm.rotation.z = (index ? -1 : 1) * 0.35;
    });
    parts.eyes.forEach((eye) => { eye.scale.y = 1.25; });
  }
});

function applyRobotMotion(model, motion, time) {
  const parts = model.userData.parts;
  const rest = model.userData.rest;
  if (!parts || !rest) return;
  rest.forEach((position, child) => {
    child.position.copy(position);
    child.rotation.set(0, 0, 0);
    child.scale.set(1, 1, 1);
  });
  parts.torso.scale.set(1, 0.94, 0.92);
  const handler = ROBOT_MOTION_HANDLERS[motion] || ROBOT_MOTION_HANDLERS.idle;
  handler({ ...parts, rest }, Math.max(0, time));
}

function robotStateKey(baseId, itemId) {
  return String(baseId || "") + ":" + String(itemId || "");
}

function robotStateFor(entry, elapsed) {
  const key = robotStateKey(entry.baseId, entry.itemId);
  let state = robotVisualStates.get(key);
  const standX = Number.isFinite(Number(entry.item.supportStandX)) ? Number(entry.item.supportStandX) : entry.homeX;
  const standY = Number.isFinite(Number(entry.item.supportStandY)) ? Number(entry.item.supportStandY) : entry.homeY;
  if (!state) {
    state = {
      x: standX,
      y: standY,
      facing: Math.PI / 4,
      facingGoal: Math.PI / 4,
      serial: Number(entry.item.supportActionSerial) || 0,
      motion: "idle",
      motionSince: elapsed,
      workUntil: 0,
      joyUntil: 0,
      targetX: null,
      targetY: null
    };
    robotVisualStates.set(key, state);
  }
  entry.visualState = state;
  return state;
}

function setRobotMotion(state, motion, elapsed) {
  if (state.motion === motion) return;
  state.motion = motion;
  state.motionSince = elapsed;
}

function updateRobotAnimation(entry, elapsed) {
  const item = entry.item;
  const state = robotStateFor(entry, elapsed);
  if (entry.dragSuspended) {
    entry.lastAnimatedAt = elapsed;
    entry.object.position.set(0, entry.baseY, 0);
    entry.object.rotation.y = Math.PI / 4;
    if (entry.shadow) {
      entry.shadow.position.x = 0;
      entry.shadow.position.z = 0;
    }
    applyRobotMotion(entry.object, "idle", 0);
    return;
  }
  const standX = Number.isFinite(Number(item.supportStandX)) ? Number(item.supportStandX) : entry.homeX;
  const standY = Number.isFinite(Number(item.supportStandY)) ? Number(item.supportStandY) : entry.homeY;
  const serial = Number(item.supportActionSerial) || 0;

  if (serial !== state.serial) {
    state.serial = serial;
    state.x = standX;
    state.y = standY;
    const targetX = item.supportLastTargetX == null ? Number.NaN : Number(item.supportLastTargetX);
    const targetY = item.supportLastTargetY == null ? Number.NaN : Number(item.supportLastTargetY);
    if (Number.isFinite(targetX) && Number.isFinite(targetY)
      && Math.hypot(targetX - state.x, targetY - state.y) > 0.05) {
      state.facingGoal = Math.atan2(targetY - state.y, targetX - state.x);
    }
    state.workUntil = elapsed + ROBOT_MOTION_SECONDS.work;
    state.joyUntil = ["harvest", "ship"].includes(item.supportLastActionTask)
      ? state.workUntil + ROBOT_MOTION_SECONDS.joy
      : 0;
    state.motionSince = elapsed;
  }

  const previousX = state.x;
  const previousY = state.y;
  const travel = item.supportTravel;
  let goalX = standX;
  let goalY = standY;
  let motion = "idle";

  if (travel && Number(travel.total) > 0 && Number(travel.remaining) > 0) {
    const progress = clamp(1 - Number(travel.remaining) / Number(travel.total), 0, 1);
    goalX = Number(travel.fromX) + (Number(travel.targetX) - Number(travel.fromX)) * progress;
    goalY = Number(travel.fromY) + (Number(travel.targetY) - Number(travel.fromY)) * progress;
    state.targetX = Number(travel.targetX);
    state.targetY = Number(travel.targetY);
    motion = "move";
  } else if (elapsed < state.workUntil) {
    motion = "work";
  } else if (elapsed < state.joyUntil) {
    motion = "joy";
  } else if (Math.hypot(goalX - state.x, goalY - state.y) > 0.035) {
    motion = "move";
  }

  const delta = Math.min(0.05, Math.max(0.001, elapsed - (entry.lastAnimatedAt || elapsed - 0.016)));
  entry.lastAnimatedAt = elapsed;
  const smoothing = 1 - Math.exp(-delta * 13);
  state.x += (goalX - state.x) * smoothing;
  state.y += (goalY - state.y) * smoothing;
  if (Math.hypot(goalX - state.x, goalY - state.y) < 0.015) {
    state.x = goalX;
    state.y = goalY;
  }

  const movedX = state.x - previousX;
  const movedY = state.y - previousY;
  if (motion === "move" && Math.hypot(movedX, movedY) > 0.0015) {
    state.facingGoal = Math.atan2(movedY, movedX);
  }
  let turn = state.facingGoal - state.facing;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  state.facing += turn * (1 - Math.exp(-delta * 9));
  state.facing = Math.atan2(Math.sin(state.facing), Math.cos(state.facing));

  setRobotMotion(state, motion, elapsed);
  const offsetX = state.y - entry.homeY;
  const offsetZ = state.x - entry.homeX;
  entry.object.position.set(offsetX, entry.baseY, offsetZ);
  entry.object.rotation.y = state.facing;
  if (entry.shadow) {
    entry.shadow.position.x = offsetX;
    entry.shadow.position.z = offsetZ;
  }
  applyRobotMotion(entry.object, state.motion, elapsed - state.motionSince);
}

function refreshDynamicRobotSnapshots(next) {
  const robots = new Map();
  next?.bases?.forEach((base) => {
    base.floorDevices
      .filter((item) => item.type === "support_robot")
      .forEach((item) => robots.set(robotStateKey(base.id, item.id), item));
  });
  animatedObjects.filter((entry) => entry.type === "robot").forEach((entry) => {
    const item = robots.get(robotStateKey(entry.baseId, entry.itemId));
    if (!item) return;
    entry.item = item;
    if (entry.interaction) {
      entry.interaction.item = item;
      entry.interaction.label = item.robotName || item.name;
    }
  });
  [...robotVisualStates.keys()].forEach((key) => {
    if (!robots.has(key)) robotVisualStates.delete(key);
  });
}
function colorNumber(value, fallback = 0x72ffb8) {
  if (typeof value === "number") return value;
  const parsed = Number.parseInt(String(value || "").replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function plantSlotKey(baseId, unitId, slotIndex) {
  return [baseId, unitId, slotIndex].join(":");
}
function capturePlantVisualTransitions(next) {
  const nextStates = new Map();
  next?.bases?.forEach((base) => {
    base.shelves.forEach((unit) => unit.slots.forEach((plant, slotIndex) => {
      if (!plant) return;
      const key = plantSlotKey(base.id, unit.id, slotIndex);
      nextStates.set(key, {
        plantId: plant.id,
        stage: Number(plant.stage) || 0,
        ready: Boolean(plant.ready),
        dead: Boolean(plant.dead),
        color: plant.color
      });
    }));
  });
  if (plantVisualStateInitialized) {
    nextStates.forEach((current, key) => {
      const previous = plantVisualStates.get(key);
      if (!previous || previous.plantId !== current.plantId || current.dead) return;
      if (current.ready && !previous.ready) {
        pendingPlantTransitions.push({ type: "ready", key, color: current.color });
      } else if (current.stage > previous.stage) {
        pendingPlantTransitions.push({ type: "growth", key, color: current.color });
      }
    });
  }
  plantVisualStates = nextStates;
  plantVisualStateInitialized = true;
}
function disposeMaterial(material) {
  (Array.isArray(material) ? material : [material]).forEach((entry) => entry?.dispose?.());
}
function setExpansionHover(object = null) {
  if (hoveredExpansionObject === object) return;
  if (hoveredExpansionObject) hoveredExpansionObject.userData.farm3dHovered = false;
  hoveredExpansionObject = object || null;
  if (hoveredExpansionObject) hoveredExpansionObject.userData.farm3dHovered = true;
}
function hideHover() {
  if (hoverOutline) hoverOutline.visible = false;
  if (hoverLabel) {
    hoverLabel.classList.remove("visible");
    hoverLabel.removeAttribute("data-hover-type");
  }
  setExpansionHover(null);
  hoveredHit = null;
  clearDragCoverage();
  if (canvas) delete canvas.dataset.farm3dStoreDrop;
}
function clearWorld() {
  clearDragCoverage();
  equipmentDragVisual = null;
  if (canvas) {
    delete canvas.dataset.farm3dObjectDrag;
    delete canvas.dataset.farm3dDragRotation;
  }
  if (world) {
    const geometries = new Set();
    const materials = new Set();
    world.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean).forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach(disposeMaterial);
    scene.remove(world);
  }
  world = new THREE.Group();
  scene.add(world);
  interactables = [];
  floorTargets = [];
  equipmentTargets = [];
  baseLayouts = new Map();
  radioEmitterObjects.clear();
  animatedObjects = [];
  plantAnchors = new Map();
  hideHover();
}
function createSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
function disposeSceneGroup(group) {
  if (!group) return;
  const geometries = new Set();
  const materials = new Set();
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material])
      .filter(Boolean)
      .forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach(disposeMaterial);
}
function clearUndergroundCity() {
  if (undergroundCity) {
    disposeSceneGroup(undergroundCity);
    scene?.remove(undergroundCity);
  }
  undergroundCity = null;
  undergroundCityAnimation = null;
  undergroundCityStats = { buildings: 0, windows: 0, neon: 0, movers: 0, drawGroups: 0, tiers: 0 };
}
function addCityPointCloud(group, source, index, lowSpec) {
  if (!source.positions.length) return null;
  const count = source.positions.length / 3;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.42,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const points = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let pointIndex = 0; pointIndex < count; pointIndex += 1) {
    dummy.position.set(
      source.positions[pointIndex * 3],
      source.positions[pointIndex * 3 + 1],
      source.positions[pointIndex * 3 + 2]
    );
    dummy.rotation.set(0, source.rotations[pointIndex], 0);
    dummy.scale.set(source.sizes[pointIndex * 2], source.sizes[pointIndex * 2 + 1], 1);
    dummy.updateMatrix();
    points.setMatrixAt(pointIndex, dummy.matrix);
    color.setRGB(
      source.colors[pointIndex * 3],
      source.colors[pointIndex * 3 + 1],
      source.colors[pointIndex * 3 + 2]
    );
    points.setColorAt(pointIndex, color);
  }
  points.instanceMatrix.needsUpdate = true;
  if (points.instanceColor) points.instanceColor.needsUpdate = true;
  points.frustumCulled = false;
  points.name = `underground-city-windows-${index + 1}`;
  points.renderOrder = -28;
  group.add(points);
  return points;
}
function createCityEdgeSlots(config, random) {
  const slots = [];
  const sides = new Set(config.sides || ["back-z", "front-z", "back-x", "front-x"]);
  const addSlot = (slot) => {
    if (random() <= config.density) slots.push(slot);
  };
  const xInset = Math.max(2.2, config.spacing * 0.58);
  for (let x = -config.halfX + xInset; x <= config.halfX - xInset; x += config.spacing) {
    const snappedX = Math.round(x * 2) / 2;
    if (sides.has("back-z")) addSlot({ side: "back-z", x: snappedX, z: -config.halfZ, rotationY: 0, windowRotationY: 0, tangentX: 1, tangentZ: 0, inwardX: 0, inwardZ: 1 });
    if (sides.has("front-z")) addSlot({ side: "front-z", x: snappedX, z: config.halfZ, rotationY: 0, windowRotationY: 0, tangentX: 1, tangentZ: 0, inwardX: 0, inwardZ: -1 });
  }
  const zInset = Math.max(2.2, config.spacing * 0.58);
  for (let z = -config.halfZ + zInset; z <= config.halfZ - zInset; z += config.spacing) {
    const snappedZ = Math.round(z * 2) / 2;
    if (sides.has("back-x")) addSlot({ side: "back-x", x: -config.halfX, z: snappedZ, rotationY: Math.PI * 0.5, windowRotationY: Math.PI * 0.5, tangentX: 0, tangentZ: 1, inwardX: 1, inwardZ: 0 });
    if (sides.has("front-x")) addSlot({ side: "front-x", x: config.halfX, z: snappedZ, rotationY: Math.PI * 0.5, windowRotationY: Math.PI * 0.5, tangentX: 0, tangentZ: 1, inwardX: -1, inwardZ: 0 });
  }
  return slots;
}
function pushCityBackdropOutline(vertices, halfX, halfZ, y) {
  vertices.push(
    -halfX, y, -halfZ, halfX, y, -halfZ
  );
}
function setCityRoutePosition(attribute, index, route, elapsed) {
  const width = route.halfX * 2;
  const depth = route.halfZ * 2;
  const perimeter = (width + depth) * 2;
  let distance = (route.phase + elapsed * route.speed) % perimeter;
  let x;
  let z;
  if (distance < width) {
    x = -route.halfX + distance;
    z = -route.halfZ;
  } else if ((distance -= width) < depth) {
    x = route.halfX;
    z = -route.halfZ + distance;
  } else if ((distance -= depth) < width) {
    x = route.halfX - distance;
    z = route.halfZ;
  } else {
    distance -= width;
    x = -route.halfX;
    z = route.halfZ - distance;
  }
  attribute.setXYZ(index, x, route.y, z);
}
function buildUndergroundCityBackdrop() {
  if (!scene || worldBounds.isEmpty()) return;
  const size = worldBounds.getSize(new THREE.Vector3());
  const lowSpec = Boolean(snapshot?.lowSpec);
  const signature = [
    lowSpec ? 1 : 0,
    snapshot?.bases?.length || 0,
    Math.round(worldCenter.x * 10),
    Math.round(worldCenter.z * 10),
    Math.round(size.x * 10),
    Math.round(size.z * 10)
  ].join(":");
  if (undergroundCity && undergroundCitySignature === signature) return;

  clearUndergroundCity();
  undergroundCitySignature = signature;
  const random = createSeededRandom(0x55474349 ^ Math.round(size.x * 97) ^ Math.round(size.z * 193));
  const group = new THREE.Group();
  group.name = "underground-city-backdrop";
  group.position.set(worldCenter.x, 0, worldCenter.z);
  group.userData.farm3dBackdrop = true;
  scene.add(group);
  undergroundCity = group;

  const baseHalfX = Math.max(18, size.x * 0.5 + 14);
  const baseHalfZ = Math.max(16, size.z * 0.5 + 12);
  const tierConfigs = [];
  const windowGroups = Array.from({ length: lowSpec ? 2 : 3 }, () => ({
    positions: [], colors: [], rotations: [], sizes: []
  }));
  const windowPalette = [
    new THREE.Color(0x66ffd0),
    new THREE.Color(0x32cfd1),
    new THREE.Color(0x9dffe4),
    new THREE.Color(0xd7b75a)
  ];
  const cityNeonEnabled = false;
  const neonPalette = [
    ...windowPalette,
    new THREE.Color(0xff4fb8),
    new THREE.Color(0x7f79ff),
    new THREE.Color(0xffa63d)
  ];
  const signPalette = [
    ...neonPalette,
    new THREE.Color(0xe76555),
    new THREE.Color(0x92df5b)
  ];
  const dummy = new THREE.Object3D();
  let buildingCount = 0;
  const addCityBoxInstances = (name, transforms, color, renderOrder) => {
    if (!transforms.length) return null;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color, fog: true });
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    mesh.name = name;
    mesh.renderOrder = renderOrder;
    mesh.frustumCulled = false;
    transforms.forEach((transform, index) => {
      dummy.position.set(transform.x, transform.y, transform.z);
      dummy.rotation.set(0, transform.rotationY || 0, 0);
      dummy.scale.set(transform.width, transform.height, transform.depth);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    return mesh;
  };

  tierConfigs.forEach((tier, tierIndex) => {
    const slots = createCityEdgeSlots(tier, random);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: tier.color, fog: true });
    const buildings = new THREE.InstancedMesh(geometry, material, slots.length);
    buildings.name = `underground-city-tier-${tierIndex + 1}`;
    buildings.renderOrder = -40 + tierIndex;
    buildings.frustumCulled = false;
    slots.forEach((slot, index) => {
      const height = tier.minHeight + random() * (tier.maxHeight - tier.minHeight);
      const width = Math.min(2.55, 0.95 + random() * 1.55);
      const depth = 0.95 + random() * 1.05;
      dummy.position.set(slot.x, tier.baseY + height * 0.5, slot.z);
      dummy.rotation.set(0, slot.rotationY, 0);
      dummy.scale.set(width, height, depth);
      dummy.updateMatrix();
      buildings.setMatrixAt(index, dummy.matrix);
      buildingCount += 1;

      const rows = lowSpec ? 2 : clamp(Math.floor(height / 4.2), 2, 6);
      const columns = lowSpec ? 1 : (random() > 0.48 ? 2 : 1);
      const facadeX = slot.x + slot.inwardX * (depth * 0.5 + 0.18);
      const facadeZ = slot.z + slot.inwardZ * (depth * 0.5 + 0.18);
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          if (random() < (lowSpec ? 0.32 : 0.18)) continue;
          const lateral = columns === 1 ? 0 : (column - (columns - 1) * 0.5) * width * 0.48;
          const pointGroup = windowGroups[Math.floor(random() * windowGroups.length)];
          pointGroup.positions.push(
            facadeX + slot.tangentX * lateral,
            tier.baseY + height * (0.34 + 0.62 * ((row + 1) / (rows + 1))) + (random() - 0.5) * 0.16,
            facadeZ + slot.tangentZ * lateral
          );
          const color = windowPalette[random() < 0.08 ? 3 : Math.floor(random() * 3)];
          pointGroup.colors.push(color.r, color.g, color.b);
          pointGroup.rotations.push(slot.windowRotationY);
          pointGroup.sizes.push(
            lowSpec ? 0.45 : 0.38 + random() * 0.22,
            lowSpec ? 0.14 : 0.12 + random() * 0.06
          );
        }
      }
    });
    buildings.instanceMatrix.needsUpdate = true;
    group.add(buildings);
  });

  const underHalfX = Math.max(30, size.x * 0.5 + 26);
  const underHalfZ = Math.max(28, size.z * 0.5 + 24);
  const undercityLayers = lowSpec
    ? [
        { topY: -4.5, spacing: 4.6, density: 0.58, minHeight: 3.2, maxHeight: 7.2, color: 0x040d0a, expand: 0, roadX: 7, roadZ: 8 },
        { topY: -16, spacing: 8, density: 0.36, minHeight: 8, maxHeight: 16, color: 0x030907, expand: 24, roadX: 7, roadZ: 8 },
        { topY: -35, spacing: 13, density: 0.22, minHeight: 14, maxHeight: 26, color: 0x020604, expand: 50, roadX: 6, roadZ: 7 }
      ]
    : [
        { topY: -3.2, spacing: 3.2, density: 0.68, minHeight: 3.8, maxHeight: 9, color: 0x05120e, expand: 0, roadX: 8, roadZ: 7 },
        { topY: -12, spacing: 5.2, density: 0.5, minHeight: 7.5, maxHeight: 15, color: 0x040d0a, expand: 18, roadX: 8, roadZ: 9 },
        { topY: -27, spacing: 8.5, density: 0.36, minHeight: 13, maxHeight: 25, color: 0x030806, expand: 42, roadX: 7, roadZ: 8 },
        { topY: -49, spacing: 14, density: 0.22, minHeight: 20, maxHeight: 38, color: 0x020504, expand: 68, roadX: 6, roadZ: 7 }
      ];
  const roofLightTransforms = [];
  const annexTransforms = [];
  const bridgeTransforms = [];
  const signTransforms = [];
  const blocksByLayer = [];
  undercityLayers.forEach((layer, layerIndex) => {
    const blocks = [];
    const layerHalfX = underHalfX + layer.expand;
    const layerHalfZ = underHalfZ + layer.expand;
    let gridX = 0;
    for (let x = -layerHalfX; x <= layerHalfX; x += layer.spacing, gridX += 1) {
      let gridZ = 0;
      for (let z = -layerHalfZ; z <= layerHalfZ; z += layer.spacing, gridZ += 1) {
        const roadCell = gridX % layer.roadX === 0 || gridZ % layer.roadZ === 0;
        if ((roadCell && random() < 0.88) || random() > layer.density) continue;
        const width = layer.spacing * (0.58 + random() * 0.28);
        const depth = layer.spacing * (0.58 + random() * 0.28);
        const height = layer.minHeight + random() * (layer.maxHeight - layer.minHeight);
        const blockTopY = layer.topY - random() * (lowSpec ? 0.6 : 1.1) * (layerIndex + 1);
        const block = {
          x: Math.round(x * 2) / 2,
          y: blockTopY - height * 0.5,
          z: Math.round(z * 2) / 2,
          width,
          height,
          depth,
          topY: blockTopY,
          gridX,
          gridZ
        };
        blocks.push(block);
        if (cityNeonEnabled && random() < (layerIndex === 0 ? 0.72 : 0.42 - layerIndex * 0.08)) {
          roofLightTransforms.push({
            x: block.x + (random() - 0.5) * width * 0.35,
            y: block.topY + 0.035,
            z: block.z + (random() - 0.5) * depth * 0.35,
            width: 0.48 + random() * 0.9,
            depth: 0.1 + random() * 0.14,
            color: neonPalette[Math.floor(random() * neonPalette.length)]
          });
        }
        if (random() < (lowSpec ? 0.44 : 0.78 - layerIndex * 0.12)) {
          const windowRows = lowSpec ? 1 : clamp(Math.floor(height / 3.6), 1, 4);
          const faceX = random() > 0.5;
          for (let row = 0; row < windowRows; row += 1) {
            if (random() < (lowSpec ? 0.28 : 0.18)) continue;
            const pointGroup = windowGroups[(gridX + gridZ + row) % windowGroups.length];
            pointGroup.positions.push(
              faceX ? block.x + width * 0.505 : block.x + (random() - 0.5) * width * 0.58,
              block.topY - height * (0.18 + 0.66 * ((row + 1) / (windowRows + 1))),
              faceX ? block.z + (random() - 0.5) * depth * 0.58 : block.z + depth * 0.505
            );
            const color = windowPalette[random() < 0.12 ? 3 : Math.floor(random() * 3)];
            pointGroup.colors.push(color.r, color.g, color.b);
            pointGroup.rotations.push(faceX ? Math.PI * 0.5 : 0);
            pointGroup.sizes.push(
              lowSpec ? 0.32 : 0.22 + random() * 0.22,
              lowSpec ? 0.1 : 0.08 + random() * 0.08
            );
          }
        }
        if (random() < (lowSpec ? 0.12 : 0.38 - layerIndex * 0.09)) {
          const face = Math.floor(random() * 4);
          const annexHeight = 0.7 + random() * Math.min(2.2, height * 0.3);
          const annexWidth = width * (0.34 + random() * 0.28);
          const annexDepth = depth * (0.34 + random() * 0.28);
          annexTransforms.push({
            x: block.x + (face === 2 ? -(width + annexWidth) * 0.48 : face === 3 ? (width + annexWidth) * 0.48 : 0),
            y: block.topY - height * (0.2 + random() * 0.48),
            z: block.z + (face === 0 ? -(depth + annexDepth) * 0.48 : face === 1 ? (depth + annexDepth) * 0.48 : 0),
            width: face < 2 ? annexWidth : annexDepth,
            height: annexHeight,
            depth: face < 2 ? annexDepth : annexWidth
          });
        }
        if (cityNeonEnabled && random() < (lowSpec ? 0.12 : 0.5 - layerIndex * 0.11)) {
          const face = Math.floor(random() * 4);
          const signHeight = 0.7 + random() * Math.min(2.2, height * 0.35);
          const signWidth = 0.24 + random() * 0.38;
          signTransforms.push({
            x: block.x + (face === 2 ? -width * 0.505 : face === 3 ? width * 0.505 : (random() - 0.5) * width * 0.45),
            y: block.topY - signHeight * 0.5 - random() * height * 0.45,
            z: block.z + (face === 0 ? -depth * 0.505 : face === 1 ? depth * 0.505 : (random() - 0.5) * depth * 0.45),
            rotationY: face < 2 ? 0 : Math.PI * 0.5,
            width: signWidth,
            height: signHeight,
            color: signPalette[Math.floor(random() * signPalette.length)]
          });
        }
      }
    }
    const blockMap = new Map(blocks.map((block) => [`${block.gridX}:${block.gridZ}`, block]));
    blocks.forEach((block) => {
      const right = blockMap.get(`${block.gridX + 1}:${block.gridZ}`);
      const down = blockMap.get(`${block.gridX}:${block.gridZ + 1}`);
      if (right && random() < (lowSpec ? 0.08 : 0.2)) {
        const gap = Math.abs(right.x - block.x) - (right.width + block.width) * 0.5;
        if (gap > 0.28) bridgeTransforms.push({
          x: (block.x + right.x) * 0.5,
          y: layer.topY - Math.min(block.height, right.height) * (0.18 + random() * 0.2),
          z: (block.z + right.z) * 0.5,
          width: gap + 0.34,
          height: 0.2 + random() * 0.18,
          depth: 0.42 + random() * 0.32
        });
      }
      if (down && random() < (lowSpec ? 0.08 : 0.2)) {
        const gap = Math.abs(down.z - block.z) - (down.depth + block.depth) * 0.5;
        if (gap > 0.28) bridgeTransforms.push({
          x: (block.x + down.x) * 0.5,
          y: layer.topY - Math.min(block.height, down.height) * (0.18 + random() * 0.2),
          z: (block.z + down.z) * 0.5,
          width: 0.42 + random() * 0.32,
          height: 0.2 + random() * 0.18,
          depth: gap + 0.34
        });
      }
    });
    addCityBoxInstances(`underground-city-underlay-${layerIndex + 1}`, blocks, layer.color, -38 + layerIndex);
    buildingCount += blocks.length;
    blocksByLayer.push({ layer, blocks, halfX: layerHalfX, halfZ: layerHalfZ });

    if (cityNeonEnabled) {
      const arteryCount = lowSpec ? (layerIndex === 0 ? 2 : 1) : Math.max(2, 4 - layerIndex);
      for (let arteryIndex = 0; arteryIndex < arteryCount; arteryIndex += 1) {
        const horizontal = (arteryIndex + layerIndex) % 2 === 0;
        const alongHalf = horizontal ? layerHalfX : layerHalfZ;
        const crossHalf = horizontal ? layerHalfZ : layerHalfX;
        const fixed = (random() - 0.5) * crossHalf * 1.55;
        const step = layer.spacing * (1.55 + random() * 0.55);
        for (let cursor = -alongHalf; cursor <= alongHalf; cursor += step) {
          if (random() < (lowSpec ? 0.34 : 0.18)) continue;
          const length = step * (0.22 + random() * 0.3);
          roofLightTransforms.push({
            x: horizontal ? cursor : fixed,
            y: layer.topY + 0.055,
            z: horizontal ? fixed : cursor,
            width: horizontal ? length : 0.08 + random() * 0.08,
            depth: horizontal ? 0.08 + random() * 0.08 : length,
            color: neonPalette[Math.floor(random() * neonPalette.length)]
          });
        }
      }
    }
  });

  const cityHorizonHalfX = underHalfX + (lowSpec ? 48 : 70);
  const cityHorizonHalfZ = underHalfZ + (lowSpec ? 46 : 68);
  const farDistricts = lowSpec
    ? [{ y: -36, halfX: cityHorizonHalfX, halfZ: cityHorizonHalfZ, spacing: 15, density: 0.12 }]
    : [
        { y: -39, halfX: underHalfX + 42, halfZ: underHalfZ + 40, spacing: 11.5, density: 0.18 },
        { y: -58, halfX: cityHorizonHalfX, halfZ: cityHorizonHalfZ, spacing: 16.5, density: 0.11 }
      ];
  if (cityNeonEnabled) farDistricts.forEach((district, districtIndex) => {
    const innerHalfX = underHalfX + (districtIndex ? 34 : 12);
    const innerHalfZ = underHalfZ + (districtIndex ? 32 : 10);
    for (let x = -district.halfX; x <= district.halfX; x += district.spacing) {
      for (let z = -district.halfZ; z <= district.halfZ; z += district.spacing) {
        if (Math.abs(x) < innerHalfX && Math.abs(z) < innerHalfZ) continue;
        if (random() > district.density) continue;
        const horizontal = random() > 0.5;
        roofLightTransforms.push({
          x: x + (random() - 0.5) * district.spacing * 0.55,
          y: district.y + random() * 1.8,
          z: z + (random() - 0.5) * district.spacing * 0.55,
          width: horizontal ? 1.2 + random() * 2.8 : 0.12 + random() * 0.18,
          depth: horizontal ? 0.12 + random() * 0.18 : 1.2 + random() * 2.8,
          color: neonPalette[Math.floor(random() * neonPalette.length)]
        });
      }
    }
  });

  // A single right-side megastructure frames the farm without filling the foreground.
  const backdropBottomY = lowSpec ? -30 : -42;
  const backdropTopY = lowSpec ? 14 : 18;
  const backboneSlotMap = new Map();
  const backboneSpacing = lowSpec ? 4.6 : 2.8;
  const backboneDepthLayers = 0;
  const addBackboneSlot = (slot) => {
    const key = `${slot.side}:${Math.round(slot.x * 2)}:${Math.round(slot.z * 2)}`;
    if (!backboneSlotMap.has(key)) backboneSlotMap.set(key, slot);
  };
  baseLayouts.forEach((layout) => {
    const xStart = layout.offsetX - worldCenter.x - 7.5;
    const xEnd = layout.offsetX - worldCenter.x + layout.rows + 7.5;
    for (let depthLayer = 0; depthLayer < backboneDepthLayers; depthLayer += 1) {
      const backZ = layout.offsetZ - worldCenter.z - 6.2 - depthLayer * (lowSpec ? 5.4 : 4.8);
      const layerSpacing = backboneSpacing * (1 + depthLayer * 0.16);
      for (let x = xStart; x <= xEnd; x += layerSpacing) {
        addBackboneSlot({
          side: "back-z",
          depthLayer,
          x: Math.round(x * 2) / 2,
          z: Math.round(backZ * 2) / 2,
          rotationY: 0,
          windowRotationY: 0,
          tangentX: 1,
          tangentZ: 0,
          inwardX: 0,
          inwardZ: 1
        });
      }
    }
  });
  const backboneSlots = [...backboneSlotMap.values()];
  const backboneTransforms = [];
  backboneSlots.forEach((slot, slotIndex) => {
    const silhouetteLift = !lowSpec && slotIndex % 7 === 0 ? 4 + random() * 5 : 0;
    const bottomY = backdropBottomY - slot.depthLayer * (lowSpec ? 6 : 8) - random() * (lowSpec ? 4 : 7);
    const topY = backdropTopY - slot.depthLayer * 2.2 - random() * (lowSpec ? 6 : 11) + silhouetteLift;
    const height = topY - bottomY;
    const width = (lowSpec ? 2.4 : 1.55) + random() * (lowSpec ? 1.8 : 3.1);
    const depth = (lowSpec ? 2.5 : 2.1) + random() * 1.3;
    backboneTransforms.push({
      x: slot.x,
      y: bottomY + height * 0.5,
      z: slot.z,
      width,
      height,
      depth,
      rotationY: slot.rotationY,
      side: slot.side,
      depthLayer: slot.depthLayer,
      bottomY,
      topY
    });

    if ((!lowSpec && random() < 0.4) || (lowSpec && slot.depthLayer === 0 && random() < 0.16)) {
      const crownHeight = 2.2 + random() * (lowSpec ? 3.5 : 7.5);
      const crownWidth = width * (0.28 + random() * 0.38);
      const crownBottomY = topY - 0.15;
      backboneTransforms.push({
        x: slot.x + (random() - 0.5) * width * 0.36,
        y: crownBottomY + crownHeight * 0.5,
        z: slot.z,
        width: crownWidth,
        height: crownHeight,
        depth: depth * 0.8,
        rotationY: slot.rotationY,
        side: slot.side,
        depthLayer: slot.depthLayer,
        bottomY: crownBottomY,
        topY: crownBottomY + crownHeight
      });
    }

    const facadeX = slot.x + slot.inwardX * (depth * 0.5 + 0.2);
    const facadeZ = slot.z + slot.inwardZ * (depth * 0.5 + 0.2);
    const rowCount = Math.max(3, (lowSpec ? 5 : 10) - slot.depthLayer * 2);
    for (let row = 0; row < rowCount; row += 1) {
      if (random() < (lowSpec ? 0.42 : 0.2) + slot.depthLayer * 0.12) continue;
      const pointGroup = windowGroups[(row + slotIndex) % windowGroups.length];
      const y = bottomY + height * ((row + 1) / (rowCount + 1));
      const columnCount = lowSpec ? 1 : (random() < 0.25 ? 2 : 1);
      for (let column = 0; column < columnCount; column += 1) {
        const lateral = columnCount === 1 ? 0 : (column - 0.5) * width * 0.42;
        pointGroup.positions.push(
          facadeX + slot.tangentX * lateral,
          y,
          facadeZ + slot.tangentZ * lateral
        );
        const color = windowPalette[random() < 0.12 ? 3 : Math.floor(random() * 3)];
        pointGroup.colors.push(color.r, color.g, color.b);
        pointGroup.rotations.push(slot.windowRotationY);
        pointGroup.sizes.push(lowSpec ? 0.46 : 0.34 + random() * 0.2, lowSpec ? 0.15 : 0.11 + random() * 0.08);
      }
    }

    const ledgeCount = slot.depthLayer === 0 ? (lowSpec ? 1 : 2 + (slotIndex % 2)) : 0;
    for (let ledgeIndex = 0; ledgeIndex < ledgeCount; ledgeIndex += 1) {
      const ledgeY = 1.5 + ledgeIndex * 7.5 + (slotIndex % 3) * 0.8;
      annexTransforms.push({
        x: facadeX + slot.inwardX * 0.42,
        y: ledgeY,
        z: facadeZ + slot.inwardZ * 0.42,
        width: slot.side === "back-z" ? width * 0.92 : 0.72,
        height: 0.28,
        depth: slot.side === "back-z" ? 0.72 : width * 0.92
      });
    }
    if (cityNeonEnabled && random() < (lowSpec ? 0.2 : 0.58) / (slot.depthLayer + 1)) {
      const signHeight = 1.2 + random() * 3.4;
      signTransforms.push({
        x: facadeX,
        y: -4 + random() * 22,
        z: facadeZ,
        rotationY: slot.windowRotationY,
        width: 0.24 + random() * 0.34,
        height: signHeight,
        color: signPalette[Math.floor(random() * signPalette.length)]
      });
    }
  });
  if (backboneTransforms.length) {
    const facadeGeometry = new THREE.PlaneGeometry(1, 1);
    const facadeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: lowSpec ? 0.48 : 0.62,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true
    });
    const facades = new THREE.InstancedMesh(facadeGeometry, facadeMaterial, backboneTransforms.length);
    facades.name = "underground-city-continuous-backdrop";
    facades.renderOrder = -39;
    facades.frustumCulled = false;
    const facadeColors = [0x0b3025, 0x081f19, 0x05130f];
    const facadeColor = new THREE.Color();
    backboneTransforms.forEach((block, index) => {
      const facadeX = block.x + (block.side === "back-x" ? block.depth * 0.5 : 0);
      const facadeZ = block.z + (block.side === "back-z" ? block.depth * 0.5 : 0);
      dummy.position.set(facadeX, block.y, facadeZ);
      dummy.rotation.set(0, block.rotationY, 0);
      dummy.scale.set(block.width, block.height, 1);
      dummy.updateMatrix();
      facades.setMatrixAt(index, dummy.matrix);
      facades.setColorAt(index, facadeColor.set(facadeColors[Math.min(block.depthLayer, facadeColors.length - 1)]));
    });
    facades.instanceMatrix.needsUpdate = true;
    if (facades.instanceColor) facades.instanceColor.needsUpdate = true;
    group.add(facades);
  }
  buildingCount += backboneTransforms.length;

  const uppercityConfigs = [];
  uppercityConfigs.forEach((layer, layerIndex) => {
    const slots = createCityEdgeSlots(layer, random);
    const blocks = [];
    slots.forEach((slot) => {
      const height = layer.minHeight + random() * (layer.maxHeight - layer.minHeight);
      const width = Math.min(layer.spacing * 0.72, 1.2 + random() * 2.2);
      const depth = 1.1 + random() * 1.5;
      blocks.push({
        x: slot.x,
        y: layer.bottomY + height * 0.5,
        z: slot.z,
        width,
        height,
        depth,
        rotationY: slot.rotationY
      });
      const facadeX = slot.x + slot.inwardX * (depth * 0.5 + 0.16);
      const facadeZ = slot.z + slot.inwardZ * (depth * 0.5 + 0.16);
      const rows = lowSpec ? 2 : clamp(Math.floor(height / 3.2), 2, 6);
      for (let row = 0; row < rows; row += 1) {
        if (random() < (lowSpec ? 0.38 : 0.18)) continue;
        const pointGroup = windowGroups[Math.floor(random() * windowGroups.length)];
        pointGroup.positions.push(
          facadeX,
          layer.bottomY + height * ((row + 1) / (rows + 1)),
          facadeZ
        );
        const color = windowPalette[random() < 0.1 ? 3 : Math.floor(random() * 3)];
        pointGroup.colors.push(color.r, color.g, color.b);
        pointGroup.rotations.push(slot.windowRotationY);
        pointGroup.sizes.push(lowSpec ? 0.42 : 0.34 + random() * 0.2, lowSpec ? 0.14 : 0.11 + random() * 0.08);
      }
      if (cityNeonEnabled && random() < (lowSpec ? 0.12 : 0.42)) {
        const signHeight = 0.8 + random() * Math.min(2.8, height * 0.35);
        signTransforms.push({
          x: facadeX,
          y: layer.bottomY + height * (0.28 + random() * 0.44),
          z: facadeZ,
          rotationY: slot.windowRotationY,
          width: 0.2 + random() * 0.3,
          height: signHeight,
          color: signPalette[Math.floor(random() * signPalette.length)]
        });
      }
    });
    addCityBoxInstances(`underground-city-upper-${layerIndex + 1}`, blocks, layer.color, -37 + layerIndex);
    buildingCount += blocks.length;
  });

  addCityBoxInstances("underground-city-annexes", annexTransforms, 0x06130f, -34);
  addCityBoxInstances("underground-city-bridges", bridgeTransforms, 0x071812, -33);
  buildingCount += annexTransforms.length;

  let roofGlowMesh = null;
  if (!lowSpec && roofLightTransforms.length) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.13,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    roofGlowMesh = new THREE.InstancedMesh(geometry, material, roofLightTransforms.length);
    roofGlowMesh.name = "underground-city-neon-glow";
    roofGlowMesh.renderOrder = -28;
    roofGlowMesh.frustumCulled = false;
    roofLightTransforms.forEach((light, index) => {
      dummy.position.set(light.x, light.y - 0.018, light.z);
      dummy.rotation.set(-Math.PI * 0.5, 0, 0);
      dummy.scale.set(light.width * 2.1, light.depth * 2.6, 1);
      dummy.updateMatrix();
      roofGlowMesh.setMatrixAt(index, dummy.matrix);
      roofGlowMesh.setColorAt(index, light.color);
    });
    roofGlowMesh.instanceMatrix.needsUpdate = true;
    if (roofGlowMesh.instanceColor) roofGlowMesh.instanceColor.needsUpdate = true;
    group.add(roofGlowMesh);
  }

  let roofLightsMesh = null;
  if (roofLightTransforms.length) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: lowSpec ? 0.68 : 0.82,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    roofLightsMesh = new THREE.InstancedMesh(geometry, material, roofLightTransforms.length);
    roofLightsMesh.name = "underground-city-roof-lights";
    roofLightsMesh.renderOrder = -27;
    roofLightsMesh.frustumCulled = false;
    roofLightTransforms.forEach((light, index) => {
      dummy.position.set(light.x, light.y, light.z);
      dummy.rotation.set(-Math.PI * 0.5, 0, 0);
      dummy.scale.set(light.width, light.depth, 1);
      dummy.updateMatrix();
      roofLightsMesh.setMatrixAt(index, dummy.matrix);
      roofLightsMesh.setColorAt(index, light.color);
    });
    roofLightsMesh.instanceMatrix.needsUpdate = true;
    if (roofLightsMesh.instanceColor) roofLightsMesh.instanceColor.needsUpdate = true;
    group.add(roofLightsMesh);
  }

  let citySignGlowMesh = null;
  if (!lowSpec && signTransforms.length) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.14,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    citySignGlowMesh = new THREE.InstancedMesh(geometry, material, signTransforms.length);
    citySignGlowMesh.name = "underground-city-sign-glow";
    citySignGlowMesh.renderOrder = -27;
    citySignGlowMesh.frustumCulled = false;
    signTransforms.forEach((sign, index) => {
      dummy.position.set(sign.x, sign.y, sign.z);
      dummy.rotation.set(0, sign.rotationY, 0);
      dummy.scale.set(sign.width * 3.2, sign.height * 1.32, 1);
      dummy.updateMatrix();
      citySignGlowMesh.setMatrixAt(index, dummy.matrix);
      citySignGlowMesh.setColorAt(index, sign.color);
    });
    citySignGlowMesh.instanceMatrix.needsUpdate = true;
    if (citySignGlowMesh.instanceColor) citySignGlowMesh.instanceColor.needsUpdate = true;
    group.add(citySignGlowMesh);
  }

  let citySignsMesh = null;
  if (signTransforms.length) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: lowSpec ? 0.54 : 0.78,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    citySignsMesh = new THREE.InstancedMesh(geometry, material, signTransforms.length);
    citySignsMesh.name = "underground-city-signs";
    citySignsMesh.renderOrder = -26;
    citySignsMesh.frustumCulled = false;
    signTransforms.forEach((sign, index) => {
      dummy.position.set(sign.x, sign.y, sign.z);
      dummy.rotation.set(0, sign.rotationY, 0);
      dummy.scale.set(sign.width, sign.height, 1);
      dummy.updateMatrix();
      citySignsMesh.setMatrixAt(index, dummy.matrix);
      citySignsMesh.setColorAt(index, sign.color);
    });
    citySignsMesh.instanceMatrix.needsUpdate = true;
    if (citySignsMesh.instanceColor) citySignsMesh.instanceColor.needsUpdate = true;
    group.add(citySignsMesh);
  }

  const platformRects = [];

  const structuralVertices = [];
  backboneTransforms.forEach((block, index) => {
    if (lowSpec && index % 2) return;
    const facadeX = block.x + (block.side === "back-x" ? block.depth * 0.5 + 0.04 : 0);
    const facadeZ = block.z + (block.side === "back-z" ? block.depth * 0.5 + 0.04 : 0);
    structuralVertices.push(facadeX, block.bottomY, facadeZ, facadeX, block.topY, facadeZ);
  });
  blocksByLayer.forEach(({ layer, blocks, halfX, halfZ }, layerIndex) => {
    const y = layer.topY + 0.08;
    for (let x = -halfX; x <= halfX; x += layer.spacing) {
      const snappedX = Math.round(x * 2) / 2;
      structuralVertices.push(snappedX, y, -halfZ, snappedX, y, halfZ);
    }
    for (let z = -halfZ; z <= halfZ; z += layer.spacing) {
      const snappedZ = Math.round(z * 2) / 2;
      structuralVertices.push(-halfX, y, snappedZ, halfX, y, snappedZ);
    }
    blocks.forEach((block) => {
      if (random() > (lowSpec ? 0.06 : 0.16 - layerIndex * 0.03)) return;
      const cableX = block.x + (random() - 0.5) * block.width * 0.7;
      const cableZ = block.z + (random() - 0.5) * block.depth * 0.7;
      structuralVertices.push(
        cableX, block.topY, cableZ,
        cableX, block.topY - block.height - 4 - random() * 8, cableZ
      );
    });
  });
  const structuralGeometry = new THREE.BufferGeometry();
  structuralGeometry.setAttribute("position", new THREE.Float32BufferAttribute(structuralVertices, 3));
  structuralGeometry.computeBoundingSphere();
  const structures = new THREE.LineSegments(structuralGeometry, new THREE.LineBasicMaterial({
    color: 0x1b5445,
    transparent: true,
    opacity: lowSpec ? 0.035 : 0.06,
    depthTest: true,
    depthWrite: false,
    fog: true
  }));
  structures.name = "underground-city-structure-lines";
  structures.renderOrder = -31;
  group.add(structures);

  const hazeLayers = lowSpec
    ? [
        { y: -16, opacity: 0.16 },
        { y: -46, opacity: 0.5 }
      ]
    : [
        { y: -11, opacity: 0.12 },
        { y: -25, opacity: 0.22 },
        { y: -43, opacity: 0.36 },
        { y: -67, opacity: 0.58 }
      ];
  const hazeGeometry = new THREE.PlaneGeometry(1, 1);
  hazeLayers.forEach((haze, index) => {
    const material = new THREE.MeshBasicMaterial({
      color: index === hazeLayers.length - 1 ? 0x010504 : 0x03100c,
      transparent: true,
      opacity: haze.opacity,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(hazeGeometry, material);
    mesh.name = `underground-city-depth-haze-${index + 1}`;
    mesh.position.set(0, haze.y, 0);
    mesh.rotation.x = -Math.PI * 0.5;
    mesh.scale.set(cityHorizonHalfX * 2.2, cityHorizonHalfZ * 2.2, 1);
    mesh.renderOrder = -19 + index;
    mesh.frustumCulled = false;
    group.add(mesh);
  });

  const blinkGroups = windowGroups
    .map((source, index) => addCityPointCloud(group, source, index, lowSpec))
    .filter(Boolean)
    .map((points, index) => ({
      points,
      phase: index * 1.73 + random() * Math.PI,
      frequency: 0.55 + index * 0.18,
      baseOpacity: lowSpec ? 0.1 : 0.14
    }));
  if (roofLightsMesh) {
    blinkGroups.push({
      points: roofLightsMesh,
      phase: 2.41,
      frequency: lowSpec ? 0.42 : 0.64,
      baseOpacity: lowSpec ? 0.48 : 0.58
    });
  }
  if (roofGlowMesh) {
    blinkGroups.push({
      points: roofGlowMesh,
      phase: 3.28,
      frequency: 0.42,
      baseOpacity: 0.08
    });
  }
  if (citySignsMesh) {
    blinkGroups.push({
      points: citySignsMesh,
      phase: 4.17,
      frequency: lowSpec ? 0.36 : 0.72,
      baseOpacity: lowSpec ? 0.4 : 0.54
    });
  }
  if (citySignGlowMesh) {
    blinkGroups.push({
      points: citySignGlowMesh,
      phase: 5.02,
      frequency: 0.54,
      baseOpacity: 0.08
    });
  }
  const windowCount = windowGroups.reduce((sum, source) => sum + source.positions.length / 3, 0)
    + roofLightTransforms.length
    + signTransforms.length;

  const moverCount = lowSpec ? 5 : 18;
  const moverPositions = new Float32Array(moverCount * 3);
  const moverColors = new Float32Array(moverCount * 3);
  const movers = [];
  const moverRouteRects = blocksByLayer.map(({ layer, halfX, halfZ }) => ({
    halfX,
    halfZ,
    y: layer.topY
  }));
  for (let index = 0; index < moverCount; index += 1) {
    const color = windowPalette[index % 4 === 3 ? 3 : index % 3];
    moverColors[index * 3] = color.r;
    moverColors[index * 3 + 1] = color.g;
    moverColors[index * 3 + 2] = color.b;
    if (index % 2 === 0) {
      const rect = moverRouteRects[index % moverRouteRects.length];
      const perimeter = (rect.halfX + rect.halfZ) * 4;
      movers.push({
        mode: "route",
        halfX: rect.halfX - 0.8,
        halfZ: rect.halfZ - 0.8,
        phase: random() * perimeter,
        speed: 0.65 + random() * 0.55,
        y: rect.y + 0.52
      });
    } else {
      const tier = tierConfigs.length
        ? tierConfigs[index % tierConfigs.length]
        : { halfX: baseHalfX + 1.5, halfZ: baseHalfZ + 1.5 };
      const side = index % 4;
      const alongX = Math.round((random() - 0.5) * tier.halfX * 1.5);
      const alongZ = Math.round((random() - 0.5) * tier.halfZ * 1.5);
      movers.push({
        mode: "vertical",
        x: side < 2 ? alongX : (side === 2 ? -tier.halfX : tier.halfX),
        z: side < 2 ? (side === 0 ? -tier.halfZ : tier.halfZ) : alongZ,
        phase: random() * Math.PI * 2,
        speed: 0.1 + random() * 0.08,
        minY: (lowSpec ? -32 : -48) - (index % 3) * 2,
        maxY: lowSpec ? -3.5 : -2.5
      });
    }
  }
  const moverGeometry = new THREE.BufferGeometry();
  moverGeometry.setAttribute("position", new THREE.BufferAttribute(moverPositions, 3));
  moverGeometry.setAttribute("color", new THREE.BufferAttribute(moverColors, 3));
  const moverMaterial = new THREE.PointsMaterial({
    size: lowSpec ? 0.42 : 0.5,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.18,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
    toneMapped: false
  });
  const moverPoints = new THREE.Points(moverGeometry, moverMaterial);
  moverPoints.name = "underground-city-moving-lights";
  moverPoints.frustumCulled = false;
  moverPoints.renderOrder = -27;
  group.add(moverPoints);

  undergroundCityAnimation = {
    lowSpec,
    lastUpdate: Number.NEGATIVE_INFINITY,
    blinkGroups,
    movers,
    moverPoints,
    structures
  };
  undergroundCityStats = {
    buildings: buildingCount,
    windows: windowCount,
    neon: roofLightTransforms.length + signTransforms.length,
    movers: moverCount,
    drawGroups: group.children.length,
    tiers: tierConfigs.length + undercityLayers.length + uppercityConfigs.length
  };
  updateUndergroundCityBackdrop(0, true);
}
function updateUndergroundCityBackdrop(elapsed, force = false) {
  const animation = undergroundCityAnimation;
  if (!animation) return;
  const interval = animation.lowSpec ? CITY_LOW_SPEC_UPDATE_INTERVAL : CITY_NORMAL_UPDATE_INTERVAL;
  if (!force && elapsed - animation.lastUpdate < interval) return;
  animation.lastUpdate = elapsed;
  animation.blinkGroups.forEach((entry) => {
    const slowPulse = Math.sin(elapsed * entry.frequency + entry.phase) * 0.5 + 0.5;
    const flicker = Math.pow(Math.max(0, Math.sin(elapsed * entry.frequency * 5.3 + entry.phase * 1.7)), 10);
    entry.points.material.opacity = entry.baseOpacity + slowPulse * 0.04 + flicker * 0.07;
  });
  const positionAttribute = animation.moverPoints.geometry.getAttribute("position");
  animation.movers.forEach((mover, index) => {
    if (mover.mode === "route") {
      setCityRoutePosition(positionAttribute, index, mover, elapsed);
    } else {
      const progress = Math.sin(mover.phase + elapsed * mover.speed) * 0.5 + 0.5;
      positionAttribute.setXYZ(
        index,
        mover.x,
        mover.minY + (mover.maxY - mover.minY) * progress,
        mover.z
      );
    }
  });
  positionAttribute.needsUpdate = true;
  animation.moverPoints.material.opacity = 0.12 + (Math.sin(elapsed * 1.7) * 0.5 + 0.5) * 0.1;
  animation.structures.material.opacity = (animation.lowSpec ? 0.025 : 0.04)
    + (Math.sin(elapsed * 0.42) * 0.5 + 0.5) * (animation.lowSpec ? 0.012 : 0.022);
}
function textureFor(url) {
  if (!url) return null;
  if (textureCache.has(url)) return textureCache.get(url);
  const texture = textureLoader.load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  textureCache.set(url, texture);
  return texture;
}
const STATUS_LABEL_CODES = Object.freeze({
  "清掃": "MAINT // CLEAN",
  "洗浄": "HYDRO // RINSE",
  "収穫可": "CROP // READY",
  "育成": "GROW // CARE",
  "漏電": "LEAKAGE // GRID FAULT",
  "休養": "UNIT // REST",
  "充電": "POWER // CHARGE",
  "?": "COMMS // SIGNAL",
  "NG": "ACTION // REJECT",
  "外出": ""
});
function textTexture(text, foreground = "#effff8", background = "#f5d65b") {
  const key = text + "|" + foreground + "|" + background;
  if (textTextureCache.has(key)) return textTextureCache.get(key);
  const source = document.createElement("canvas");
  let context = source.getContext("2d");
  const hasStatusCode = Object.prototype.hasOwnProperty.call(STATUS_LABEL_CODES, text);
  const code = hasStatusCode ? STATUS_LABEL_CODES[text] : "SYSTEM // STATUS";
  const mainFont = `900 ${code ? 76 : 94}px "Yu Gothic UI", "Yu Gothic", Meiryo, "Noto Sans JP", sans-serif`;
  const codeFont = '700 18px Consolas, "Yu Gothic UI", monospace';
  context.font = mainFont;
  const mainWidth = context.measureText(text).width;
  context.font = codeFont;
  const codeWidth = context.measureText(code).width;
  source.width = Math.max(320, Math.ceil(mainWidth) + 112, Math.ceil(codeWidth) + 84);
  source.height = 160;
  context = source.getContext("2d");
  context.clearRect(0, 0, source.width, source.height);
  const panelGradient = context.createLinearGradient(0, 0, source.width, source.height);
  panelGradient.addColorStop(0, "rgba(1, 18, 15, .97)");
  panelGradient.addColorStop(0.64, "rgba(3, 28, 24, .95)");
  panelGradient.addColorStop(1, "rgba(1, 12, 12, .98)");
  context.beginPath();
  context.moveTo(28, 8);
  context.lineTo(source.width - 52, 8);
  context.lineTo(source.width - 12, 46);
  context.lineTo(source.width - 12, 130);
  context.lineTo(source.width - 36, 152);
  context.lineTo(12, 152);
  context.lineTo(12, 28);
  context.closePath();
  context.fillStyle = panelGradient;
  context.fill();
  context.save();
  context.shadowColor = background;
  context.shadowBlur = 16;
  context.strokeStyle = background;
  context.lineWidth = 4;
  context.stroke();
  context.restore();

  context.globalAlpha = 0.92;
  context.fillStyle = background;
  context.fillRect(18, 38, 7, 99);
  context.fillRect(28, 13, Math.max(52, source.width * 0.28), 4);
  context.fillRect(source.width - 68, 20, 10, 10);
  context.globalAlpha = 0.54;
  context.fillRect(source.width - 51, 20, 8, 10);
  context.globalAlpha = 0.26;
  context.fillRect(source.width - 36, 20, 6, 10);
  for (let y = 48; y < 145; y += 9) context.fillRect(30, y, source.width - 58, 1);

  context.globalAlpha = 1;
  context.font = codeFont;
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillStyle = background;
  if (code) context.fillText(code, 36, 31);

  context.font = mainFont;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.globalAlpha = 0.46;
  context.fillStyle = "#48dbea";
  const mainTextY = code ? 99 : 86;
  context.fillText(text, source.width / 2 - 3, mainTextY);
  context.globalAlpha = 0.25;
  context.fillStyle = "#ff4f7d";
  context.fillText(text, source.width / 2 + 3, mainTextY + 2);
  context.globalAlpha = 1;
  context.fillStyle = foreground;
  context.shadowColor = background;
  context.shadowBlur = 12;
  context.fillText(text, source.width / 2, mainTextY);
  context.shadowBlur = 0;

  context.globalAlpha = 0.9;
  context.fillStyle = background;
  context.fillRect(36, 140, Math.max(44, source.width * 0.2), 3);
  context.globalAlpha = 0.42;
  context.fillRect(source.width - 104, 140, 58, 3);
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  textTextureCache.set(key, texture);
  return texture;
}
function createSprite(url, height, maxWidth = height * 1.5) {
  const material = new THREE.SpriteMaterial({ map: textureFor(url), transparent: true, alphaTest: 0.14, depthWrite: true, color: 0xffffff, fog: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(Math.min(maxWidth, height), height, 1);
  sprite.userData.spriteSizing = { height, maxWidth, applied: false };
  return sprite;
}
function createPlantBillboard(url, height, maxWidth = height * 1.5) {
  const material = new THREE.MeshBasicMaterial({
    map: textureFor(url), transparent: true, alphaTest: 0.14,
    depthWrite: true, color: 0xffffff, fog: true, side: THREE.DoubleSide
  });
  const billboard = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  billboard.scale.set(Math.min(maxWidth, height), height, 1);
  billboard.userData.spriteSizing = { height, maxWidth, applied: false };
  return billboard;
}
function alphaMaskForTexture(texture) {
  const image = texture?.image;
  if (!image) return null;
  if (textureAlphaMaskCache.has(texture)) return textureAlphaMaskCache.get(texture);
  const sourceWidth = image.naturalWidth || image.videoWidth || image.width || 0;
  const sourceHeight = image.naturalHeight || image.videoHeight || image.height || 0;
  if (!sourceWidth || !sourceHeight) return null;
  const scale = Math.min(1, 256 / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  try {
    const source = document.createElement("canvas");
    source.width = width;
    source.height = height;
    const context = source.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const rgba = context.getImageData(0, 0, width, height).data;
    const alpha = new Uint8Array(width * height);
    for (let index = 0; index < alpha.length; index += 1) alpha[index] = rgba[index * 4 + 3];
    const mask = { alpha, width, height };
    textureAlphaMaskCache.set(texture, mask);
    return mask;
  } catch (_error) {
    textureAlphaMaskCache.set(texture, null);
    return null;
  }
}
function hitMatchesVisiblePixel(hit) {
  if (!hit?.object?.userData?.alphaHitTest) return true;
  const mask = alphaMaskForTexture(hit.object.material?.map);
  if (!mask || !hit.uv) return true;
  const x = clamp(Math.floor(hit.uv.x * mask.width), 0, mask.width - 1);
  const y = clamp(Math.floor((1 - hit.uv.y) * mask.height), 0, mask.height - 1);
  return mask.alpha[y * mask.width + x] >= 40;
}
function createTextSprite(text, background = "#f5d65b", scale = 0.58) {
  const texture = textTexture(text, "#effff8", background);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale * (texture.image?.width || 192) / (texture.image?.height || 96), scale, 1);
  sprite.renderOrder = 40;
  return sprite;
}
function resourceReadyTexture(resource, amount, accent) {
  const resourceName = resource === "water" ? "水" : "養液";
  const resourceCode = resource === "water" ? "WATER" : "NUTRIENT";
  const amountText = Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
  const key = `resource-ready|${resource}|${amountText}|${accent}`;
  if (textTextureCache.has(key)) return textTextureCache.get(key);
  const source = document.createElement("canvas");
  source.width = 512;
  source.height = 256;
  const context = source.getContext("2d");
  context.clearRect(0, 0, source.width, source.height);
  context.beginPath();
  context.moveTo(24, 16);
  context.lineTo(488, 16);
  context.lineTo(488, 208);
  context.lineTo(456, 240);
  context.lineTo(24, 240);
  context.closePath();
  context.fillStyle = "rgba(1, 15, 12, .96)";
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = 4;
  context.stroke();
  context.fillStyle = accent;
  context.fillRect(24, 16, 10, 224);
  context.font = "700 24px Consolas, monospace";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(`${resourceCode} // RESOURCE READY`, 54, 50);
  context.font = '900 90px "Yu Gothic", "Noto Sans JP", sans-serif';
  context.textAlign = "center";
  context.fillStyle = "#effff8";
  context.fillText("回収可", 264, 132);
  context.font = '800 29px "Yu Gothic", "Noto Sans JP", sans-serif';
  context.fillStyle = accent;
  context.fillText(`${resourceName} ${amountText}　回収待機`, 264, 205);
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  textTextureCache.set(key, texture);
  return texture;
}
function createResourceReadyLabel(resource, amount, accent) {
  const material = new THREE.SpriteMaterial({
    map: resourceReadyTexture(resource, amount, accent),
    transparent: true, depthWrite: false, fog: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.18, 0.59, 1);
  sprite.renderOrder = 42;
  return sprite;
}
function equipmentGrimeTexture() {
  const key = "farm3d-equipment-grime";
  if (textTextureCache.has(key)) return textTextureCache.get(key);
  const source = document.createElement("canvas");
  source.width = 128;
  source.height = 128;
  const context = source.getContext("2d");
  context.clearRect(0, 0, source.width, source.height);
  const stains = [
    [34, 71, 25, .3], [71, 42, 20, .24], [88, 82, 27, .27],
    [50, 93, 14, .34], [98, 55, 11, .24], [24, 43, 10, .22]
  ];
  stains.forEach(([x, y, radius, opacity], index) => {
    const gradient = context.createRadialGradient(x, y, 1, x, y, radius);
    gradient.addColorStop(0, "rgba(111, 91, 54, " + (opacity + .2) + ")");
    gradient.addColorStop(.48, "rgba(82, 70, 45, " + opacity + ")");
    gradient.addColorStop(1, "rgba(51, 46, 32, 0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(x, y, radius, radius * (index % 2 ? .58 : .78), index * .37, 0, Math.PI * 2);
    context.fill();
  });
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  textTextureCache.set(key, texture);
  return texture;
}
function addDirtyEquipmentEffect(group, itemId, extentX, extentZ, height) {
  const effect = new THREE.Group();
  const stain = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 32),
    new THREE.MeshBasicMaterial({
      color: 0x65583a, transparent: true, opacity: 0.22,
      depthWrite: false, depthTest: true, side: THREE.DoubleSide
    })
  );
  stain.rotation.x = -Math.PI / 2;
  stain.position.y = 0.028;
  stain.scale.set(Math.max(0.72, extentX * 0.82), Math.max(0.72, extentZ * 0.82), 1);
  stain.renderOrder = 27;
  effect.add(stain);


  const patchPositions = [
    [-extentX * 0.24, height * 0.48, extentZ * 0.36],
    [extentX * 0.23, height * 0.7, -extentZ * 0.25],
    [0, height * 0.31, extentZ * 0.44]
  ];
  const patches = patchPositions.map(([x, y, z], index) => {
    const patch = new THREE.Sprite(new THREE.SpriteMaterial({
      map: equipmentGrimeTexture(), transparent: true,
      opacity: 0.62 - index * 0.07, depthWrite: false, depthTest: false,
      color: index === 1 ? 0x9c8759 : 0x806f49, fog: true
    }));
    patch.position.set(x, y, z);
    const size = Math.max(0.42, Math.min(0.72, Math.max(extentX, extentZ) * (0.42 - index * 0.04)));
    patch.scale.set(size, size, 1);
    patch.renderOrder = 30;
    effect.add(patch);
    return patch;
  });

  const moteCount = snapshot?.lowSpec ? 5 : 11;
  const positions = new Float32Array(moteCount * 3);
  for (let index = 0; index < moteCount; index += 1) {
    positions[index * 3] = Math.sin(index * 2.41) * extentX * 0.46;
    positions[index * 3 + 1] = 0.18 + ((index * 3) % moteCount) / Math.max(1, moteCount - 1) * height * 0.82;
    positions[index * 3 + 2] = Math.cos(index * 1.87) * extentZ * 0.46;
  }
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const motes = new THREE.Points(
    moteGeometry,
    new THREE.PointsMaterial({
      color: 0xc0a66b, size: 0.06, transparent: true,
      opacity: 0.68, depthWrite: false, depthTest: false
    })
  );
  motes.renderOrder = 29;
  effect.add(motes);
  group.add(effect);
  const phaseSeed = [...String(itemId || "")].reduce((total, character) => total + character.charCodeAt(0), 0);
  animatedObjects.push({
    type: "dirty-equipment", object: effect, stain, patches, motes,
    patchBaseYs: patches.map((patch) => patch.position.y),
    phase: phaseSeed * 0.071
  });
}
function createInteractionProxy(width, height, depth, interaction, includeInGeneralHits = true) {
  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.28, width), Math.max(0.28, height), Math.max(0.28, depth)),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false, color: 0xffffff })
  );
  proxy.userData.interaction = interaction;
  if (includeInGeneralHits) interactables.push(proxy);
  return proxy;
}
function registerVisualInteraction(object, interaction, alphaHitTest = false) {
  if (!object) return;
  object.userData.interaction = interaction;
  object.traverse((child) => {
    if (!child.isMesh && !child.isSprite) return;
    if (child.userData.ignoreInteraction) {
      delete child.userData.interaction;
      return;
    }
    child.userData.interaction = interaction;
    if (alphaHitTest) child.userData.alphaHitTest = true;
  });
  interactables.push(object);
  equipmentTargets.push(object);
}
function registerAccessInteraction(object, interaction) {
  if (!object) return;
  object.userData.interaction = interaction;
  object.traverse((child) => {
    if (!child.isMesh && !child.isSprite) return;
    child.userData.interaction = interaction;
  });
  interactables.push(object);
}
function createFloorOutline(width = 1, depth = 1, color = 0xf5d65b) {
  const points = [
    new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2, 0, -depth / 2),
    new THREE.Vector3(width / 2, 0, depth / 2), new THREE.Vector3(-width / 2, 0, depth / 2)
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }));
  line.renderOrder = 120;
  return line;
}
function setOutlineGeometry(width, depth) {
  if (!hoverOutline) return;
  hoverOutline.geometry.dispose();
  hoverOutline.geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2, 0, -depth / 2),
    new THREE.Vector3(width / 2, 0, depth / 2), new THREE.Vector3(-width / 2, 0, depth / 2)
  ]);
}
function setOutlineCircle(radius = 0.23, segments = 40) {
  if (!hoverOutline) return;
  const points = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  hoverOutline.geometry.dispose();
  hoverOutline.geometry = new THREE.BufferGeometry().setFromPoints(points);
}function worldPositionForGrid(baseId, x, y, vertical = 0) {
  const layout = baseLayouts.get(baseId);
  return layout ? new THREE.Vector3(layout.offsetX + y, vertical, layout.offsetZ + x) : new THREE.Vector3();
}
function clearDragCoverage() {
  const visual = dragCoverageVisual;
  if (!visual) return;
  visual.group?.parent?.remove(visual.group);
  const geometries = new Set();
  const materials = new Set();
  visual.group?.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material])
      .filter(Boolean)
      .forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach(disposeMaterial);
  dragCoverageVisual = null;
  if (canvas) delete canvas.dataset.farm3dDragCoverage;
}
function showDragCoverage(baseId, originX, originY, item, valid = true) {
  const radius = Math.max(0, Number(item?.effectRadius) || 0);
  if (!world || radius <= 0 || !Number.isFinite(originX) || !Number.isFinite(originY)) {
    clearDragCoverage();
    return;
  }
  const base = snapshot?.bases?.find((entry) => entry.id === baseId);
  if (!base) {
    clearDragCoverage();
    return;
  }
  const width = Math.max(1, Number(item?.width) || 1);
  const height = Math.max(1, Number(item?.height) || 1);
  const centerX = originX + Math.floor((width - 1) / 2);
  const centerY = originY + Math.floor((height - 1) / 2);
  const key = [baseId, originX, originY, width, height, radius, item.type, valid ? 1 : 0].join(":");
  if (dragCoverageVisual?.key === key) return;
  clearDragCoverage();

  const blocked = new Set(base.blockedCells || []);
  const color = valid
    ? item.type === "light" ? 0xf5d65b : item.type === "fan" ? 0x48dbea : colorNumber(item.color, 0x72ffb8)
    : 0xff5b6e;
  const group = new THREE.Group();
  group.userData.farm3dCoverage = true;
  const tileGeometry = new THREE.PlaneGeometry(0.84, 0.84);
  const tileMaterial = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.18,
    side: THREE.DoubleSide, depthWrite: false, depthTest: true
  });
  const lineMaterial = new THREE.LineBasicMaterial({
    color, transparent: true, opacity: 0.72,
    depthWrite: false, depthTest: true
  });
  let tileCount = 0;
  for (let y = Math.max(0, centerY - radius); y <= Math.min(base.rows - 1, centerY + radius); y += 1) {
    for (let x = Math.max(0, centerX - radius); x <= Math.min(base.cols - 1, centerX + radius); x += 1) {
      if (Math.abs(x - centerX) + Math.abs(y - centerY) > radius || blocked.has(x + "," + y)) continue;
      const position = worldPositionForGrid(baseId, x, y, 0.035);
      const tile = new THREE.Mesh(tileGeometry, tileMaterial);
      tile.rotation.x = -Math.PI / 2;
      tile.position.copy(position);
      tile.renderOrder = 2;
      group.add(tile);
      const outline = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-0.42, 0, -0.42), new THREE.Vector3(0.42, 0, -0.42),
          new THREE.Vector3(0.42, 0, 0.42), new THREE.Vector3(-0.42, 0, 0.42)
        ]),
        lineMaterial
      );
      outline.position.copy(position);
      outline.position.y += 0.004;
      outline.renderOrder = 3;
      group.add(outline);
      tileCount += 1;
    }
  }
  world.add(group);
  dragCoverageVisual = { group, key, tileMaterial, lineMaterial, valid, tileCount };
  if (canvas) canvas.dataset.farm3dDragCoverage = String(tileCount);
}
function pointerWorldOnEquipmentDragPlane(clientX, clientY, vertical) {
  if (!canvas || !camera) return null;
  const rect = canvas.getBoundingClientRect();
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  equipmentDragPlane.constant = -vertical;
  return raycaster.ray.intersectPlane(equipmentDragPlane, equipmentDragPlanePoint)
    ? equipmentDragPlanePoint
    : null;
}
function settleEquipmentDragVisual() {
  const visual = equipmentDragVisual;
  if (!visual) return;
  resumeRobotAfterEquipmentDrag(visual.robotEntry, false);
  if (visual.object?.parent) {
    visual.object.position.copy(visual.originalPosition);
    visual.object.rotation.copy(visual.originalRotation);
    visual.object.scale.copy(visual.originalScale);
    visual.object.userData.farm3dDragging = false;
  }
  equipmentDragVisual = null;
  if (canvas) {
    delete canvas.dataset.farm3dObjectDrag;
    delete canvas.dataset.farm3dDragRotation;
  }
}
function suspendRobotForEquipmentDrag(interaction, object) {
  if (interaction?.item?.type !== "support_robot") return null;
  const entry = animatedObjects.find((candidate) => (
    candidate.type === "robot"
    && candidate.itemId === interaction.id
    && candidate.object?.parent === object
  ));
  if (!entry) return null;
  const state = robotStateFor(entry, performance.now() * 0.001);
  entry.dragStateBefore = { ...state };
  entry.dragSuspended = true;
  state.x = entry.homeX;
  state.y = entry.homeY;
  state.facing = Math.PI / 4;
  state.facingGoal = Math.PI / 4;
  state.motion = "idle";
  state.motionSince = performance.now() * 0.001;
  state.workUntil = 0;
  state.joyUntil = 0;
  state.targetX = null;
  state.targetY = null;
  entry.object.position.set(0, entry.baseY, 0);
  entry.object.rotation.y = state.facing;
  if (entry.shadow) {
    entry.shadow.position.x = 0;
    entry.shadow.position.z = 0;
  }
  applyRobotMotion(entry.object, "idle", 0);
  return entry;
}
function resumeRobotAfterEquipmentDrag(entry, placed) {
  if (!entry) return;
  entry.dragSuspended = false;
  if (placed) {
    robotVisualStates.delete(robotStateKey(entry.baseId, entry.itemId));
  } else if (entry.dragStateBefore) {
    const state = robotVisualStates.get(robotStateKey(entry.baseId, entry.itemId));
    if (state) Object.assign(state, entry.dragStateBefore);
  }
  delete entry.dragStateBefore;
}
function beginEquipmentVisualDrag(action) {
  settleEquipmentDragVisual();
  const object = action?.hit?.interaction?.dragObject;
  if (!object?.parent) return;
  object.updateWorldMatrix(true, false);
  const originalWorld = object.getWorldPosition(new THREE.Vector3());
  const isSupportRobot = action.hit.interaction.item?.type === "support_robot";
  const grabOffset = isSupportRobot
    ? new THREE.Vector3()
    : originalWorld.clone().sub(action.hit.point);
  grabOffset.y = 0;
  const robotEntry = suspendRobotForEquipmentDrag(action.hit.interaction, object);
  const liftedWorld = originalWorld.clone();
  liftedWorld.y += 0.13;
  equipmentDragVisual = {
    object,
    parent: object.parent,
    originalPosition: object.position.clone(),
    originalRotation: object.rotation.clone(),
    originalScale: object.scale.clone(),
    originalWorld,
    currentWorld: liftedWorld,
    targetWorld: originalWorld.clone(),
    velocity: new THREE.Vector3(0, 2.35, 0),
    grabOffset,
    localPosition: new THREE.Vector3(),
    targetScale: new THREE.Vector3(),
    rotationQuarter: normalizeQuarterTurn(action.rotationQuarter),
    targetYaw: object.rotation.y,
    robotEntry,
    dragging: true,
    returning: false
  };
  equipmentDragVisual.localPosition.copy(liftedWorld);
  equipmentDragVisual.parent.worldToLocal(equipmentDragVisual.localPosition);
  object.position.copy(equipmentDragVisual.localPosition);
  object.scale.copy(equipmentDragVisual.originalScale).multiplyScalar(1.06);
  object.userData.farm3dDragging = true;
  if (canvas) canvas.dataset.farm3dObjectDrag = "active";
  updateEquipmentVisualDragTarget(action.lastX, action.lastY);
  bridge()?.feedback?.("grab");
}
function updateEquipmentVisualDragTarget(clientX, clientY) {
  const visual = equipmentDragVisual;
  if (!visual?.dragging) return;
  const lift = visual.originalWorld.y + 0.36;
  const point = pointerWorldOnEquipmentDragPlane(clientX, clientY, lift);
  if (!point) return;
  visual.targetWorld.copy(point).add(visual.grabOffset);
  visual.targetWorld.y = lift;
}
function releaseEquipmentVisualDrag(placed) {
  const visual = equipmentDragVisual;
  if (!visual) return;
  visual.dragging = false;
  visual.object.userData.farm3dDragging = false;
  if (placed) {
    resumeRobotAfterEquipmentDrag(visual.robotEntry, true);
    // The spring visual can be far behind the pointer during a fast drag. Hide
    // that transient pose and rebuild immediately from the committed grid state.
    visual.object.visible = false;
    if (canvas) {
      canvas.dataset.farm3dObjectDrag = "committing";
      delete canvas.dataset.farm3dDragRotation;
    }
    snapshotSignature = "";
    forceSync = true;
    syncSnapshot(performance.now());
    if (equipmentDragVisual === visual) {
      visual.object.visible = true;
      visual.object.position.copy(visual.originalPosition);
      visual.object.rotation.copy(visual.originalRotation);
      visual.object.scale.copy(visual.originalScale);
      equipmentDragVisual = null;
      if (canvas) delete canvas.dataset.farm3dObjectDrag;
    }
    return;
  }
  visual.returning = true;
  visual.targetYaw = visual.originalRotation.y;
  visual.targetWorld.copy(visual.originalWorld);
  if (canvas) canvas.dataset.farm3dObjectDrag = "returning";
}
function updateEquipmentDragVisual(delta) {
  const visual = equipmentDragVisual;
  if (!visual?.object?.parent) return;
  const spring = visual.returning ? 118 : 188;
  const damping = visual.returning ? 16.5 : 19.5;
  visual.velocity.addScaledVector(
    visual.localPosition.copy(visual.targetWorld).sub(visual.currentWorld),
    spring * delta
  );
  visual.velocity.multiplyScalar(Math.exp(-damping * delta));
  visual.currentWorld.addScaledVector(visual.velocity, delta);
  visual.localPosition.copy(visual.currentWorld);
  visual.parent.worldToLocal(visual.localPosition);
  visual.object.position.copy(visual.localPosition);
  if (visual.dragging) visual.object.position.y += Math.sin(performance.now() * 0.012) * 0.009;

  const rotationDamping = 1 - Math.exp(-delta * 17);
  const tiltX = clamp(visual.velocity.z * 0.046, -0.18, 0.18);
  const tiltZ = clamp(-visual.velocity.x * 0.046, -0.18, 0.18);
  const swayY = clamp((visual.velocity.x - visual.velocity.z) * 0.01, -0.065, 0.065);
  const yawTarget = visual.returning ? visual.originalRotation.y : visual.targetYaw;
  visual.object.rotation.x += (visual.originalRotation.x + tiltX - visual.object.rotation.x) * rotationDamping;
  visual.object.rotation.y += (yawTarget + swayY - visual.object.rotation.y) * rotationDamping;
  visual.object.rotation.z += (visual.originalRotation.z + tiltZ - visual.object.rotation.z) * rotationDamping;
  visual.targetScale.copy(visual.originalScale).multiplyScalar(visual.dragging ? 1.055 : 1);
  visual.object.scale.lerp(visual.targetScale, 1 - Math.exp(-delta * 18));

  if (!visual.returning) return;
  const closeEnough = visual.currentWorld.distanceToSquared(visual.originalWorld) < 0.00045
    && visual.velocity.lengthSq() < 0.0025;
  if (!closeEnough) return;
  visual.object.position.copy(visual.originalPosition);
  visual.object.rotation.copy(visual.originalRotation);
  visual.object.scale.copy(visual.originalScale);
  resumeRobotAfterEquipmentDrag(visual.robotEntry, false);
  equipmentDragVisual = null;
  if (canvas) {
    delete canvas.dataset.farm3dObjectDrag;
    delete canvas.dataset.farm3dDragRotation;
  }
}
function localSlotPosition(type, index, count) {
  if (type === "pod") return { x: 0, z: 0 };
  if (type === "box" && count >= 6) {
    const column = Math.floor(index / 2);
    const row = index % 2;
    return { x: (row - 0.5) * 0.58, z: (column - 1) * 0.82 };
  }
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / columns));
  return { x: (Math.floor(index / columns) - (rows - 1) / 2) * 0.55, z: (index % columns - (columns - 1) / 2) * 0.55 };
}
function addBlobShadow(group, width, depth) {
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(width * 0.85, depth * 0.85, 1);
  shadow.position.y = 0.012;
  group.add(shadow);
  return shadow;
}
function addStatusMarker(group, text, background, y, interaction = null, scale = 0.085) {
  const marker = createTextSprite(text, background, scale);
  marker.position.set(0, y, 0);
  if (interaction) {
    marker.userData.interaction = interaction;
    interactables.push(marker);
  }
  group.add(marker);
  animatedObjects.push({
    type: "marker",
    object: marker,
    baseX: marker.position.x,
    baseY: y,
    phase: Math.random() * Math.PI * 2,
    scaleX: marker.scale.x,
    scaleY: marker.scale.y
  });
}
function robotTalkBubbleTexture() {
  const key = "robot-talk-bubble";
  if (textTextureCache.has(key)) return textTextureCache.get(key);
  const source = document.createElement("canvas");
  source.width = 320;
  source.height = 280;
  const context = source.getContext("2d");
  context.clearRect(0, 0, source.width, source.height);

  const left = 28;
  const top = 18;
  const right = 292;
  const bottom = 210;
  const radius = 52;
  context.beginPath();
  context.moveTo(left + radius, top);
  context.lineTo(right - radius, top);
  context.quadraticCurveTo(right, top, right, top + radius);
  context.lineTo(right, bottom - radius);
  context.quadraticCurveTo(right, bottom, right - radius, bottom);
  context.lineTo(184, bottom);
  context.lineTo(146, 258);
  context.lineTo(142, bottom);
  context.lineTo(left + radius, bottom);
  context.quadraticCurveTo(left, bottom, left, bottom - radius);
  context.lineTo(left, top + radius);
  context.quadraticCurveTo(left, top, left + radius, top);
  context.closePath();
  context.fillStyle = "rgba(3, 25, 22, .97)";
  context.shadowColor = "rgba(114, 255, 184, .78)";
  context.shadowBlur = 24;
  context.fill();
  context.shadowBlur = 0;
  context.lineWidth = 8;
  context.strokeStyle = "#72ffb8";
  context.stroke();

  context.beginPath();
  context.arc(80, 68, 9, 0, Math.PI * 2);
  context.arc(105, 49, 5, 0, Math.PI * 2);
  context.fillStyle = "#48dbea";
  context.fill();

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = '900 138px "Yu Gothic UI", "Yu Gothic", Meiryo, sans-serif';
  context.fillStyle = "#effff8";
  context.shadowColor = "#72ffb8";
  context.shadowBlur = 18;
  context.fillText("?", 164, 121);
  context.shadowBlur = 0;

  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  textTextureCache.set(key, texture);
  return texture;
}
function addRobotTalkBubble(parent, y, interaction) {
  const material = new THREE.SpriteMaterial({
    map: robotTalkBubbleTexture(), transparent: true,
    depthWrite: false, depthTest: false, fog: false
  });
  const bubble = new THREE.Sprite(material);
  bubble.position.set(0, y, 0);
  bubble.scale.set(1.12, 0.98, 1);
  bubble.renderOrder = 90;
  bubble.userData.interaction = interaction;
  interactables.push(bubble);
  parent.add(bubble);
  animatedObjects.push({
    type: "talk-bubble", object: bubble,
    baseX: 0, baseY: y, phase: Math.random() * Math.PI * 2,
    scaleX: bubble.scale.x, scaleY: bubble.scale.y
  });
}
function addProductionEffect(group, item) {
  if (!item.productionResource) return;
  if (item.resourceStored > 0) {
    const resource = item.productionResource;
    const accent = resource === "water" ? "#48dbea" : "#72ffb8";
    const color = colorNumber(accent);
    const interaction = {
      type: "equipment", priority: 8, baseId: item.baseId, kind: item.kind, id: item.id, item,
      label: item.name + " / 回収可能"
    };
    const effect = new THREE.Group();
    const groundRing = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.53, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false, depthTest: true })
    );
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.y = 0.045;
    const scanRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.025, 8, 36),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, depthTest: true })
    );
    scanRing.rotation.x = Math.PI / 2;
    scanRing.position.y = 0.56;
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.1, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff1a1, transparent: true, opacity: 0.98, depthWrite: false, depthTest: true })
    );
    diamond.position.y = 1.48;
    diamond.userData.interaction = interaction;
    interactables.push(diamond);
    const label = createResourceReadyLabel(resource, Math.max(0, Number(item.resourceStored) || 0), accent);
    label.position.y = 1.94;
    label.userData.interaction = interaction;
    interactables.push(label);
    const hitArea = createInteractionProxy(1.28, 0.64, 0.3, interaction);
    hitArea.position.y = 1.94;
    effect.add(groundRing, scanRing, diamond, label, hitArea);
    group.add(effect);
    animatedObjects.push({
      type: "resource-ready", object: effect, groundRing, scanRing, diamond, label,
      labelBaseScale: label.scale.clone(), phase: Math.random() * Math.PI * 2
    });
    return;
  }
  const effect = new THREE.Group();
  const color = colorNumber(item.productionResource === "water" ? "#48dbea" : "#91d9ff");
  for (let index = 0; index < 3; index += 1) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25 + index * 0.09, 0.018, 6, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.58, depthWrite: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.45 + index * 0.28;
    effect.add(ring);
  }
  group.add(effect);
  animatedObjects.push({ type: "production", object: effect, phase: Math.random() * Math.PI * 2 });
}
function buildPlantSlots(base, item, itemGroup, deckHeight, parentYaw = 0) {
  const firstReadyIndex = item.slots.findIndex((plant) => plant?.ready);
  item.slots.forEach((plant, slotIndex) => {
    const local = localSlotPosition(item.type, slotIndex, item.slots.length);
    const slotGroup = new THREE.Group();
    slotGroup.position.set(local.x, deckHeight, local.z);
    const interaction = {
      type: "slot", priority: 8, baseId: base.id, unitId: item.id, slotIndex,
      hoverObject: slotGroup, empty: !plant,
      label: plant ? plant.name + (plant.ready ? " / 収穫可能" : plant.dead ? " / 枯死" : " / 生育中") : ""
    };
    if (plant) {
      const height = plant.dead ? 0.48 : 0.42 + plant.stage * 0.13;
      const sprite = createPlantBillboard(plant.sprite, height, height * 1.25);
      sprite.position.y = height * 0.5 + 0.03;
      sprite.userData.interaction = interaction;
      sprite.userData.alphaHitTest = true;
      sprite.userData.plantBaseScale = sprite.scale.clone();
      interactables.push(sprite);
      if (plant.dead) sprite.material.color.setHex(0x76656a);
      slotGroup.add(sprite);
      plantAnchors.set(plantSlotKey(base.id, item.id, slotIndex), {
        object: slotGroup,
        sprite,
        height,
        color: plant.color
      });
      animatedObjects.push({
        type: plant.ready ? "ready-plant" : "plant",
        object: sprite,
        baseY: sprite.position.y,
        parentYaw,
        growing: !plant.ready && !plant.dead,
        phase: slotIndex * 0.73 + Number(item.x || 0) * 0.31 + Number(item.y || 0) * 0.47
      });
      if (plant.ready) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.25, 0.34, 32),
          new THREE.MeshBasicMaterial({
            color: 0xf5d65b, transparent: true, opacity: 0.86,
            side: THREE.DoubleSide, depthWrite: false, depthTest: true
          })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.045;
        slotGroup.add(ring);
        animatedObjects.push({ type: "ready-ring", object: ring, phase: slotIndex * 0.51 });

        if (slotIndex === firstReadyIndex) {
          const beacon = new THREE.Group();
          beacon.position.y = height + 0.16;
          const halo = new THREE.Mesh(
            new THREE.TorusGeometry(0.18, 0.022, 8, 32),
            new THREE.MeshBasicMaterial({
              color: 0xf5d65b, transparent: true, opacity: 0.9,
              depthWrite: false, depthTest: true
            })
          );
          halo.rotation.x = Math.PI / 2;
          const diamond = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.072, 0),
            new THREE.MeshBasicMaterial({
              color: 0xfff1a1, transparent: true, opacity: 0.96,
              depthWrite: false, depthTest: true
            })
          );
          diamond.position.y = 0.14;
          const label = createTextSprite("収穫可", "#f5d65b", 0.38);
          label.position.y = 0.47;
          beacon.add(halo, diamond, label);
          slotGroup.add(beacon);
          animatedObjects.push({
            type: "ready-beacon", object: beacon, halo, diamond, label,
            baseY: beacon.position.y, phase: slotIndex * 0.67
          });
        }
      }
    } else {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.19, 24), new THREE.MeshBasicMaterial({ color: 0x4b997a, transparent: true, opacity: 0.52, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.025;
      slotGroup.add(ring);
    }
    itemGroup.add(slotGroup);
  });
}
function buildEquipment(base, item, baseGroup) {
  const baseWidth = Math.max(1, Number(item.baseWidth) || Number(item.width) || 1);
  const baseHeight = Math.max(1, Number(item.baseHeight) || Number(item.height) || 1);
  const visualRotation = item.type === "support_robot" ? 0 : quarterTurnYaw(item.rotationQuarter);
  const group = new THREE.Group();
  group.position.set(item.y + (item.height - 1) / 2, FLOOR_HEIGHT / 2, item.x + (item.width - 1) / 2);
  group.rotation.y = visualRotation;
  baseGroup.add(group);
  if (item.type === "radio") radioEmitterObjects.set(item.id, group);
  const interaction = {
    type: "equipment", priority: 4, baseId: base.id, kind: item.kind, id: item.id, item,
    label: item.type === "support_robot" && item.robotName ? item.robotName : item.name,
    width: item.width, height: item.height, dragObject: group
  };
  const shadow = addBlobShadow(group, baseHeight, baseWidth);
  let robotAnimationEntry = null;
  const deckHeight = item.type === "box" ? 0.68 : item.type === "pod" ? 0.72 : 0.55;
  const builder = MODEL_BUILDERS[item.type];
  if (builder) {
    const holes = item.kind === "unit" ? item.slots.map((_, index) => localSlotPosition(item.type, index, item.slots.length)) : [];
    const model = item.type === "support_robot"
      ? buildRobotModel({ extentX: baseHeight, extentZ: baseWidth, deckHeight, holes })
      : builder({ extentX: baseHeight, extentZ: baseWidth, deckHeight, holes });
    model.position.y = 0.03;
    group.add(model);
    registerVisualInteraction(model, interaction);
    if (item.type === "light" && model.userData.growLight) {
      animatedObjects.push({
        type: "grow-light",
        object: model,
        itemId: item.id,
        ...model.userData.growLight,
        randomState: Math.floor(Math.random() * 0xffffffff) >>> 0,
        nextFlickerAt: null,
        flickerStartedAt: null,
        flickerMode: "single",
        currentLevel: 1
      });
    }
    if (item.type === "support_robot") {
      const dock = buildChargeDockModel({ extentX: baseHeight, extentZ: baseWidth });
      dock.position.y = 0.018;
      group.add(dock);
      registerVisualInteraction(dock, interaction);
      robotAnimationEntry = {
        type: "robot", object: model, shadow, baseId: base.id, itemId: item.id, item,
        homeX: item.x + (item.width - 1) / 2, homeY: item.y + (item.height - 1) / 2,
        baseY: model.position.y, phase: Math.random() * Math.PI * 2, interaction
      };
      animatedObjects.push(robotAnimationEntry);
    }
  } else {
    const visualHeight = Math.max(1.2, Math.min(2.45, Math.max(baseWidth, baseHeight) * 1.15));
    const sprite = createSprite(item.sprite, visualHeight, Math.max(baseWidth, baseHeight) * 1.4);
    sprite.position.y = visualHeight * 0.5 + 0.05;
    group.add(sprite);
    registerVisualInteraction(sprite, interaction, true);
  }
  if (item.surfaceType && item.surfaceSlots > 0) {
    const surfaceInteraction = { ...interaction, priority: 12, surfaceTarget: true };
    const surfaceProxy = createInteractionProxy(
      Math.max(0.72, baseHeight * 0.9),
      0.32,
      Math.max(0.72, baseWidth * 0.9),
      surfaceInteraction
    );
    surfaceProxy.position.y = 0.82;
    group.add(surfaceProxy);
    equipmentTargets.push(surfaceProxy);
  }
  const proxyHeight = item.type === "support_robot" ? 1.45 : item.kind === "unit" ? 1.15 : 1.6;
  if (item.kind === "unit") buildPlantSlots(base, item, group, deckHeight, visualRotation);
  if (item.needsCleaning) {
    addDirtyEquipmentEffect(group, item.id, baseHeight, baseWidth, proxyHeight);
    addStatusMarker(group, "清掃", "#f5d65b", Math.max(1.75, proxyHeight + 0.35), null, 0.38);
  }
  if (item.talkPending) {
    if (robotAnimationEntry) addRobotTalkBubble(robotAnimationEntry.object, 1.62, interaction);
    else addRobotTalkBubble(group, Math.max(2.08, proxyHeight + 0.68), interaction);
  }
  if (item.recoveryMode) addStatusMarker(group, item.recoveryMode === "forced" ? "休養" : "充電", "#f5d65b", Math.max(1.95, proxyHeight + 0.55), null, 0.28);
  addProductionEffect(group, { ...item, baseId: base.id });
  return group;
}

function tabletopSlotPosition(host, slot) {
  const count = Math.max(1, Number(host.surfaceSlots) || 1);
  const index = clamp(Math.floor(Number(slot) || 0), 0, count - 1);
  const spread = Math.min(1.18, Math.max(0.55, (Number(host.baseHeight) || Number(host.height) || 1) * 0.62));
  const x = count <= 1 ? 0 : (index / (count - 1) - 0.5) * spread;
  return new THREE.Vector3(x, 0.965, 0);
}

function buildTabletopEquipment(base, item, host, hostGroup) {
  if (!hostGroup || !host) return null;
  const group = new THREE.Group();
  group.position.copy(tabletopSlotPosition(host, item.surfaceSlot));
  group.rotation.y = quarterTurnYaw(item.rotationQuarter);
  hostGroup.add(group);
  const interaction = {
    type: "equipment", priority: 10, baseId: base.id, kind: item.kind, id: item.id, item,
    label: `${item.name} / 卓上`, width: 0.48, height: 0.48, dragObject: group
  };
  const builder = MODEL_BUILDERS[item.type];
  if (builder) {
    const model = builder({ extentX: 0.62, extentZ: 0.62, deckHeight: 0.3, holes: [] });
    group.add(model);
    registerVisualInteraction(model, interaction);
  } else {
    const sprite = createSprite(item.sprite, 0.46, 0.5);
    sprite.position.y = 0.23;
    group.add(sprite);
    registerVisualInteraction(sprite, interaction, true);
  }
  const proxy = createInteractionProxy(0.52, 0.5, 0.52, interaction, false);
  proxy.position.y = 0.22;
  group.add(proxy);
  equipmentTargets.push(proxy);
  return group;
}

function buildFurnitureSetMarkers(base, baseGroup) {
  if (!FURNITURE_SET_STATUS_VISIBLE) return;
  const activeSets = base.furnitureSets || [];
  if (!activeSets.length) return;
  const marker = createTextSprite(`SET EFFECT // ${activeSets.length} ACTIVE`, "#f5d65b", 0.42);
  marker.position.set(-0.48, 0.42, Math.max(0, base.cols - 0.34));
  marker.material.depthTest = false;
  marker.renderOrder = 76;
  baseGroup.add(marker);
}
function buildMarketAccessSlot(base, accessPoint, baseGroup) {
  if (!accessPoint) return;
  const centerX = (base.rows - 1) / 2;
  const group = new THREE.Group();
  group.position.set(centerX, 0, base.cols + 1.02);
  group.rotation.y = Math.PI / 2;
  group.userData.marketAccessSlot = true;

  const padMaterial = new THREE.MeshLambertMaterial({
    color: accessPoint.available ? 0x172f27 : 0x151b19,
    emissive: accessPoint.available ? 0x061912 : 0x020504,
    transparent: true,
    opacity: 0.98
  });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.94, FLOOR_HEIGHT, 1.72), padMaterial);
  pad.position.y = -FLOOR_HEIGHT / 2;
  group.add(pad);
  const frame = createFloorOutline(0.98, 1.76, accessPoint.available ? 0x48dbea : 0x4b5a55);
  frame.material.depthTest = true;
  frame.material.depthWrite = false;
  frame.material.opacity = accessPoint.available ? 0.62 : 0.28;
  frame.renderOrder = -7;
  frame.position.y = 0.012;
  group.add(frame);

  const guideMaterial = new THREE.MeshBasicMaterial({
    color: accessPoint.available ? 0xb7d83f : 0x4b5a55,
    transparent: true,
    opacity: accessPoint.available ? 0.72 : 0.26,
    depthWrite: false
  });
  [-0.47, 0.47].forEach((z) => {
    const guide = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.055), guideMaterial);
    guide.position.set(0, 0.018, z);
    guide.rotation.y = z < 0 ? -0.35 : 0.35;
    group.add(guide);
  });

  const interaction = {
    type: "access",
    priority: 11,
    accessId: accessPoint.id,
    baseId: base.id,
    hoverObject: group,
    label: accessPoint.available ? "電動キックボード / 行き先を選択" : "電動キックボード / 外出先なし"
  };
  const scooter = buildMarketCourierScooterModel();
  scooter.position.y = 0.025;
  scooter.rotation.y = -Math.PI * 0.88;
  scooter.scale.setScalar(0.82);
  scooter.userData.baseScale = scooter.scale.clone();
  group.add(scooter);
  registerAccessInteraction(scooter, interaction);
  const proxy = createInteractionProxy(0.84, 1.52, 1.36, interaction);
  proxy.position.y = 0.73;
  group.add(proxy);

  const label = createTextSprite(accessPoint.available ? "外出" : "利用不可", accessPoint.available ? "#48dbea" : "#60716a", 0.32);
  label.position.set(0, 1.72, -0.06);
  label.material.opacity = 0;
  label.visible = false;
  group.add(label);
  let unseenMarker = null;
  if (accessPoint.unseen) {
    unseenMarker = new THREE.Group();
    const alertMaterial = new THREE.MeshBasicMaterial({ color: 0xf5d65b, transparent: true, opacity: 0.94, depthWrite: false });
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 8, 24), alertMaterial);
    halo.rotation.x = Math.PI / 2;
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0), alertMaterial);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.12, 0.025), alertMaterial);
    stem.position.y = 0.18;
    unseenMarker.add(halo, diamond, stem);
    unseenMarker.position.set(0.34, 1.65, 0.04);
    group.add(unseenMarker);
  }

  baseGroup.add(group);
  animatedObjects.push({
    type: "market-access",
    object: group,
    scooter,
    label,
    labelBaseScale: label.scale.clone(),
    unseenMarker,
    headlight: scooter.getObjectByName("market-scooter-headlight"),
    tailLight: scooter.getObjectByName("market-scooter-tail-light"),
    phase: 0.7
  });
}
function buildExpansionMarker(base, direction, baseGroup, hasNeighbor) {
  if (!snapshot.brokerUnlocked) return;
  const centerX = (base.rows - 1) / 2;
  const centerZ = (base.cols - 1) / 2;
  const positions = {
    back: { x: -1.05, z: centerZ }, front: { x: base.rows + 0.05, z: centerZ },
    left: { x: centerX, z: -1.05 }, right: { x: centerX, z: base.cols + 0.05 }
  };
  const position = positions[direction.id];
  if (!position) return;
  const color = hasNeighbor ? 0x48dbea : 0xf5d65b;
  const group = new THREE.Group();
  group.position.set(position.x, 0.11, position.z);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.86, depthWrite: false });
  group.add(
    new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.035, 0.09), material),
    new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, 0.52), material)
  );
  const interaction = {
    type: "expansion", priority: 7, baseId: base.id, directionId: direction.id,
    hoverObject: group,
    label: hasNeighbor ? direction.label + "の拠点へ" : direction.label + "へ拡張"
  };
  const proxy = createInteractionProxy(0.84, 0.28, 0.84, interaction);
  proxy.position.y = 0.08;
  group.add(proxy);
  baseGroup.add(group);
  animatedObjects.push({ type: "expansion", object: group, material, baseColor: new THREE.Color(color), hoverColor: new THREE.Color(hasNeighbor ? 0xbdfaff : 0xfff1a1), baseY: group.position.y, phase: direction.dx * 1.7 + direction.dy * 2.3 });
}
function buildBase(base, layout) {
  const baseGroup = new THREE.Group();
  baseGroup.position.set(layout.offsetX, 0, layout.offsetZ);
  world.add(baseGroup);
  const blocked = new Set(base.blockedCells || []);
  for (let y = 0; y < base.rows; y += 1) {
    for (let x = 0; x < base.cols; x += 1) {
      const isBlocked = blocked.has(x + "," + y);
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(0.94, isBlocked ? 0.13 : FLOOR_HEIGHT, 0.94),
        new THREE.MeshLambertMaterial({
          color: isBlocked ? 0x07100d : base.id === snapshot.activeBaseId ? 0x1b4938 : 0x143529,
          emissive: isBlocked ? 0x000000 : base.id === snapshot.activeBaseId ? 0x07170f : 0x030b08,
          transparent: true, opacity: isBlocked ? 0.7 : 0.96
        })
      );
      tile.position.set(y, isBlocked ? -0.16 : -FLOOR_HEIGHT / 2, x);
      if (!isBlocked) {
        tile.userData.interaction = {
          type: "cell", priority: 1, baseId: base.id, x, y,
          label: base.name + " / " + (x + 1) + "-" + (y + 1)
        };
        interactables.push(tile);
        floorTargets.push(tile);
      }
      baseGroup.add(tile);
    }
  }
  const frame = createFloorOutline(base.rows + 0.16, base.cols + 0.16, base.id === snapshot.activeBaseId ? 0x72ffb8 : 0x2d8263);
  frame.material.depthTest = true;
  frame.material.depthWrite = false;
  frame.material.opacity = base.id === snapshot.activeBaseId ? 0.62 : 0.38;
  frame.renderOrder = -8;
  frame.position.set((base.rows - 1) / 2, 0.012, (base.cols - 1) / 2);
  baseGroup.add(frame);
  const accessPoint = snapshot.accessPoints?.find((entry) => entry.baseId === base.id && entry.type === "market_scooter");
  buildMarketAccessSlot(base, accessPoint, baseGroup);
  base.shelves.forEach((item) => buildEquipment(base, item, baseGroup));
  const floorDeviceGroups = new Map();
  base.floorDevices.filter((item) => item.placementLayer !== "tabletop").forEach((item) => {
    floorDeviceGroups.set(item.id, buildEquipment(base, item, baseGroup));
  });
  base.floorDevices.filter((item) => item.placementLayer === "tabletop").forEach((item) => {
    const host = base.floorDevices.find((candidate) => candidate.id === item.hostId);
    buildTabletopEquipment(base, item, host, floorDeviceGroups.get(item.hostId));
  });
  buildFurnitureSetMarkers(base, baseGroup);
  const coordinates = new Map(snapshot.bases.map((entry) => [entry.worldX + "," + entry.worldY, entry]));
  snapshot.directions.forEach((direction) => {
    if (base.reservedDirections?.includes(direction.id)) return;
    const neighbor = coordinates.get((base.worldX + direction.dx) + "," + (base.worldY + direction.dy));
    buildExpansionMarker(base, direction, baseGroup, Boolean(neighbor));
  });
}
function buildBaseLinks() {
  const byPosition = new Map(snapshot.bases.map((base) => [base.worldX + "," + base.worldY, base]));
  const seen = new Set();
  snapshot.bases.forEach((base) => snapshot.directions.forEach((direction) => {
    const neighbor = byPosition.get((base.worldX + direction.dx) + "," + (base.worldY + direction.dy));
    if (!neighbor) return;
    const key = [base.id, neighbor.id].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    const left = baseLayouts.get(base.id);
    const right = baseLayouts.get(neighbor.id);
    const edgePoint = (from, to) => {
      const dx = to.centerX - from.centerX;
      const dz = to.centerZ - from.centerZ;
      const halfX = from.rows / 2 + 0.08;
      const halfZ = from.cols / 2 + 0.08;
      const scale = 1 / Math.max(Math.abs(dx) / halfX, Math.abs(dz) / halfZ, 0.0001);
      return new THREE.Vector3(from.centerX + dx * scale, 0.035, from.centerZ + dz * scale);
    };
    const geometry = new THREE.BufferGeometry().setFromPoints([
      edgePoint(left, right),
      edgePoint(right, left)
    ]);
    const connector = new THREE.Line(geometry, new THREE.LineDashedMaterial({
      color: 0x35cfa0, transparent: true, opacity: 0.4,
      dashSize: 0.22, gapSize: 0.16, depthTest: true, depthWrite: false
    }));
    connector.renderOrder = -9;
    connector.computeLineDistances();
    world.add(connector);
  }));
}
function buildGroundGrid() {
  if (worldBounds.isEmpty()) return;
  const size = Math.max(24, Math.ceil(Math.max(worldBounds.max.x - worldBounds.min.x, worldBounds.max.z - worldBounds.min.z) + 14));
  const grid = new THREE.GridHelper(size, size * 2, 0x245f4b, 0x10291f);
  grid.position.set(worldCenter.x, -0.205, worldCenter.z);
  grid.material.transparent = true;
  grid.material.opacity = 0.24;
  world.add(grid);
}
function rebuildWorld() {
  if (!snapshot?.bases?.length) return;
  clearWorld();
  const maxRows = Math.max(...snapshot.bases.map((base) => base.rows), 1);
  const maxCols = Math.max(...snapshot.bases.map((base) => base.cols), 1);
  const spacingX = maxRows + BASE_GAP;
  const spacingZ = maxCols + BASE_GAP;
  worldBounds.makeEmpty();
  snapshot.bases.forEach((base) => {
    const offsetX = base.worldY * spacingX;
    const offsetZ = base.worldX * spacingZ;
    const layout = {
      offsetX, offsetZ,
      centerX: offsetX + (base.rows - 1) / 2,
      centerZ: offsetZ + (base.cols - 1) / 2,
      rows: base.rows, cols: base.cols
    };
    baseLayouts.set(base.id, layout);
    const outboundAccessExtent = base.reservedDirections?.includes("right") ? 2.05 : 0.4;
    worldBounds.expandByPoint(new THREE.Vector3(offsetX - 1.4, 0, offsetZ - 1.4));
    worldBounds.expandByPoint(new THREE.Vector3(offsetX + base.rows + 0.4, 2.5, offsetZ + base.cols + outboundAccessExtent));
  });
  worldBounds.getCenter(worldCenter);
  buildUndergroundCityBackdrop();
  buildGroundGrid();
  buildBaseLinks();
  snapshot.bases.forEach((base) => buildBase(base, baseLayouts.get(base.id)));
  world.updateMatrixWorld(true);
  flushPlantTransitions();
  hoverOutline = createFloorOutline(1, 1, 0xf5d65b);
  hoverOutline.visible = false;
  world.add(hoverOutline);
  updateRendererQuality();
}
function itemSignature(item) {
  const slots = item.slots.map((plant) => plant ? [plant.id, plant.crop, plant.stage, plant.ready ? 1 : 0, plant.dead ? 1 : 0, plant.quality].join(":") : "-").join(",");
  return [
    item.id, item.kind, item.type, item.x, item.y,
    item.width, item.height, item.baseWidth, item.baseHeight,
    normalizeQuarterTurn(item.rotationQuarter), Number(item.effectRadius) || 0,
    Math.round(item.dirt), Math.round(item.resourceStored * 10),
    item.talkPending ? 1 : 0, item.recoveryMode,
    item.placementLayer, item.surfaceType, item.surfaceSlots, item.hostId, item.surfaceSlot,
    slots
  ].join("/");
}
function stateSignature(next) {
  return [
    next.activeBaseId, next.selectedSeed,
    next.placement
      ? [
          next.placement.kind, next.placement.id,
          next.placement.width, next.placement.height,
          normalizeQuarterTurn(next.placement.rotationQuarter), Number(next.placement.effectRadius) || 0
        ].join(":")
      : "none",
    next.brokerUnlocked ? 1 : 0, next.lowSpec ? 1 : 0,
    ...(next.accessPoints || []).map((entry) => [entry.id, entry.baseId, entry.type, entry.available ? 1 : 0, entry.unseen ? 1 : 0].join(":")),
    ...next.bases.map((base) => [
      base.id, base.tier, base.cols, base.rows, base.worldX, base.worldY, base.blockedCells.join(";"), (base.reservedDirections || []).join(","),
      (base.furnitureSets || []).map((entry) => entry.id).join(","),
      ...base.shelves.map(itemSignature), ...base.floorDevices.map(itemSignature)
    ].join("|"))
  ].join("||");
}
function syncSnapshot(now = performance.now()) {
  if (!forceSync && now - lastSyncAt < SYNC_INTERVAL) return;
  lastSyncAt = now;
  forceSync = false;
  const next = bridge()?.snapshot?.();
  if (!next) return;
  const signature = stateSignature(next);
  const previousActiveBase = activeBaseId;
  capturePlantVisualTransitions(next);
  snapshot = next;
  syncOfficialPlantTutorial(next);
  refreshDynamicRobotSnapshots(next);
  activeBaseId = next.activeBaseId;
  if (signature !== snapshotSignature) {
    if (equipmentDragVisual?.dragging) return;
    snapshotSignature = signature;
    rebuildWorld();
  }
  const isFreshInitialBase = next.day === 1
    && next.bases.length === 1
    && next.bases[0].shelves.length === 0
    && next.bases[0].floorDevices.length === 0;
  if (!previousActiveBase) focusBase(activeBaseId, true, true);
  else if (previousActiveBase !== activeBaseId) {
    focusBase(activeBaseId, isFreshInitialBase, isFreshInitialBase);
  }
  loadingPanel?.classList.add("hidden");
}
function interactionAt(clientX, clientY, targets = interactables) {
  if (!canvas || !camera || !targets.length) return null;
  const rect = canvas.getBoundingClientRect();
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  const rawIntersections = raycaster.intersectObjects(targets, true).filter((hit) => hit.object.userData.interaction);
  const intersections = rawIntersections.filter((hit) => hitMatchesVisiblePixel(hit));
  if (!intersections.length) return null;
  const nearest = intersections[0].distance;
  const candidates = intersections.filter((hit) => hit.distance <= nearest + 0.72);
  candidates.sort((left, right) => {
    const priority = (right.object.userData.interaction.priority || 0) - (left.object.userData.interaction.priority || 0);
    return priority || left.distance - right.distance;
  });
  const hit = candidates[0];
  return { ...hit, interaction: hit.object.userData.interaction };
}
function floorAt(clientX, clientY) {
  const hit = interactionAt(clientX, clientY, floorTargets);
  return hit?.interaction?.type === "cell" ? hit : null;
}
function seedTargetAt(clientX, clientY) {
  const hit = interactionAt(clientX, clientY, equipmentTargets);
  return hit?.interaction?.item?.kind === "unit" ? hit : null;
}
function cleanTargetAt(clientX, clientY) {
  const hit = interactionAt(clientX, clientY, equipmentTargets);
  return hit?.interaction?.type === "equipment" ? hit : null;
}
function surfaceTargetAt(clientX, clientY, placement = null) {
  const hiddenObject = equipmentDragVisual?.dragging ? equipmentDragVisual.object : null;
  const wasVisible = hiddenObject?.visible;
  if (hiddenObject) hiddenObject.visible = false;
  const hit = cleanTargetAt(clientX, clientY);
  if (hiddenObject) hiddenObject.visible = wasVisible;
  if (!hit?.interaction?.item || !placement || placement.placementLayer === "floor") return null;
  const base = snapshot?.bases?.find((entry) => entry.id === hit.interaction.baseId);
  let host = hit.interaction.item;
  if (host.placementLayer !== "floor" && host.hostId) {
    host = base?.floorDevices?.find((entry) => entry.id === host.hostId) || null;
  }
  if (!host || host.surfaceType !== placement.placementLayer) return null;
  return {
    ...hit,
    interaction: {
      ...hit.interaction,
      id: host.id,
      kind: host.kind,
      item: host,
      label: `${host.name} / 卓上 ${host.surfaceSlots || 0}枠`,
      width: host.width,
      height: host.height
    }
  };
}
function canPlantInTarget(hit, cropId) {
  return Boolean(
    hit?.interaction?.item?.slots?.some((plant) => !plant)
    && snapshot?.seeds?.[cropId] > 0
  );
}
function showHover(hit, clientX, clientY, placement = null) {
  if (!hit?.interaction || !hoverOutline) return hideHover();
  if (canvas) delete canvas.dataset.farm3dStoreDrop;
  const interaction = hit.interaction;
  hoveredHit = hit;
  if (interaction.type === "cell" && !placement) return hideHover();
  setExpansionHover(["expansion", "access"].includes(interaction.type) ? interaction.hoverObject : null);
  let width = 0.72, depth = 0.72, position = hit.point.clone(), color = 0xf5d65b;
  let outlineShape = "rect";
  if (interaction.type === "cell") {
    width = placement?.height || 0.92;
    depth = placement?.width || 0.92;
    position = worldPositionForGrid(interaction.baseId, interaction.x + (depth - 1) / 2, interaction.y + (width - 1) / 2, 0.09);
    if (placement) {
      color = bridge()?.canPlace?.(
        interaction.baseId,
        interaction.x,
        interaction.y,
        placement.kind,
        placement.id,
        placement.rotationQuarter
      ) ? 0x72ffb8 : 0xff5b6e;
    }
  } else if (interaction.type === "equipment") {
    const item = interaction.item;
    if (item.placementLayer !== "floor") {
      width = 0.48;
      depth = 0.48;
      position = hit.point.clone();
      position.y = Math.max(0.98, position.y + 0.025);
    } else {
      width = interaction.height || 1;
      depth = interaction.width || 1;
      position = worldPositionForGrid(interaction.baseId, item.x + (item.width - 1) / 2, item.y + (item.height - 1) / 2, 0.1);
    }
  } else if (interaction.type === "slot") {
    interaction.hoverObject?.getWorldPosition(position);
    position.y += 0.035;
    color = 0x72ffb8;
    outlineShape = "circle";
  } else if (interaction.type === "expansion") {
    hoverOutline.visible = false;
  } else if (interaction.type === "access") {
    hoverOutline.visible = false;
  }
  if (!["expansion", "access"].includes(interaction.type)) {
    if (outlineShape === "circle") setOutlineCircle(interaction.empty ? 0.225 : 0.25);
    else setOutlineGeometry(width, depth);
    hoverOutline.material.color.setHex(color);
    hoverOutline.material.opacity = outlineShape === "circle" ? 0.78 : 0.95;
    hoverOutline.position.copy(position);
    hoverOutline.scale.setScalar(1);
    hoverOutline.visible = true;
  }
  if (hoverLabel && interaction.label) {
    const rect = canvas.getBoundingClientRect();
    hoverLabel.textContent = interaction.label;
    hoverLabel.dataset.hoverType = interaction.type;
    hoverLabel.style.left = clamp(clientX - rect.left + 12, 8, rect.width - 190) + "px";
    hoverLabel.style.top = clamp(clientY - rect.top + 14, 8, rect.height - 46) + "px";
    hoverLabel.classList.add("visible");
  } else hoverLabel?.classList.remove("visible");
}
function canvasContainsPoint(clientX, clientY) {
  if (!canvas) return false;
  const rect = canvas.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right
    && clientY >= rect.top && clientY <= rect.bottom;
}
function showStoreDropHint(clientX, clientY) {
  if (!canvas) return;
  clearDragCoverage();
  setExpansionHover(null);
  hoveredHit = null;
  if (hoverOutline) hoverOutline.visible = false;
  canvas.dataset.farm3dStoreDrop = "ready";
  if (!hoverLabel) return;
  const rect = canvas.getBoundingClientRect();
  hoverLabel.textContent = "STOCK // 拠点外へ収納";
  hoverLabel.dataset.hoverType = "storage";
  hoverLabel.style.left = clamp(clientX - rect.left + 12, 8, rect.width - 190) + "px";
  hoverLabel.style.top = clamp(clientY - rect.top + 14, 8, rect.height - 46) + "px";
  hoverLabel.classList.add("visible");
}
function screenPointToBaseCell(baseId, point) {
  const layout = baseLayouts.get(baseId);
  return layout ? { x: Math.round(point.z - layout.offsetZ), y: Math.round(point.x - layout.offsetX) } : null;
}
function wheelRotationStep(target, deltaY) {
  target.rotationWheelDelta = (Number(target.rotationWheelDelta) || 0) + Number(deltaY || 0);
  if (Math.abs(target.rotationWheelDelta) < 24) return 0;
  const step = target.rotationWheelDelta > 0 ? 1 : -1;
  target.rotationWheelDelta = 0;
  return step;
}
function rotateGridGrab(action, step) {
  const oldWidth = Math.max(1, Number(action.dragWidth) || 1);
  const oldHeight = Math.max(1, Number(action.dragHeight) || 1);
  const oldX = clamp(Number(action.grabOffsetX) || 0, 0, oldWidth - 1);
  const oldY = clamp(Number(action.grabOffsetY) || 0, 0, oldHeight - 1);
  if (step > 0) {
    action.grabOffsetX = oldHeight - 1 - oldY;
    action.grabOffsetY = oldX;
  } else {
    action.grabOffsetX = oldY;
    action.grabOffsetY = oldWidth - 1 - oldX;
  }
  action.dragWidth = oldHeight;
  action.dragHeight = oldWidth;
}
function refreshPlacePointer(action, clientX, clientY) {
  const placement = action?.placement;
  if (!placement) return;
  if (placement.placementLayer !== "floor") {
    const surfaceHit = surfaceTargetAt(clientX, clientY, placement);
    action.dropHit = surfaceHit;
    action.dropOrigin = null;
    action.validDrop = Boolean(surfaceHit && bridge()?.canPlaceOnSurface?.(
      surfaceHit.interaction.baseId,
      surfaceHit.interaction.id,
      placement.kind,
      placement.id
    ));
    if (!surfaceHit) {
      hideHover();
      return;
    }
    showHover(surfaceHit, clientX, clientY);
    hoverOutline.material.color.setHex(action.validDrop ? 0x72ffb8 : 0xff5b6e);
    return;
  }
  const floorHit = floorAt(clientX, clientY);
  action.dropHit = floorHit;
  action.dropOrigin = floorHit ? { x: floorHit.interaction.x, y: floorHit.interaction.y } : null;
  action.validDrop = Boolean(floorHit && bridge()?.canPlace?.(
    floorHit.interaction.baseId,
    floorHit.interaction.x,
    floorHit.interaction.y,
    placement.kind,
    placement.id,
    placement.rotationQuarter
  ));
  if (!floorHit) {
    hideHover();
    return;
  }
  showHover(floorHit, clientX, clientY, placement);
  hoverOutline.material.color.setHex(action.validDrop ? 0x72ffb8 : 0xff5b6e);
  showDragCoverage(
    floorHit.interaction.baseId,
    floorHit.interaction.x,
    floorHit.interaction.y,
    placement,
    action.validDrop
  );
}
function refreshItemDragPointer(action, clientX, clientY) {
  if (!action?.hit?.interaction?.item) return;
  updateEquipmentVisualDragTarget(clientX, clientY);
  const item = action.hit.interaction.item;
  action.storageCandidate = false;
  if (item.placementLayer !== "floor") {
    const surfaceHit = surfaceTargetAt(clientX, clientY, item);
    action.dropHit = surfaceHit;
    action.dropOrigin = null;
    action.validDrop = Boolean(surfaceHit && bridge()?.canPlaceOnSurface?.(
      surfaceHit.interaction.baseId,
      surfaceHit.interaction.id,
      item.kind,
      item.id
    ));
    if (surfaceHit) {
      showHover(surfaceHit, clientX, clientY);
      hoverOutline.material.color.setHex(action.validDrop ? 0x72ffb8 : 0xff5b6e);
    } else {
      action.storageCandidate = canvasContainsPoint(clientX, clientY)
        && !floorAt(clientX, clientY)
        && Boolean(bridge()?.canStoreEquipment?.(item.kind, item.id));
      if (action.storageCandidate) showStoreDropHint(clientX, clientY);
      else hideHover();
    }
    return;
  }
  const floorHit = floorAt(clientX, clientY);
  action.dropHit = floorHit;
  if (!floorHit) {
    action.dropOrigin = null;
    action.validDrop = false;
    action.storageCandidate = canvasContainsPoint(clientX, clientY)
      && Boolean(bridge()?.canStoreEquipment?.(item.kind, item.id));
    if (action.storageCandidate) showStoreDropHint(clientX, clientY);
    else hideHover();
    return;
  }
  const origin = {
    x: floorHit.interaction.x - action.grabOffsetX,
    y: floorHit.interaction.y - action.grabOffsetY
  };
  const preview = {
    ...item,
    width: action.dragWidth,
    height: action.dragHeight,
    rotationQuarter: action.rotationQuarter
  };
  action.dropOrigin = origin;
  action.validDrop = Boolean(bridge()?.canPlace?.(
    floorHit.interaction.baseId,
    origin.x,
    origin.y,
    item.kind,
    item.id,
    action.rotationQuarter
  ));
  const previewHit = {
    ...floorHit,
    interaction: { ...floorHit.interaction, x: origin.x, y: origin.y }
  };
  showHover(previewHit, clientX, clientY, preview);
  hoverOutline.material.color.setHex(action.validDrop ? 0x72ffb8 : 0xff5b6e);
  showDragCoverage(floorHit.interaction.baseId, origin.x, origin.y, preview, action.validDrop);
}
function rotateActiveCanvasDrag(deltaY) {
  const action = pointerAction;
  if (!action || !["item-drag", "place"].includes(action.mode)) return false;
  const activeItem = action.mode === "item-drag" ? action.hit?.interaction?.item : action.placement;
  if (activeItem?.placementLayer !== "floor") return true;
  const step = wheelRotationStep(action, deltaY);
  if (!step) return true;
  action.rotationQuarter = normalizeQuarterTurn(action.rotationQuarter + step);
  if (action.mode === "item-drag") {
    rotateGridGrab(action, step);
    const visual = equipmentDragVisual;
    if (visual?.dragging) {
      visual.rotationQuarter = action.rotationQuarter;
      visual.targetYaw += step * Math.PI / 2;
    }
    refreshItemDragPointer(action, action.lastX, action.lastY);
  } else {
    const size = rotatedFootprint(action.baseWidth, action.baseHeight, action.rotationQuarter);
    action.placement.rotationQuarter = action.rotationQuarter;
    action.placement.width = size.width;
    action.placement.height = size.height;
    refreshPlacePointer(action, action.lastX, action.lastY);
  }
  if (canvas) canvas.dataset.farm3dDragRotation = String(action.rotationQuarter);
  bridge()?.feedback?.("select");
  return true;
}
function updateStockGhostFootprint(drag) {
  if (!drag?.placement || !drag.ghost) return;
  drag.ghost.style.setProperty("--equipment-ghost-width", Math.min(210, 108 + (drag.placement.width - 1) * 34) + "px");
  drag.ghost.style.setProperty("--equipment-ghost-height", Math.min(150, 86 + (drag.placement.height - 1) * 20) + "px");
  drag.ghost.style.setProperty("--farm3d-ghost-rotation", normalizeQuarterTurn(drag.placement.rotationQuarter) * 90 + "deg");
}
function refreshStockEquipmentDrop(drag, clientX, clientY) {
  if (!drag?.moved || !drag.placement) return;
  drag.lastX = clientX;
  drag.lastY = clientY;
  const rect = canvas.getBoundingClientRect();
  const insideCanvas = clientX >= rect.left && clientX <= rect.right
    && clientY >= rect.top && clientY <= rect.bottom;
  const tabletop = drag.placement.placementLayer !== "floor";
  const hit = insideCanvas
    ? tabletop ? surfaceTargetAt(clientX, clientY, drag.placement) : floorAt(clientX, clientY)
    : null;
  drag.targetHit = hit;
  drag.dropOrigin = hit && !tabletop ? { x: hit.interaction.x, y: hit.interaction.y } : null;
  drag.valid = Boolean(hit && (tabletop
    ? bridge()?.canPlaceOnSurface?.(hit.interaction.baseId, hit.interaction.id, drag.kind, drag.id)
    : bridge()?.canPlace?.(
        hit.interaction.baseId,
        drag.dropOrigin.x,
        drag.dropOrigin.y,
        drag.kind,
        drag.id,
        drag.placement.rotationQuarter
      )));
  drag.ghost.classList.toggle("drop-valid", drag.valid);
  drag.ghost.classList.toggle("drop-invalid", !drag.valid);
  canvas.dataset.farm3dEquipmentDrag = drag.valid ? "valid" : "invalid";
  if (hit) {
    showHover(hit, clientX, clientY, tabletop ? null : drag.placement);
    hoverOutline.material.color.setHex(drag.valid ? 0x72ffb8 : 0xff5b6e);
    if (!tabletop) showDragCoverage(hit.interaction.baseId, drag.dropOrigin.x, drag.dropOrigin.y, drag.placement, drag.valid);
  } else hideHover();
}
function rotateStockEquipmentDrag(deltaY) {
  const drag = stockEquipmentDrag;
  if (!drag?.moved || !drag.placement) return false;
  if (drag.placement.placementLayer !== "floor") return true;
  const step = wheelRotationStep(drag, deltaY);
  if (!step) return true;
  drag.placement.rotationQuarter = normalizeQuarterTurn(drag.placement.rotationQuarter + step);
  const size = rotatedFootprint(
    Math.max(1, Number(drag.placement.baseWidth) || 1),
    Math.max(1, Number(drag.placement.baseHeight) || 1),
    drag.placement.rotationQuarter
  );
  drag.placement.width = size.width;
  drag.placement.height = size.height;
  updateStockGhostFootprint(drag);
  refreshStockEquipmentDrop(drag, drag.lastX, drag.lastY);
  if (canvas) canvas.dataset.farm3dDragRotation = String(drag.placement.rotationQuarter);
  bridge()?.feedback?.("select");
  return true;
}
function flushPlantTransitions() {
  if (!pendingPlantTransitions.length) return;
  const transitions = pendingPlantTransitions;
  pendingPlantTransitions = [];
  transitions.forEach((transition) => {
    const anchor = plantAnchors.get(transition.key);
    if (!anchor?.object) return;
    const position = anchor.object.getWorldPosition(new THREE.Vector3());
    position.y += 0.08;
    if (anchor.sprite) {
      anchor.sprite.userData.growthPulse = {
        startedAt: performance.now() / 1000,
        duration: transition.type === "ready" ? 1.08 : 0.86,
        ready: transition.type === "ready"
      };
    }
    const color = transition.type === "ready" ? 0xf5d65b : colorNumber(transition.color);
    spawnPulse(position, color);
    spawnBurst(position, color);
    spawnGrowthLift(position, color, transition.type === "ready");
  });
}
function spawnGrowthLift(position, color = 0x72ffb8, ready = false) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.position.y += 0.08;
  const rings = [];
  const ringCount = ready ? 3 : 2;
  for (let index = 0; index < ringCount; index += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.14 + index * 0.045, 0.018, 6, 28),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.86,
        depthWrite: false, depthTest: true
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = index * 0.12;
    group.add(ring);
    rings.push(ring);
  }
  scene.add(group);
  transientEffects.push({
    type: "growth-lift", object: group, rings,
    baseYs: rings.map((ring) => ring.position.y),
    ready, age: 0, duration: ready ? 1.15 : 0.9
  });
}
function spawnPulse(position, color = 0x72ffb8) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.26, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, depthTest: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(position);
  ring.position.y += 0.12;
  ring.renderOrder = 180;
  scene.add(ring);
  transientEffects.push({ type: "pulse", object: ring, age: 0, duration: 0.7 });
}
function spawnBurst(position, color = 0x72ffb8) {
  const count = snapshot?.lowSpec ? 8 : 16;
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let index = 0; index < count; index += 1) {
    const angle = index / count * Math.PI * 2 + Math.random() * 0.3;
    const speed = 0.7 + Math.random() * 1.15;
    velocities.push(new THREE.Vector3(Math.cos(angle) * speed, 1 + Math.random() * 1.2, Math.sin(angle) * speed));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: 0.11, transparent: true, opacity: 0.95, depthWrite: false }));
  points.position.copy(position);
  points.position.y += 0.35;
  scene.add(points);
  transientEffects.push({ type: "burst", object: points, velocities, age: 0, duration: 0.85 });
}
function spawnFloatingToolLabel(position, text, background, duration = 0.95) {
  const label = createTextSprite(text, background, 0.38);
  label.position.copy(position);
  label.position.y += 0.78;
  label.renderOrder = 220;
  scene.add(label);
  transientEffects.push({
    type: "tool-label",
    object: label,
    startX: label.position.x,
    startY: label.position.y,
    baseScale: label.scale.clone(),
    age: 0,
    duration
  });
}

function spawnMist(position) {
  const count = snapshot?.lowSpec ? 16 : 36;
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.08 + Math.random() * 0.28;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = Math.random() * 0.18;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
    velocities.push(new THREE.Vector3(
      Math.cos(angle) * (0.12 + Math.random() * 0.28),
      0.38 + Math.random() * 0.5,
      Math.sin(angle) * (0.12 + Math.random() * 0.28)
    ));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0x9ffff0,
      size: snapshot?.lowSpec ? 0.14 : 0.2,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      depthTest: false
    })
  );
  points.position.copy(position);
  points.position.y += 0.34;
  points.renderOrder = 210;
  scene.add(points);
  transientEffects.push({ type: "mist", object: points, velocities, age: 0, duration: 1.3 });
  spawnPulse(position, 0x69f5c1);
  spawnFloatingToolLabel(position, "育成", "#69f5c1", 1.05);
}

function getWaterDropletTexture() {
  if (waterDropletTexture) return waterDropletTexture;
  const source = document.createElement("canvas");
  source.width = 64;
  source.height = 64;
  const context = source.getContext("2d");
  const gradient = context.createRadialGradient(27, 23, 2, 32, 32, 29);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.18, "rgba(220,249,255,0.98)");
  gradient.addColorStop(0.56, "rgba(115,211,236,0.76)");
  gradient.addColorStop(0.82, "rgba(70,172,205,0.34)");
  gradient.addColorStop(1, "rgba(42,139,175,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  waterDropletTexture = new THREE.CanvasTexture(source);
  waterDropletTexture.colorSpace = THREE.SRGBColorSpace;
  waterDropletTexture.minFilter = THREE.LinearFilter;
  waterDropletTexture.magFilter = THREE.LinearFilter;
  return waterDropletTexture;
}

function getWaterSheetTexture() {
  if (waterSheetTexture) return waterSheetTexture;
  const source = document.createElement("canvas");
  source.width = 128;
  source.height = 64;
  const context = source.getContext("2d");
  const edgeFade = context.createLinearGradient(0, 0, 0, source.height);
  edgeFade.addColorStop(0, "rgba(150,229,244,0)");
  edgeFade.addColorStop(0.08, "rgba(126,218,237,0.2)");
  edgeFade.addColorStop(0.3, "rgba(183,239,249,0.72)");
  edgeFade.addColorStop(0.5, "rgba(232,252,255,0.9)");
  edgeFade.addColorStop(0.7, "rgba(160,231,245,0.66)");
  edgeFade.addColorStop(0.92, "rgba(89,195,219,0.18)");
  edgeFade.addColorStop(1, "rgba(72,174,204,0)");
  context.fillStyle = edgeFade;
  context.fillRect(0, 0, source.width, source.height);
  context.globalCompositeOperation = "destination-out";
  const random = createSeededRandom(0x51a7e);
  for (let index = 0; index < 16; index += 1) {
    const x = 20 + random() * 112;
    const y = 6 + random() * 52;
    const width = 7 + random() * 22;
    const height = 1.5 + random() * 4;
    context.fillStyle = `rgba(0,0,0,${0.16 + random() * 0.32})`;
    context.beginPath();
    context.ellipse(x, y, width, height, (random() - 0.5) * 0.22, 0, Math.PI * 2);
    context.fill();
  }
  context.globalCompositeOperation = "source-over";
  waterSheetTexture = new THREE.CanvasTexture(source);
  waterSheetTexture.colorSpace = THREE.SRGBColorSpace;
  waterSheetTexture.minFilter = THREE.LinearFilter;
  waterSheetTexture.magFilter = THREE.LinearFilter;
  return waterSheetTexture;
}

function createWaterFanGeometry(curve, fanAxis, segmentCount, widthSegments, spread = 1) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const phase = Math.random() * Math.PI * 2;
  for (let segment = 0; segment <= segmentCount; segment += 1) {
    const t = segment / segmentCount;
    const center = curve.getPoint(t);
    const body = Math.sin(t * Math.PI);
    const width = (0.05 + t * 0.82 + body * 0.2) * spread;
    center.y += Math.sin(t * 17 + phase) * body * 0.024 * spread;
    for (let acrossIndex = 0; acrossIndex <= widthSegments; acrossIndex += 1) {
      const across = acrossIndex / widthSegments * 2 - 1;
      const edgeFlutter = Math.sin(t * 23 + across * 4.3 + phase) * Math.abs(across) * 0.04 * body;
      const point = center.clone().addScaledVector(fanAxis, across * (width + edgeFlutter));
      point.y += Math.cos(t * 19 + across * 3 + phase) * body * 0.016;
      positions.push(point.x, point.y, point.z);
      uvs.push(t, acrossIndex / widthSegments);
    }
  }
  const rowWidth = widthSegments + 1;
  for (let segment = 0; segment < segmentCount; segment += 1) {
    for (let acrossIndex = 0; acrossIndex < widthSegments; acrossIndex += 1) {
      const a = segment * rowWidth + acrossIndex;
      const b = a + 1;
      const c = a + rowWidth;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function getDustParticleTexture() {
  if (dustParticleTexture) return dustParticleTexture;
  const source = document.createElement("canvas");
  source.width = 64;
  source.height = 64;
  const context = source.getContext("2d");
  const gradient = context.createRadialGradient(29, 27, 2, 32, 32, 29);
  gradient.addColorStop(0, "rgba(235,246,226,0.96)");
  gradient.addColorStop(0.2, "rgba(190,211,180,0.76)");
  gradient.addColorStop(0.58, "rgba(122,146,124,0.38)");
  gradient.addColorStop(1, "rgba(74,96,83,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  dustParticleTexture = new THREE.CanvasTexture(source);
  dustParticleTexture.colorSpace = THREE.SRGBColorSpace;
  dustParticleTexture.minFilter = THREE.LinearFilter;
  dustParticleTexture.magFilter = THREE.LinearFilter;
  return dustParticleTexture;
}

function getBrushStreakTexture() {
  if (brushStreakTexture) return brushStreakTexture;
  const source = document.createElement("canvas");
  source.width = 128;
  source.height = 32;
  const context = source.getContext("2d");
  const fade = context.createLinearGradient(0, 0, source.width, 0);
  fade.addColorStop(0, "rgba(137,239,201,0)");
  fade.addColorStop(0.14, "rgba(160,244,215,0.58)");
  fade.addColorStop(0.5, "rgba(215,255,240,0.76)");
  fade.addColorStop(0.86, "rgba(160,244,215,0.58)");
  fade.addColorStop(1, "rgba(137,239,201,0)");
  context.strokeStyle = fade;
  context.lineCap = "round";
  [8, 12, 16, 20, 24].forEach((y, index) => {
    context.globalAlpha = index % 2 ? 0.48 : 0.72;
    context.lineWidth = index % 2 ? 1.4 : 2;
    context.beginPath();
    context.moveTo(4, y);
    context.bezierCurveTo(34, y - 2, 88, y + 2, 124, y);
    context.stroke();
  });
  context.globalAlpha = 1;
  brushStreakTexture = new THREE.CanvasTexture(source);
  brushStreakTexture.colorSpace = THREE.SRGBColorSpace;
  brushStreakTexture.minFilter = THREE.LinearFilter;
  brushStreakTexture.magFilter = THREE.LinearFilter;
  return brushStreakTexture;
}

function spawnBrushScrub(position) {
  if (!scene || !camera) return;
  const lowSpec = Boolean(snapshot?.lowSpec);
  const group = new THREE.Group();
  group.position.copy(position);

  const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  cameraRight.y = 0;
  if (cameraRight.lengthSq() < 0.001) cameraRight.set(1, 0, 0);
  cameraRight.normalize();
  group.rotation.y = Math.atan2(-cameraRight.z, cameraRight.x);

  const brushRig = new THREE.Group();
  brushRig.position.set(-0.56, 0.055, 0);
  const brush = buildCleaningBrushModel();
  brush.scale.setScalar(0.46);
  brush.position.set(0.08, 0.01, 0);
  brush.rotation.y = Math.PI;
  brushRig.add(brush);
  group.add(brushRig);
  const brushMaterials = [];
  brush.traverse((child) => {
    (Array.isArray(child.material) ? child.material : [child.material]).filter(Boolean).forEach((material) => {
      material.transparent = true;
      material.depthWrite = false;
      material.userData.brushScrubOpacity = Number.isFinite(material.opacity) ? material.opacity : 1;
      brushMaterials.push(material);
    });
  });

  const dustCount = lowSpec ? 12 : 30;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustData = [];
  for (let index = 0; index < dustCount; index += 1) {
    dustPositions[index * 3 + 1] = -20;
    const side = index % 2 ? 1 : -1;
    dustData.push({
      delay: 0.11 + Math.random() * 0.58,
      originX: (Math.random() - 0.5) * 0.84,
      originZ: (Math.random() - 0.5) * 0.16,
      velocity: new THREE.Vector3(
        side * (0.48 + Math.random() * 0.9),
        0.42 + Math.random() * 0.78,
        (Math.random() - 0.5) * 0.65
      )
    });
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
    color: 0xb7cbb2,
    map: getDustParticleTexture(),
    alphaTest: 0.015,
    size: lowSpec ? 0.11 : 0.15,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending
  }));
  dust.renderOrder = 202;
  group.add(dust);

  const debrisCount = lowSpec ? 5 : 12;
  const debrisPositions = new Float32Array(debrisCount * 3);
  const debrisData = [];
  for (let index = 0; index < debrisCount; index += 1) {
    debrisPositions[index * 3 + 1] = -20;
    const angle = (Math.random() - 0.5) * Math.PI * 0.9;
    debrisData.push({
      delay: 0.16 + Math.random() * 0.46,
      originX: (Math.random() - 0.5) * 0.68,
      velocity: new THREE.Vector3(
        Math.sin(angle) * (0.55 + Math.random() * 0.72),
        0.34 + Math.random() * 0.5,
        Math.cos(angle) * (0.3 + Math.random() * 0.48)
      )
    });
  }
  const debrisGeometry = new THREE.BufferGeometry();
  debrisGeometry.setAttribute("position", new THREE.BufferAttribute(debrisPositions, 3));
  const debris = new THREE.Points(debrisGeometry, new THREE.PointsMaterial({
    color: 0x45594d,
    map: getDustParticleTexture(),
    alphaTest: 0.02,
    size: lowSpec ? 0.055 : 0.07,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false
  }));
  debris.renderOrder = 203;
  group.add(debris);

  const streakCount = lowSpec ? 2 : 4;
  const streaks = [];
  for (let index = 0; index < streakCount; index += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xa6f2d0,
      map: getBrushStreakTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    });
    const streak = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.18), material);
    streak.rotation.x = -Math.PI / 2;
    streak.position.set(0, 0.045 + index * 0.003, (index - (streakCount - 1) / 2) * 0.13);
    streak.scale.x = 0.12;
    streak.renderOrder = 199 + index;
    group.add(streak);
    streaks.push({ object: streak, revealAt: 0.15 + index * 0.13 });
  }

  const label = createTextSprite("清掃", "#2e7d5d", 0.38);
  label.position.set(0, 0.78, 0);
  label.material.opacity = 0;
  label.visible = false;
  label.renderOrder = 220;
  const labelScale = label.scale.clone();
  group.add(label);

  scene.add(group);
  transientEffects.push({
    type: "brush-scrub",
    object: group,
    brushRig,
    brushMaterials,
    dust,
    dustData,
    debris,
    debrisData,
    streaks,
    label,
    labelScale,
    age: 0,
    duration: lowSpec ? 0.9 : 1.08
  });
}

function spawnBucketWash(position) {
  if (!scene || !camera) return;
  const lowSpec = Boolean(snapshot?.lowSpec);
  const group = new THREE.Group();
  group.position.copy(position);

  const towardCamera = camera.position.clone().sub(position);
  towardCamera.y = 0;
  if (towardCamera.lengthSq() < 0.001) towardCamera.set(0.7, 0, 0.7);
  towardCamera.normalize();
  const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  cameraRight.y = 0;
  if (cameraRight.lengthSq() < 0.001) cameraRight.set(towardCamera.z, 0, -towardCamera.x);
  cameraRight.normalize();
  const source = cameraRight.clone().multiplyScalar(-1.18).addScaledVector(towardCamera, 0.18);
  source.y = 1.26;
  const impact = new THREE.Vector3(0, 0.1, 0);
  const control = source.clone().lerp(impact, 0.52);
  control.y += 0.58;
  const curve = new THREE.QuadraticBezierCurve3(source, control, impact);

  const bucketRig = new THREE.Group();
  bucketRig.position.copy(source);
  bucketRig.rotation.y = Math.atan2(impact.x - source.x, impact.z - source.z);
  const bucket = buildCleaningBucketModel();
  bucket.scale.setScalar(0.38);
  bucket.position.y = -0.31;
  bucketRig.add(bucket);
  group.add(bucketRig);
  const bucketMaterials = [];
  bucket.traverse((child) => {
    (Array.isArray(child.material) ? child.material : [child.material]).filter(Boolean).forEach((material) => {
      material.transparent = true;
      material.depthWrite = false;
      material.userData.bucketWashOpacity = Number.isFinite(material.opacity) ? material.opacity : 1;
      bucketMaterials.push(material);
    });
  });

  const streamSegments = lowSpec ? 9 : 17;
  const streamRadialSegments = lowSpec ? 2 : 5;
  const waterMaterial = new THREE.MeshPhongMaterial({
    color: 0x79d4ea,
    map: getWaterSheetTexture(),
    specular: 0xeaffff,
    shininess: 135,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide
  });
  const stream = new THREE.Mesh(
    createWaterFanGeometry(curve, cameraRight, streamSegments, streamRadialSegments, 1),
    waterMaterial
  );
  stream.geometry.setDrawRange(0, 0);
  stream.renderOrder = 194;
  group.add(stream);

  const highlightRadialSegments = lowSpec ? 1 : 3;
  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: 0xd8f8ff,
    map: getWaterSheetTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  const highlight = new THREE.Mesh(
    createWaterFanGeometry(curve, cameraRight, streamSegments, highlightRadialSegments, 0.42),
    highlightMaterial
  );
  highlight.position.y += 0.012;
  highlight.geometry.setDrawRange(0, 0);
  highlight.renderOrder = 195;
  group.add(highlight);

  const dropletCount = lowSpec ? 12 : 34;
  const dropletPositions = new Float32Array(dropletCount * 3);
  const dropletData = [];
  for (let index = 0; index < dropletCount; index += 1) {
    dropletPositions[index * 3] = source.x;
    dropletPositions[index * 3 + 1] = source.y;
    dropletPositions[index * 3 + 2] = source.z;
    const jitter = cameraRight.clone().multiplyScalar((Math.random() - 0.5) * 1.16);
    jitter.addScaledVector(towardCamera, (Math.random() - 0.5) * 0.12);
    jitter.y = (Math.random() - 0.5) * 0.18;
    dropletData.push({
      delay: 0.08 + Math.random() * 0.25,
      duration: 0.31 + Math.random() * 0.17,
      jitter
    });
  }
  const dropletGeometry = new THREE.BufferGeometry();
  dropletGeometry.setAttribute("position", new THREE.BufferAttribute(dropletPositions, 3));
  const droplets = new THREE.Points(dropletGeometry, new THREE.PointsMaterial({
    color: 0xcaf5ff,
    map: getWaterDropletTexture(),
    alphaTest: 0.02,
    size: lowSpec ? 0.075 : 0.095,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false
  }));
  droplets.renderOrder = 196;
  group.add(droplets);

  const waterMassGeometry = new THREE.SphereGeometry(1, lowSpec ? 6 : 12, lowSpec ? 4 : 8);
  const waterMassMaterial = new THREE.MeshPhongMaterial({
    color: 0x8bdcf0,
    specular: 0xf2fdff,
    shininess: 145,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false
  });
  const waterMasses = [];
  const waterMassCount = lowSpec ? 4 : 7;
  for (let index = 0; index < waterMassCount; index += 1) {
    const object = new THREE.Mesh(waterMassGeometry, waterMassMaterial);
    object.visible = false;
    object.renderOrder = 196;
    group.add(object);
    waterMasses.push({
      object,
      delay: 0.09 + Math.random() * 0.2,
      duration: 0.32 + Math.random() * 0.18,
      lateral: (index / Math.max(1, waterMassCount - 1) * 2 - 1) * (0.58 + Math.random() * 0.16),
      lift: (Math.random() - 0.5) * 0.1,
      width: 0.045 + Math.random() * 0.035,
      length: 0.13 + Math.random() * 0.13
    });
  }

  const sprayCount = lowSpec ? 22 : 58;
  const sprayPositions = new Float32Array(sprayCount * 3);
  const sprayVelocities = [];
  for (let index = 0; index < sprayCount; index += 1) {
    sprayPositions[index * 3] = impact.x;
    sprayPositions[index * 3 + 1] = impact.y;
    sprayPositions[index * 3 + 2] = impact.z;
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.9 + Math.random() * 1.85;
    sprayVelocities.push(new THREE.Vector3(
      Math.cos(angle) * speed,
      0.9 + Math.random() * 1.75,
      Math.sin(angle) * speed
    ));
  }
  const sprayGeometry = new THREE.BufferGeometry();
  sprayGeometry.setAttribute("position", new THREE.BufferAttribute(sprayPositions, 3));
  const spray = new THREE.Points(sprayGeometry, new THREE.PointsMaterial({
    color: 0x9ce8f7,
    map: getWaterDropletTexture(),
    alphaTest: 0.02,
    size: lowSpec ? 0.095 : 0.13,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false
  }));
  spray.renderOrder = 197;
  group.add(spray);

  const impactMassGeometry = new THREE.SphereGeometry(1, lowSpec ? 6 : 14, lowSpec ? 4 : 10);
  const impactMassMaterial = new THREE.MeshPhongMaterial({
    color: 0x8edff1,
    specular: 0xf5feff,
    shininess: 150,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false
  });
  const impactMasses = [];
  const impactMassCount = lowSpec ? 5 : 9;
  for (let index = 0; index < impactMassCount; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const horizontalSpeed = 1.1 + Math.random() * 1.75;
    const object = new THREE.Mesh(impactMassGeometry, impactMassMaterial);
    object.position.copy(impact);
    object.visible = false;
    object.renderOrder = 198;
    group.add(object);
    impactMasses.push({
      object,
      velocity: new THREE.Vector3(
        Math.cos(angle) * horizontalSpeed,
        1.05 + Math.random() * 1.75,
        Math.sin(angle) * horizontalSpeed
      ),
      width: 0.035 + Math.random() * 0.03,
      length: 0.18 + Math.random() * 0.16
    });
  }

  const splashRings = [0.19, 0.31].slice(0, lowSpec ? 1 : 2).map((radius, index) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, index ? 0.025 : 0.035, 7, lowSpec ? 24 : 40),
      new THREE.MeshPhongMaterial({
        color: index ? 0xd2f8ff : 0x75d9ed,
        specular: 0xffffff,
        shininess: 120,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(impact);
    ring.position.y += index * 0.035;
    ring.renderOrder = 193;
    group.add(ring);
    return ring;
  });

  const waterFilm = new THREE.Mesh(
    new THREE.CircleGeometry(0.48, lowSpec ? 18 : 32),
    new THREE.MeshPhongMaterial({
      color: 0x5ebed8,
      specular: 0xdfffff,
      shininess: 130,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    })
  );
  waterFilm.rotation.x = -Math.PI / 2;
  waterFilm.position.copy(impact);
  waterFilm.position.y -= 0.025;
  waterFilm.scale.set(0.15, 0.15, 0.15);
  waterFilm.renderOrder = 192;
  group.add(waterFilm);

  const label = createTextSprite("洗浄", "#297f9c", 0.38);
  label.position.set(0, 0.72, 0);
  label.material.opacity = 0;
  label.visible = false;
  label.renderOrder = 220;
  const labelScale = label.scale.clone();
  group.add(label);

  scene.add(group);
  transientEffects.push({
    type: "bucket-wash",
    object: group,
    bucketRig,
    bucketMaterials,
    source,
    curve,
    fanAxis: cameraRight.clone(),
    stream,
    highlight,
    streamSegments,
    streamRadialSegments,
    highlightRadialSegments,
    dropletData,
    droplets,
    waterMasses,
    waterMassMaterial,
    waterMassForward: new THREE.Vector3(0, 0, 1),
    spray,
    sprayVelocities,
    impactMasses,
    impactMassMaterial,
    impactMassForward: new THREE.Vector3(0, 0, 1),
    splashRings,
    waterFilm,
    label,
    labelScale,
    age: 0,
    duration: lowSpec ? 1.16 : 1.36,
    impactAt: 0.37
  });
}

function spawnShortCircuit(position) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.position.y += 0.5;
  const lines = [];
  const lowSpec = Boolean(snapshot?.lowSpec);
  const lineCount = lowSpec ? 4 : 8;
  const colors = [0x75f7ff, 0xf5d65b, 0xffffff, 0x48dbea, 0xff7f50];
  for (let index = 0; index < lineCount; index += 1) {
    const angle = index / lineCount * Math.PI * 2 + Math.random() * 0.45;
    const distance = 0.75 + Math.random() * 0.45;
    const points = [new THREE.Vector3(0, 0, 0)];
    for (let part = 1; part <= 4; part += 1) {
      const ratio = part / 4;
      points.push(new THREE.Vector3(
        Math.cos(angle) * distance * ratio + (Math.random() - 0.5) * 0.18,
        ratio * (0.25 + Math.random() * 0.35) + (Math.random() - 0.5) * 0.12,
        Math.sin(angle) * distance * ratio + (Math.random() - 0.5) * 0.18
      ));
    }
    const material = new THREE.LineBasicMaterial({
      color: colors[index % colors.length],
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      depthTest: false
    });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
    line.renderOrder = 215;
    group.add(line);
    lines.push(line);
  }
  const rings = [];
  const ringCount = lowSpec ? 1 : 3;
  for (let index = 0; index < ringCount; index += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.28 + index * 0.13, 0.018, 6, 36),
      new THREE.MeshBasicMaterial({
        color: index % 2 ? 0xf5d65b : 0x48dbea,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        depthTest: false
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.12 + index * 0.2;
    ring.renderOrder = 214;
    group.add(ring);
    rings.push(ring);
  }
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, lowSpec ? 6 : 10, lowSpec ? 4 : 8),
    new THREE.MeshBasicMaterial({ color: 0xeaffff, transparent: true, opacity: 0.96, depthWrite: false, depthTest: false })
  );
  flash.renderOrder = 216;
  group.add(flash);
  const light = lowSpec ? null : new THREE.PointLight(0x75f7ff, 3.4, 3.6, 2);
  if (light) group.add(light);
  scene.add(group);
  transientEffects.push({ type: "short", object: group, lines, rings, flash, light, age: 0, duration: 1.05 });
  spawnPulse(position, 0x48dbea);
  spawnBurst(position, 0xf5d65b);
  spawnFloatingToolLabel(position, "漏電", "#f5d65b", 1.25);
}

function spawnToolReject(position) {
  spawnPulse(position, 0xff5b6e);
  spawnBurst(position, 0xff5b6e);
  spawnFloatingToolLabel(position, "NG", "#ff5b6e", 0.95);
}
function disposeTransientObject(object) {
  const geometries = new Set();
  const materials = new Set();
  object?.traverse?.((child) => {
    if (child.geometry) geometries.add(child.geometry);
    (Array.isArray(child.material) ? child.material : [child.material])
      .filter(Boolean)
      .forEach((material) => materials.add(material));
  });
  scene.remove(object);
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach(disposeMaterial);
}
function updateTransientEffects(delta) {
  transientEffects = transientEffects.filter((effect) => {
    effect.age += delta;
    const progress = Math.min(1, effect.age / effect.duration);
    if (effect.type === "pulse") {
      effect.object.scale.setScalar(1 + progress * 4.2);
      effect.object.material.opacity = 1 - progress;
    } else if (effect.type === "growth-lift") {
      effect.rings.forEach((ring, index) => {
        const ringProgress = clamp(progress * 1.15 - index * 0.08, 0, 1);
        ring.position.y = effect.baseYs[index] + ringProgress * (effect.ready ? 0.78 : 0.58);
        ring.scale.setScalar(0.72 + ringProgress * (effect.ready ? 1.85 : 1.45));
        ring.material.opacity = (1 - ringProgress) * 0.88;
      });
    } else if (effect.type === "burst") {
      const attribute = effect.object.geometry.getAttribute("position");
      effect.velocities.forEach((velocity, index) => {
        velocity.y -= delta * 2.4;
        attribute.array[index * 3] += velocity.x * delta;
        attribute.array[index * 3 + 1] += velocity.y * delta;
        attribute.array[index * 3 + 2] += velocity.z * delta;
      });
      attribute.needsUpdate = true;
      effect.object.material.opacity = 1 - progress;
    } else if (effect.type === "mist") {
      const attribute = effect.object.geometry.getAttribute("position");
      effect.velocities.forEach((velocity, index) => {
        const drift = Math.sin(effect.age * 8 + index) * 0.08;
        attribute.array[index * 3] += (velocity.x + drift) * delta;
        attribute.array[index * 3 + 1] += velocity.y * delta;
        attribute.array[index * 3 + 2] += (velocity.z - drift) * delta;
        velocity.multiplyScalar(Math.exp(-delta * 1.4));
      });
      attribute.needsUpdate = true;
      effect.object.material.opacity = (1 - progress) * 0.8;
    } else if (effect.type === "brush-scrub") {
      const smooth = (value) => value * value * (3 - 2 * value);
      const brushIn = smooth(clamp(effect.age / 0.1, 0, 1));
      const brushOut = 1 - smooth(clamp((effect.age - 0.82) / 0.24, 0, 1));
      const scrubProgress = clamp((effect.age - 0.07) / 0.66, 0, 1);
      const stroke = Math.sin(scrubProgress * Math.PI * 6);
      const strokeSpeed = Math.cos(scrubProgress * Math.PI * 6);
      effect.brushRig.position.x = -0.56 + stroke * 0.54;
      effect.brushRig.position.y = 0.055 + Math.abs(strokeSpeed) * 0.018;
      effect.brushRig.rotation.y = stroke * 0.055;
      effect.brushRig.rotation.z = -stroke * 0.085;
      effect.brushMaterials.forEach((material) => {
        material.opacity = material.userData.brushScrubOpacity * brushIn * brushOut;
      });

      const dustAttribute = effect.dust.geometry.getAttribute("position");
      let visibleDust = 0;
      effect.dustData.forEach((data, index) => {
        const localAge = effect.age - data.delay;
        const offset = index * 3;
        if (localAge <= 0 || localAge >= 0.56) {
          dustAttribute.array[offset] = data.originX;
          dustAttribute.array[offset + 1] = -20;
          dustAttribute.array[offset + 2] = data.originZ;
          return;
        }
        dustAttribute.array[offset] = data.originX + data.velocity.x * localAge;
        dustAttribute.array[offset + 1] = 0.08 + data.velocity.y * localAge - 1.22 * localAge * localAge;
        dustAttribute.array[offset + 2] = data.originZ + data.velocity.z * localAge;
        visibleDust += 1;
      });
      dustAttribute.needsUpdate = true;
      const dustFade = 1 - smooth(clamp((effect.age - 0.68) / 0.3, 0, 1));
      effect.dust.material.opacity = visibleDust ? brushOut * dustFade * 0.7 : 0;

      const debrisAttribute = effect.debris.geometry.getAttribute("position");
      let visibleDebris = 0;
      effect.debrisData.forEach((data, index) => {
        const localAge = effect.age - data.delay;
        const offset = index * 3;
        if (localAge <= 0 || localAge >= 0.5) {
          debrisAttribute.array[offset] = data.originX;
          debrisAttribute.array[offset + 1] = -20;
          debrisAttribute.array[offset + 2] = 0;
          return;
        }
        debrisAttribute.array[offset] = data.originX + data.velocity.x * localAge;
        debrisAttribute.array[offset + 1] = 0.07 + data.velocity.y * localAge - 1.5 * localAge * localAge;
        debrisAttribute.array[offset + 2] = data.velocity.z * localAge;
        visibleDebris += 1;
      });
      debrisAttribute.needsUpdate = true;
      effect.debris.material.opacity = visibleDebris ? brushOut * dustFade * 0.84 : 0;

      effect.streaks.forEach((streak) => {
        const reveal = smooth(clamp((effect.age - streak.revealAt) / 0.16, 0, 1));
        const fade = 1 - smooth(clamp((effect.age - 0.74) / 0.28, 0, 1));
        streak.object.scale.x = 0.12 + reveal * 0.88;
        streak.object.material.opacity = reveal * fade * 0.34;
      });

      const labelIn = smooth(clamp((effect.age - 0.62) / 0.14, 0, 1));
      const labelOut = 1 - smooth(clamp((effect.age - 0.88) / 0.18, 0, 1));
      effect.label.visible = labelIn > 0;
      effect.label.material.opacity = labelIn * labelOut;
      effect.label.position.y = 0.7 + labelIn * 0.12;
      effect.label.scale.copy(effect.labelScale).multiplyScalar(0.76 + labelIn * 0.24);
    } else if (effect.type === "bucket-wash") {
      const smooth = (value) => value * value * (3 - 2 * value);
      const bucketIn = smooth(clamp(effect.age / 0.12, 0, 1));
      const bucketOut = 1 - smooth(clamp((effect.age - 0.8) / 0.24, 0, 1));
      const tip = smooth(clamp((effect.age - 0.025) / 0.2, 0, 1));
      const recover = smooth(clamp((effect.age - 0.58) / 0.24, 0, 1));
      effect.bucketRig.rotation.x = -1.48 * tip * (1 - recover);
      effect.bucketRig.rotation.z = -Math.sin(tip * Math.PI) * 0.16 + Math.sin(effect.age * 17) * 0.025 * (1 - progress);
      effect.bucketRig.position.copy(effect.source).addScaledVector(effect.fanAxis, -Math.sin(tip * Math.PI) * 0.09);
      effect.bucketRig.position.y += Math.sin(bucketIn * Math.PI) * 0.1;
      effect.bucketMaterials.forEach((material) => {
        material.opacity = material.userData.bucketWashOpacity * bucketIn * bucketOut;
      });

      const streamHead = clamp((effect.age - 0.08) / 0.27, 0, 1);
      const streamTail = clamp((effect.age - 0.34) / 0.3, 0, 1);
      const streamUnits = effect.streamRadialSegments * 6;
      const streamStart = Math.floor(streamTail * effect.streamSegments) * streamUnits;
      const streamEnd = Math.ceil(streamHead * effect.streamSegments) * streamUnits;
      effect.stream.geometry.setDrawRange(streamStart, Math.max(0, streamEnd - streamStart));
      const highlightUnits = effect.highlightRadialSegments * 6;
      const highlightStart = Math.floor(streamTail * effect.streamSegments) * highlightUnits;
      const highlightEnd = Math.ceil(streamHead * effect.streamSegments) * highlightUnits;
      effect.highlight.geometry.setDrawRange(highlightStart, Math.max(0, highlightEnd - highlightStart));
      const streamFade = 1 - smooth(clamp((effect.age - 0.54) / 0.24, 0, 1));
      effect.stream.material.opacity = streamHead * streamFade * 0.66;
      effect.highlight.material.opacity = streamHead * streamFade * 0.24;

      const dropletAttribute = effect.droplets.geometry.getAttribute("position");
      let visibleDroplets = 0;
      effect.dropletData.forEach((data, index) => {
        const t = (effect.age - data.delay) / data.duration;
        const offset = index * 3;
        if (t <= 0 || t >= 1) {
          dropletAttribute.array[offset] = effect.source.x;
          dropletAttribute.array[offset + 1] = -20;
          dropletAttribute.array[offset + 2] = effect.source.z;
          return;
        }
        const point = effect.curve.getPoint(t);
        const scatter = Math.sin(t * Math.PI);
        dropletAttribute.array[offset] = point.x + data.jitter.x * scatter;
        dropletAttribute.array[offset + 1] = point.y + data.jitter.y * scatter;
        dropletAttribute.array[offset + 2] = point.z + data.jitter.z * scatter;
        visibleDroplets += 1;
      });
      dropletAttribute.needsUpdate = true;
      effect.droplets.material.opacity = visibleDroplets ? 0.9 * streamFade : 0;

      let visibleWaterMasses = 0;
      effect.waterMasses.forEach((mass) => {
        const t = (effect.age - mass.delay) / mass.duration;
        if (t <= 0 || t >= 1) {
          mass.object.visible = false;
          return;
        }
        const body = Math.sin(t * Math.PI);
        const point = effect.curve.getPoint(t)
          .addScaledVector(effect.fanAxis, mass.lateral * body);
        point.y += mass.lift * body;
        const tangent = effect.curve.getTangent(t).normalize();
        mass.object.visible = true;
        mass.object.position.copy(point);
        mass.object.quaternion.setFromUnitVectors(effect.waterMassForward, tangent);
        const pulse = 0.78 + body * 0.5;
        mass.object.scale.set(
          mass.width * pulse,
          mass.width * pulse * 0.68,
          mass.length * (1 - t * 0.24)
        );
        visibleWaterMasses += 1;
      });
      effect.waterMassMaterial.opacity = visibleWaterMasses ? streamFade * 0.3 : 0;

      const impactProgress = clamp((effect.age - effect.impactAt) / 0.62, 0, 1);
      if (effect.age >= effect.impactAt) {
        const sprayAttribute = effect.spray.geometry.getAttribute("position");
        effect.sprayVelocities.forEach((velocity, index) => {
          velocity.y -= delta * 4.5;
          sprayAttribute.array[index * 3] += velocity.x * delta;
          sprayAttribute.array[index * 3 + 1] += velocity.y * delta;
          sprayAttribute.array[index * 3 + 2] += velocity.z * delta;
        });
        sprayAttribute.needsUpdate = true;
        effect.spray.material.opacity = (1 - impactProgress) * 0.92;
        effect.impactMasses.forEach((mass) => {
          mass.velocity.y -= delta * 4.8;
          mass.object.position.addScaledVector(mass.velocity, delta);
          const direction = mass.velocity.clone().normalize();
          mass.object.visible = impactProgress < 0.96;
          mass.object.quaternion.setFromUnitVectors(effect.impactMassForward, direction);
          const width = mass.width * (0.78 + impactProgress * 0.75);
          mass.object.scale.set(
            width,
            width * 0.62,
            mass.length * (0.65 + impactProgress * 0.82)
          );
        });
        effect.impactMassMaterial.opacity = Math.pow(1 - impactProgress, 0.72) * 0.4;
        effect.splashRings.forEach((ring, index) => {
          const ringProgress = clamp(impactProgress * 1.25 - index * 0.1, 0, 1);
          ring.scale.setScalar(0.45 + ringProgress * (index ? 2.35 : 1.9));
          ring.material.opacity = (1 - ringProgress) * (index ? 0.22 : 0.34);
        });
        const filmIn = smooth(clamp(impactProgress / 0.24, 0, 1));
        const filmOut = 1 - smooth(clamp((impactProgress - 0.55) / 0.45, 0, 1));
        effect.waterFilm.scale.set(0.2 + filmIn * 1.35, 0.2 + filmIn * 0.82, 1);
        effect.waterFilm.material.opacity = filmIn * filmOut * 0.32;
        const labelIn = smooth(clamp(impactProgress / 0.2, 0, 1));
        const labelOut = 1 - smooth(clamp((impactProgress - 0.62) / 0.38, 0, 1));
        effect.label.visible = true;
        effect.label.material.opacity = labelIn * labelOut;
        effect.label.position.y = 0.72 + impactProgress * 0.3;
        effect.label.scale.copy(effect.labelScale).multiplyScalar(0.72 + labelIn * 0.28);
      }
    } else if (effect.type === "short") {
      effect.object.rotation.y += delta * 7.8;
      const flicker = 0.45 + Math.abs(Math.sin(effect.age * 34)) * 0.55;
      effect.object.scale.setScalar(0.86 + Math.sin(effect.age * 31) * 0.14);
      effect.lines.forEach((line, index) => {
        line.material.opacity = (1 - progress) * flicker * (index % 2 ? 0.82 : 1);
      });
      effect.rings?.forEach((ring, index) => {
        const ringProgress = clamp(progress * 1.25 - index * 0.08, 0, 1);
        ring.scale.setScalar(0.7 + ringProgress * 2.35);
        ring.rotation.z += delta * (index % 2 ? -5.4 : 5.4);
        ring.material.opacity = (1 - ringProgress) * flicker * 0.86;
      });
      if (effect.flash) {
        effect.flash.scale.setScalar(0.65 + flicker * (1.8 - progress * 0.8));
        effect.flash.material.opacity = (1 - progress) * flicker;
      }
      if (effect.light) effect.light.intensity = (1 - progress) * flicker * 4.2;
    } else if (effect.type === "tool-label") {
      const intro = clamp(progress / 0.17, 0, 1);
      const settle = 1 + Math.sin(intro * Math.PI) * 0.18;
      const fade = progress < 0.72 ? 1 : (1 - progress) / 0.28;
      const glitch = intro < 1 ? Math.sin(effect.age * 74) * (1 - intro) * 0.035 : 0;
      effect.object.position.x = effect.startX + glitch;
      effect.object.position.y = effect.startY + progress * 0.34;
      effect.object.material.opacity = Math.min(1, intro * 2.4) * fade;
      effect.object.scale.copy(effect.baseScale).multiplyScalar((0.72 + intro * 0.28) * settle);
    }
    if (progress < 1) return true;
    disposeTransientObject(effect.object);
    return false;
  });
}
function activateInteraction(hit, clientX = null, clientY = null) {
  if (!hit?.interaction || snapshot?.blocked) return;
  const interaction = hit.interaction;
  const api = bridge();
  let success = false;
  if (interaction.type === "slot") {
    if (interaction.empty) return;
    success = api?.activateSlot?.(interaction.baseId, interaction.unitId, interaction.slotIndex);
  } else if (interaction.type === "equipment") {
    success = api?.activateEquipment?.(interaction.kind, interaction.id);
  } else if (interaction.type === "cell") {
    success = snapshot?.placement
      ? api?.placeSelected?.(interaction.baseId, interaction.x, interaction.y)
      : api?.focusBase?.(interaction.baseId);
  } else if (interaction.type === "expansion") {
    success = api?.openExpansion?.(interaction.baseId, interaction.directionId);
  } else if (interaction.type === "access") {
    success = api?.openAccessPoint?.(interaction.accessId, interaction.baseId, clientX, clientY);
  }
  if (success !== false) {
    spawnPulse(hit.point, interaction.type === "cell" && snapshot?.placement ? 0x72ffb8 : 0xf5d65b);
    spawnBurst(hit.point, interaction.type === "slot" ? 0x72ffb8 : 0x48dbea);
    api?.feedback?.(interaction.type === "cell" ? "place" : "select");
    forceSync = true;
  }
}
function beginPointerAction(event) {
  if (canvas) canvas.dataset.farm3dLastInput = "down:" + (event.pointerType || "unknown") + ":" + event.clientX + "," + event.clientY;
  if (!canvas || snapshot?.blocked) return;
  if (event.button === 0) bridge()?.closeEquipmentMenu?.();
  canvas.focus({ preventScroll: true });
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 2) {
    const points = [...activePointers.values()];
    gestureState = {
      centerX: (points[0].x + points[1].x) / 2,
      centerY: (points[0].y + points[1].y) / 2,
      distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
      cameraDistance: cameraState.distanceGoal
    };
    if (pointerAction?.mode === "item-drag") releaseEquipmentVisualDrag(false);
    pointerAction = null;
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const hit = interactionAt(event.clientX, event.clientY);
  const freeLookEnabled = navigationMode === "orbit";
  const pointerIsTouch = event.pointerType === "touch";
  const pointerNavigationMode = freeLookEnabled && (event.button === 2 || pointerIsTouch) ? "orbit" : "pan";
  let mode = pointerNavigationMode;
  if (snapshot?.placement && event.button === 0) mode = "place";
  else if (event.button === 0 && hit?.interaction?.type === "equipment" && !document.body.classList.contains("official-demo-mode")) mode = "item-pending";
  else if (event.button === 0 && hit && hit.interaction.type !== "cell") mode = "action-pending";
  pointerAction = {
    pointerId: event.pointerId, button: event.button, mode, navigationMode: pointerNavigationMode,
    startX: event.clientX, startY: event.clientY,
    lastX: event.clientX, lastY: event.clientY,
    moved: false, hit, grabOffsetX: 0, grabOffsetY: 0,
    dragWidth: 1, dragHeight: 1,
    baseWidth: 1, baseHeight: 1,
    rotationQuarter: 0, rotationWheelDelta: 0,
    placement: null,
    dropHit: null, dropOrigin: null, validDrop: false, storageCandidate: false
  };
  if (mode === "place") {
    pointerAction.placement = { ...snapshot.placement };
    pointerAction.baseWidth = Math.max(1, Number(snapshot.placement.baseWidth) || Number(snapshot.placement.width) || 1);
    pointerAction.baseHeight = Math.max(1, Number(snapshot.placement.baseHeight) || Number(snapshot.placement.height) || 1);
    pointerAction.rotationQuarter = normalizeQuarterTurn(snapshot.placement.rotationQuarter);
    pointerAction.dragWidth = snapshot.placement.width;
    pointerAction.dragHeight = snapshot.placement.height;
    refreshPlacePointer(pointerAction, event.clientX, event.clientY);
  }
  if (mode === "item-pending" && hit?.interaction?.type === "equipment") {
    const item = hit.interaction.item;
    pointerAction.baseWidth = Math.max(1, Number(item.baseWidth) || Number(item.width) || 1);
    pointerAction.baseHeight = Math.max(1, Number(item.baseHeight) || Number(item.height) || 1);
    pointerAction.dragWidth = Math.max(1, Number(item.width) || 1);
    pointerAction.dragHeight = Math.max(1, Number(item.height) || 1);
    pointerAction.rotationQuarter = normalizeQuarterTurn(item.rotationQuarter);
    const local = screenPointToBaseCell(hit.interaction.baseId, hit.point);
    if (local) {
      pointerAction.grabOffsetX = clamp(local.x - item.x, 0, item.width - 1);
      pointerAction.grabOffsetY = clamp(local.y - item.y, 0, item.height - 1);
    }
  }
  canvas.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}
function panCamera(deltaX, deltaY) {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
  const scale = cameraState.distanceGoal * 0.0017;
  cameraState.targetGoal.addScaledVector(right, -deltaX * scale);
  cameraState.targetGoal.addScaledVector(forward, deltaY * scale);
  constrainCameraGoal();
}
function refreshCameraTravelLimits() {
  if (worldBounds.isEmpty()) {
    cameraTravelLimits.minX = Number.NEGATIVE_INFINITY;
    cameraTravelLimits.maxX = Number.POSITIVE_INFINITY;
    cameraTravelLimits.minZ = Number.NEGATIVE_INFINITY;
    cameraTravelLimits.maxZ = Number.POSITIVE_INFINITY;
    cameraTravelLimits.maxDistance = CAMERA_MAX_DISTANCE;
    return cameraTravelLimits;
  }
  worldBounds.getSize(cameraBoundsSize);
  const marginX = clamp(cameraBoundsSize.x * 0.18 + 1.2, 2, 6);
  const marginZ = clamp(cameraBoundsSize.z * 0.18 + 1.2, 2, 6);
  cameraTravelLimits.minX = worldBounds.min.x - marginX;
  cameraTravelLimits.maxX = worldBounds.max.x + marginX;
  cameraTravelLimits.minZ = worldBounds.min.z - marginZ;
  cameraTravelLimits.maxZ = worldBounds.max.z + marginZ;
  cameraTravelLimits.maxDistance = clamp(
    Math.max(cameraBoundsSize.x, cameraBoundsSize.z) * 1.45 + 6,
    15,
    68
  );
  return cameraTravelLimits;
}
function constrainCameraGoal() {
  const limits = refreshCameraTravelLimits();
  cameraState.targetGoal.x = clamp(cameraState.targetGoal.x, limits.minX, limits.maxX);
  cameraState.targetGoal.y = 0.35;
  cameraState.targetGoal.z = clamp(cameraState.targetGoal.z, limits.minZ, limits.maxZ);
  cameraState.distanceGoal = clamp(cameraState.distanceGoal, CAMERA_MIN_DISTANCE, limits.maxDistance);
  return limits;
}
function updatePointerAction(event) {
  if (canvas) canvas.dataset.farm3dLastInput = "move:" + (event.pointerType || "unknown") + ":" + event.clientX + "," + event.clientY;
  if (!activePointers.has(event.pointerId)) return;
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (gestureState && activePointers.size >= 2) {
    const points = [...activePointers.values()];
    const centerX = (points[0].x + points[1].x) / 2;
    const centerY = (points[0].y + points[1].y) / 2;
    const distance = Math.max(16, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y));
    panCamera(centerX - gestureState.centerX, centerY - gestureState.centerY);
    const limits = refreshCameraTravelLimits();
    cameraState.distanceGoal = clamp(gestureState.cameraDistance * gestureState.distance / distance, CAMERA_MIN_DISTANCE, limits.maxDistance);
    gestureState.centerX = centerX;
    gestureState.centerY = centerY;
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (!pointerAction || pointerAction.pointerId !== event.pointerId) return;
  const deltaX = event.clientX - pointerAction.lastX;
  const deltaY = event.clientY - pointerAction.lastY;
  const pointerDistance = Math.hypot(event.clientX - pointerAction.startX, event.clientY - pointerAction.startY);
  const activationDistance = pointerAction.mode === "item-pending" ? 3 : 5;
  if (pointerDistance > activationDistance) pointerAction.moved = true;
  if (pointerAction.mode === "item-pending" && pointerAction.moved) {
    pointerAction.mode = "item-drag";
    beginEquipmentVisualDrag(pointerAction);
  }
  if (pointerAction.mode === "action-pending" && pointerAction.moved) pointerAction.mode = pointerAction.navigationMode;
  if (pointerAction.mode === "orbit") {
    cameraState.yawGoal -= deltaX * 0.006;
    cameraState.pitchGoal = clamp(cameraState.pitchGoal + deltaY * 0.0055, 0.24, 1.36);
  } else if (pointerAction.mode === "pan") {
    panCamera(deltaX, deltaY);
  } else if (pointerAction.mode === "place") {
    refreshPlacePointer(pointerAction, event.clientX, event.clientY);
  } else if (pointerAction.mode === "item-drag") {
    refreshItemDragPointer(pointerAction, event.clientX, event.clientY);
  }
  pointerAction.lastX = event.clientX;
  pointerAction.lastY = event.clientY;
  event.preventDefault();
  event.stopPropagation();
}
function finishPointerAction(event) {
  activePointers.delete(event.pointerId);
  if (gestureState) {
    if (activePointers.size < 2) gestureState = null;
    pointerAction = null;
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (!pointerAction || pointerAction.pointerId !== event.pointerId) return;
  const action = pointerAction;
  pointerAction = null;
  if (action.button === 2 && action.moved) contextMenuSuppressedUntil = performance.now() + 400;
  if (action.mode === "item-drag") {
    let success = false;
    const item = action.hit.interaction.item;
    const tabletop = item.placementLayer !== "floor";
    if (action.storageCandidate) {
      success = Boolean(bridge()?.storeEquipment?.(item.kind, item.id));
      if (success) {
        releaseEquipmentVisualDrag(true);
        bridge()?.feedback?.("store");
        forceSync = true;
      }
    } else if (action.validDrop && action.dropHit && (tabletop || action.dropOrigin)) {
      success = Boolean(tabletop
        ? bridge()?.moveEquipmentToSurface?.(
            item.kind,
            item.id,
            action.dropHit.interaction.baseId,
            action.dropHit.interaction.id
          )
        : bridge()?.moveEquipment?.(
            item.kind,
            item.id,
            action.dropHit.interaction.baseId,
            action.dropOrigin.x,
            action.dropOrigin.y,
            action.rotationQuarter
          ));
      if (success) {
        releaseEquipmentVisualDrag(true);
        spawnPulse(action.dropHit.point, 0x72ffb8);
        spawnBurst(action.dropHit.point, 0x72ffb8);
        bridge()?.feedback?.("place");
        forceSync = true;
      }
    }
    if (!success) releaseEquipmentVisualDrag(false);
  } else if (action.mode === "place" && action.validDrop && action.dropHit) {
    const tabletop = action.placement?.placementLayer !== "floor";
    const success = tabletop
      ? bridge()?.placeSelectedOnSurface?.(
          action.dropHit.interaction.baseId,
          action.dropHit.interaction.id
        )
      : action.dropOrigin && bridge()?.placeSelected?.(
          action.dropHit.interaction.baseId,
          action.dropOrigin.x,
          action.dropOrigin.y,
          action.rotationQuarter
        );
    if (success !== false) {
      spawnPulse(action.dropHit.point, 0x72ffb8);
      spawnBurst(action.dropHit.point, 0x72ffb8);
      bridge()?.feedback?.("place");
      forceSync = true;
    }
  } else if (action.mode === "place") {
    if (action.placement?.placementLayer !== "floor" && action.dropHit) {
      bridge()?.setStatus?.("この机の卓上スロットは埋まっています。");
    }
  } else if (action.button === 0 && !action.moved && action.hit) {
    activateInteraction(action.hit, event.clientX, event.clientY);
  }
  hideHover();
  event.preventDefault();
  event.stopPropagation();
}
function cancelPointerAction(event) {
  activePointers.delete(event.pointerId);
  if (!activePointers.size) gestureState = null;
  if (pointerAction?.pointerId === event.pointerId) {
    if (pointerAction.mode === "item-drag") releaseEquipmentVisualDrag(false);
    pointerAction = null;
  }
  hideHover();
}
function handlePointerHover(event) {
  if (pointerAction || activePointers.size) return;
  const hit = interactionAt(event.clientX, event.clientY);
  showHover(hit, event.clientX, event.clientY, snapshot?.placement || null);
  const hoverType = hit?.interaction?.type;
  const hoverIsAction = hoverType === "equipment"
    || hoverType === "expansion"
    || hoverType === "access"
    || (hoverType === "slot" && !hit?.interaction?.empty);
  canvas.style.cursor = snapshot?.placement
    ? "crosshair"
    : hoverIsAction
      ? "pointer"
      : "grab";
}
function handleContextMenu(event) {
  event.preventDefault();
  event.stopPropagation();
  const rightDragActive = pointerAction?.button === 2 && pointerAction.moved;
  if (rightDragActive || performance.now() < contextMenuSuppressedUntil) return;
  const hit = interactionAt(event.clientX, event.clientY);
  if (hit?.interaction?.type === "equipment" && hit.interaction.item?.type !== "support_robot") {
    bridge()?.openEquipmentMenu?.(hit.interaction.kind, hit.interaction.id, event.clientX, event.clientY, 1);
  }
}
function updateCamera(delta) {
  const limits = constrainCameraGoal();
  const damping = 1 - Math.exp(-delta * 9.5);
  cameraState.target.lerp(cameraState.targetGoal, damping);
  cameraState.target.x = clamp(cameraState.target.x, limits.minX, limits.maxX);
  cameraState.target.y = 0.35;
  cameraState.target.z = clamp(cameraState.target.z, limits.minZ, limits.maxZ);
  cameraState.yaw += (cameraState.yawGoal - cameraState.yaw) * damping;
  cameraState.pitch += (cameraState.pitchGoal - cameraState.pitch) * damping;
  cameraState.distance += (cameraState.distanceGoal - cameraState.distance) * damping;
  const horizontal = Math.cos(cameraState.pitch) * cameraState.distance;
  camera.position.set(
    cameraState.target.x + Math.sin(cameraState.yaw) * horizontal,
    cameraState.target.y + Math.sin(cameraState.pitch) * cameraState.distance,
    cameraState.target.z + Math.cos(cameraState.yaw) * horizontal
  );
  camera.lookAt(cameraState.target);
}
function focusBase(baseId, immediate = false, useInitialComposition = false) {
  const layout = baseLayouts.get(baseId);
  if (!layout) return;
  cameraState.targetGoal.set(layout.centerX, 0.35, layout.centerZ);
  const officialInitialComposition = document.body.classList.contains("official-demo-mode") && useInitialComposition;
  if (useInitialComposition && !officialInitialComposition) cameraState.targetGoal.add(INITIAL_CAMERA_TARGET_OFFSET);
  const limits = constrainCameraGoal();
  const fittedDistance = Math.max(layout.rows, layout.cols) * 1.1 + 3.8;
  const officialInitialDistance = officialInitialComposition
    ? 6.2
    : fittedDistance;
  cameraState.distanceGoal = clamp(officialInitialDistance, CAMERA_MIN_DISTANCE, limits.maxDistance);
  if (immediate) {
    cameraState.target.copy(cameraState.targetGoal);
    cameraState.distance = cameraState.distanceGoal;
  }
}
function fitAll(immediate = false) {
  if (worldBounds.isEmpty()) return;
  const size = new THREE.Vector3();
  worldBounds.getSize(size);
  cameraState.targetGoal.copy(worldCenter);
  cameraState.targetGoal.y = 0.35;
  const limits = constrainCameraGoal();
  cameraState.distanceGoal = clamp(Math.max(size.x, size.z) * 1.28 + 5.8, CAMERA_MIN_DISTANCE, limits.maxDistance);
  if (immediate) {
    cameraState.target.copy(cameraState.targetGoal);
    cameraState.distance = cameraState.distanceGoal;
  }
}
function updateSpriteSizing() {
  world?.traverse((object) => {
    const sizing = object.userData?.spriteSizing;
    const image = object.material?.map?.image;
    if (!sizing || sizing.applied || !image?.width || !image?.height) return;
    const aspect = image.width / image.height;
    object.scale.set(Math.min(sizing.maxWidth, sizing.height * aspect), sizing.height, 1);
    if (object.userData.plantBaseScale) object.userData.plantBaseScale.copy(object.scale);
    sizing.applied = true;
  });
}
function growLightRandom(entry) {
  entry.randomState = (Math.imul(entry.randomState, 1664525) + 1013904223) >>> 0;
  return entry.randomState / 0x100000000;
}
function scheduleGrowLightFlicker(entry, elapsed, initial = false) {
  const delay = initial
    ? 1.2 + growLightRandom(entry) * 2.8
    : 2.8 + growLightRandom(entry) * 6.5;
  entry.nextFlickerAt = elapsed + delay;
  entry.flickerStartedAt = null;
}
function updateGrowLightFlicker(entry, elapsed) {
  if (entry.nextFlickerAt === null) scheduleGrowLightFlicker(entry, elapsed, true);
  if (entry.flickerStartedAt === null && elapsed >= entry.nextFlickerAt) {
    entry.flickerStartedAt = elapsed;
    entry.flickerMode = growLightRandom(entry) < 0.58 ? "double" : "single";
  }

  let level = 1;
  if (entry.flickerStartedAt !== null) {
    const age = elapsed - entry.flickerStartedAt;
    if (entry.flickerMode === "double") {
      if (age < 0.036) level = 0.14;
      else if (age < 0.072) level = 0.84;
      else if (age < 0.112) level = 0.05;
      else if (age < 0.154) level = 0.58;
      else if (age < 0.205) level = 1;
      else scheduleGrowLightFlicker(entry, elapsed);
    } else if (age < 0.048) level = 0.18;
    else if (age < 0.086) level = 0.68;
    else if (age < 0.13) level = 1;
    else scheduleGrowLightFlicker(entry, elapsed);
  }

  entry.currentLevel = level;
  const visibleLevel = 0.07 + level * 0.93;
  entry.lampMaterial.color.copy(entry.baseLampColor).multiplyScalar(visibleLevel);
  entry.volumeMaterial.uniforms.peakOpacity.value = entry.basePeakOpacity * visibleLevel;
}
function updateAnimations(elapsed) {
  updateUndergroundCityBackdrop(elapsed);
  let activeGrowthPulses = 0;
  animatedObjects.forEach((entry) => {
    const wave = elapsed + entry.phase;
    if (entry.type === "robot") {
      updateRobotAnimation(entry, elapsed);
    } else if (entry.type === "grow-light") {
      updateGrowLightFlicker(entry, elapsed);
    } else if (entry.type === "marker") {
      entry.object.position.y = entry.baseY + Math.sin(wave * 2.8) * 0.08;
      entry.object.position.x = entry.baseX + (Math.sin(wave * 19) > 0.94 ? Math.sin(wave * 83) * 0.018 : 0);
      const scale = 1 + Math.sin(wave * 3.4) * 0.06;
      entry.object.scale.set(entry.scaleX * scale, entry.scaleY * scale, 1);
      entry.object.material.opacity = 0.88 + (Math.sin(wave * 7.2) * 0.5 + 0.5) * 0.12;
    } else if (entry.type === "talk-bubble") {
      entry.object.position.y = entry.baseY + Math.sin(wave * 2.45) * 0.1;
      entry.object.position.x = entry.baseX + Math.sin(wave * 1.7) * 0.025;
      entry.object.material.rotation = Math.sin(wave * 1.85) * 0.035;
      const scale = 1 + (Math.sin(wave * 3.1) * 0.5 + 0.5) * 0.075;
      entry.object.scale.set(entry.scaleX * scale, entry.scaleY * scale, 1);
      entry.object.material.opacity = 0.94 + (Math.sin(wave * 4.8) * 0.5 + 0.5) * 0.06;
    } else if (entry.type === "plant" || entry.type === "ready-plant") {
      const baseScale = entry.object.userData.plantBaseScale;
      const anticipationWave = entry.growing ? Math.sin(wave * 1.25) * 0.5 + 0.5 : 0;
      const anticipation = anticipationWave * anticipationWave * (3 - 2 * anticipationWave);
      const anticipationWidth = 1 + anticipation * 0.012;
      const anticipationHeight = 1 + anticipation * 0.032;
      const pulse = entry.object.userData.growthPulse;
      let displayedHeightScale = anticipationHeight;
      if (baseScale && pulse) {
        const progress = clamp((elapsed - pulse.startedAt) / pulse.duration, 0, 1);
        const envelope = 1 - progress;
        const swell = Math.sin(Math.PI * progress) * (pulse.ready ? 0.22 : 0.17);
        const surge = Math.pow(Math.sin(progress * Math.PI * 3), 2) * envelope * (pulse.ready ? 0.04 : 0.028);
        const widthScale = 1 + swell * 0.08 + surge * 0.18;
        const heightScale = 1 + swell + surge;
        displayedHeightScale *= heightScale;
        entry.object.scale.set(
          baseScale.x * anticipationWidth * widthScale,
          baseScale.y * displayedHeightScale,
          baseScale.z
        );
        activeGrowthPulses += 1;
        if (progress >= 1) delete entry.object.userData.growthPulse;
      } else if (baseScale) {
        entry.object.scale.set(
          baseScale.x * anticipationWidth,
          baseScale.y * anticipationHeight,
          baseScale.z
        );
      }
      if (entry.type === "ready-plant") {
        entry.object.position.y = entry.baseY + Math.sin(wave * 3.6) * 0.045;
      } else {
        entry.object.position.y = entry.baseY + (baseScale ? baseScale.y * (displayedHeightScale - 1) * 0.5 : 0);
      }
      entry.object.getWorldPosition(billboardWorldPosition);
      entry.object.rotation.y = Math.atan2(
        camera.position.x - billboardWorldPosition.x,
        camera.position.z - billboardWorldPosition.z
      ) - (entry.parentYaw || 0);
    } else if (entry.type === "ready-ring") {
      const scale = 0.88 + (Math.sin(wave * 3.2) * 0.5 + 0.5) * 0.38;
      entry.object.scale.setScalar(scale);
      entry.object.material.opacity = 0.35 + (Math.sin(wave * 3.2) * 0.5 + 0.5) * 0.5;
    } else if (entry.type === "ready-beacon") {
      const pulse = Math.sin(wave * 4.2) * 0.5 + 0.5;
      entry.object.position.y = entry.baseY + Math.sin(wave * 2.8) * 0.045;
      entry.halo.scale.setScalar(0.88 + pulse * 0.34);
      entry.halo.material.opacity = 0.48 + pulse * 0.46;
      entry.diamond.rotation.y = wave * 1.8;
      entry.diamond.rotation.x = Math.sin(wave * 1.4) * 0.22;
      entry.diamond.scale.setScalar(0.86 + pulse * 0.26);
      if (entry.label) entry.label.material.opacity = 0.84 + pulse * 0.16;
    } else if (entry.type === "dirty-equipment") {
      const grimePulse = Math.sin(wave * 1.55) * 0.5 + 0.5;
      entry.stain.material.opacity = 0.18 + grimePulse * 0.14;

      entry.motes.rotation.y = wave * 0.12;
      entry.motes.position.y = Math.sin(wave * 0.8) * 0.025;
      entry.patches.forEach((patch, index) => {
        patch.position.y = entry.patchBaseYs[index] + Math.sin(wave * 0.9 + index * 1.7) * 0.018;
        patch.material.opacity = 0.46 + grimePulse * 0.2 - index * 0.04;
      });
    } else if (entry.type === "resource-ready") {
      const pulse = Math.sin(wave * 3.6) * 0.5 + 0.5;
      const scanProgress = (elapsed * 0.58 + entry.phase / (Math.PI * 2)) % 1;
      entry.groundRing.scale.setScalar(0.9 + pulse * 0.28);
      entry.groundRing.material.opacity = 0.38 + pulse * 0.5;
      entry.scanRing.position.y = 0.38 + scanProgress * 0.98;
      entry.scanRing.scale.setScalar(0.82 + scanProgress * 0.46);
      entry.scanRing.material.opacity = (1 - scanProgress) * 0.82;
      entry.diamond.position.y = 1.48 + Math.sin(wave * 3.2) * 0.07;
      entry.diamond.rotation.y = wave * 2.2;
      entry.diamond.rotation.x = Math.sin(wave * 1.7) * 0.28;
      entry.diamond.scale.setScalar(0.9 + pulse * 0.34);
      entry.label.position.y = 1.94 + Math.sin(wave * 2.4) * 0.035;
      entry.label.scale.copy(entry.labelBaseScale).multiplyScalar(0.97 + pulse * 0.07);
      entry.label.material.opacity = 0.88 + pulse * 0.12;
    } else if (entry.type === "production") {
      entry.object.children.forEach((ring, index) => {
        const phase = (elapsed * 0.72 + index / 3) % 1;
        ring.scale.setScalar(0.65 + phase * 1.6);
        ring.material.opacity = (1 - phase) * 0.62;
        ring.rotation.z = elapsed * (index % 2 ? -0.7 : 0.7);
      });
    } else if (entry.type === "market-access") {
      const hovered = Boolean(entry.object.userData.farm3dHovered);
      const pulse = Math.sin(wave * 2.7) * 0.5 + 0.5;
      const targetScale = hovered ? 0.87 : 0.82;
      const nextScale = entry.scooter.scale.x + (targetScale - entry.scooter.scale.x) * 0.14;
      entry.scooter.scale.setScalar(nextScale);
      if (entry.headlight) entry.headlight.scale.setScalar(0.9 + pulse * (hovered ? 0.42 : 0.22));
      if (entry.tailLight) entry.tailLight.scale.setScalar(0.94 + pulse * 0.14);
      if (entry.label) {
        const targetOpacity = hovered ? 0.9 + pulse * 0.1 : 0;
        entry.label.material.opacity += (targetOpacity - entry.label.material.opacity) * 0.22;
        entry.label.visible = hovered || entry.label.material.opacity > 0.025;
        entry.label.scale.copy(entry.labelBaseScale).multiplyScalar(hovered ? 0.94 + pulse * 0.08 : 0.86);
      }
      if (entry.unseenMarker) {
        entry.unseenMarker.position.y = 1.65 + Math.sin(wave * 3.1) * 0.045;
        entry.unseenMarker.rotation.y = wave * 1.8;
        entry.unseenMarker.scale.setScalar(0.9 + pulse * 0.22);
      }
    } else if (entry.type === "expansion") {
      const hovered = Boolean(entry.object.userData.farm3dHovered);
      const targetScale = hovered ? 1.16 : 1;
      const nextScale = entry.object.scale.x + (targetScale - entry.object.scale.x) * 0.18;
      entry.object.scale.setScalar(nextScale);
      entry.object.position.y = entry.baseY + Math.sin(wave * 2.2) * 0.025;
      entry.material.opacity += ((hovered ? 1 : 0.86) - entry.material.opacity) * 0.18;
      entry.material.color.lerp(hovered ? entry.hoverColor : entry.baseColor, 0.16);
    }
  });
  if (dragCoverageVisual?.group?.parent) {
    const pulse = Math.sin(elapsed * 5.2) * 0.5 + 0.5;
    dragCoverageVisual.tileMaterial.opacity = (dragCoverageVisual.valid ? 0.14 : 0.1) + pulse * 0.1;
    dragCoverageVisual.lineMaterial.opacity = (dragCoverageVisual.valid ? 0.55 : 0.48) + pulse * 0.34;
  }
  if (canvas) {
    if (activeGrowthPulses > 0) canvas.dataset.farm3dPlantGrowthPulses = String(activeGrowthPulses);
    else delete canvas.dataset.farm3dPlantGrowthPulses;
  }
}
function updateRendererQuality() {
  if (!renderer) return;
  renderer.setPixelRatio(snapshot?.lowSpec ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
  resizeRenderer();
}
function resizeRenderer() {
  if (!renderer || !shell || !camera) return;
  const width = Math.max(1, shell.clientWidth);
  const height = Math.max(1, shell.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
function publishRadioSpatialState(now) {
  if (now - lastRadioSpatialUpdateAt < 90) return;
  lastRadioSpatialUpdateAt = now;
  camera.updateMatrixWorld(true);
  radioCameraRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const radios = [];
  radioEmitterObjects.forEach((object, id) => {
    if (!object.parent) return;
    object.getWorldPosition(radioEmitterWorldPosition);
    radios.push({
      id,
      x: radioEmitterWorldPosition.x,
      y: radioEmitterWorldPosition.y + 0.45,
      z: radioEmitterWorldPosition.z
    });
  });
  window.UndergreenRadioSpatial?.update?.({
    camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    right: { x: radioCameraRight.x, y: radioCameraRight.y, z: radioCameraRight.z },
    radios
  });
}
function animate(now) {
  window.requestAnimationFrame(animate);
  if (document.body.classList.contains("story-comms-active")
    || document.body.classList.contains("comms-modal-active")) return;
  syncSnapshot(now);
  if (!snapshot || !bridge()?.isFarmActive?.() || document.hidden) return;
  const frameInterval = snapshot.lowSpec ? 1000 / 30 : 1000 / 60;
  if (now - lastFrameAt < frameInterval) return;
  const delta = Math.min(0.05, Math.max(0.001, (now - lastFrameAt) / 1000 || 0.016));
  lastFrameAt = now;
  updateCamera(delta);
  updateSpriteSizing();
  updateAnimations(now / 1000);
  updateCleanToolPreviews(delta, now / 1000);
  updateEquipmentDragVisual(delta);
  updateTransientEffects(delta);
  renderer.render(scene, camera);
  publishRadioSpatialState(now);
  if (pendingSceneSyncRequests.size) {
    const completedRequestIds = [...pendingSceneSyncRequests];
    pendingSceneSyncRequests.clear();
    completedRequestIds.forEach((requestId) => {
      window.dispatchEvent(new CustomEvent("farm3d:sync-complete", {
        detail: { requestId, baseId: activeBaseId }
      }));
    });
  }
  canvas.dataset.farm3dReady = "true";
  canvas.dataset.farm3dBlocked = String(Boolean(snapshot.blocked));
  canvas.dataset.farm3dBases = String(snapshot.bases.length);
  canvas.dataset.farm3dInteractables = String(interactables.length);
  canvas.dataset.farm3dTabletopItems = String(snapshot.bases.reduce((total, base) => (
    total + (base.floorDevices || []).filter((item) => item.placementLayer === "tabletop" && item.placed).length
  ), 0));
  canvas.dataset.farm3dFurnitureSets = snapshot.bases.flatMap((base) => (
    (base.furnitureSets || []).map((setDefinition) => `${base.id}:${setDefinition.id}`)
  )).join(",");
  const surfaceTargets = new Map();
  equipmentTargets.forEach((object) => {
    const interaction = object.userData.interaction;
    if (!interaction?.item?.surfaceSlots) return;
    if (surfaceTargets.has(interaction.id) && !interaction.surfaceTarget) return;
    const point = new THREE.Vector3();
    object.getWorldPosition(point);
    if (!interaction.surfaceTarget) point.y += 0.45;
    point.project(camera);
    surfaceTargets.set(interaction.id, {
      id: interaction.id,
      type: interaction.item.type,
      x: Math.round((point.x * 0.5 + 0.5) * canvas.clientWidth),
      y: Math.round((-point.y * 0.5 + 0.5) * canvas.clientHeight)
    });
  });
  canvas.dataset.farm3dSurfaceTargets = JSON.stringify([...surfaceTargets.values()]);
  canvas.dataset.farm3dCamera = camera.position.toArray().map((value) => value.toFixed(3)).join(",");
  canvas.dataset.farm3dTarget = cameraState.target.toArray().map((value) => value.toFixed(3)).join(",");
  canvas.dataset.farm3dYaw = cameraState.yaw.toFixed(6);
  canvas.dataset.farm3dPitch = cameraState.pitch.toFixed(6);
  canvas.dataset.farm3dRobotMotions = animatedObjects.filter((entry) => entry.type === "robot").map((entry) => entry.itemId + ":" + (entry.visualState?.motion || "idle")).join(",");
  canvas.dataset.farm3dGrowLightLevels = animatedObjects.filter((entry) => entry.type === "grow-light").map((entry) => entry.currentLevel.toFixed(2)).join(",");
  canvas.dataset.farm3dReadyPlants = String(animatedObjects.filter((entry) => entry.type === "ready-beacon").length);
  canvas.dataset.farm3dGrowingPlants = String(animatedObjects.filter((entry) => entry.type === "plant" && entry.growing).length);
  canvas.dataset.farm3dResourceReady = String(animatedObjects.filter((entry) => entry.type === "resource-ready").length);
  canvas.dataset.farm3dDirtyEquipment = String(animatedObjects.filter((entry) => entry.type === "dirty-equipment").length);
  canvas.dataset.farm3dPlantEffects = String(transientEffects.filter((entry) => entry.type === "growth-lift").length);
  canvas.dataset.farm3dWaterEffects = String(transientEffects.filter((entry) => entry.type === "bucket-wash").length);
  canvas.dataset.farm3dBrushEffects = String(transientEffects.filter((entry) => entry.type === "brush-scrub").length);
  canvas.dataset.farm3dToolModels = String(cleanToolPreviews.size);
  canvas.dataset.farm3dToolDragging = cleanToolDrag?.moved ? cleanToolDrag.tool : "";
  canvas.dataset.farm3dCityBuildings = String(undergroundCityStats.buildings);
  canvas.dataset.farm3dCityWindows = String(undergroundCityStats.windows);
  canvas.dataset.farm3dCityNeon = String(undergroundCityStats.neon);
  canvas.dataset.farm3dCityMovers = String(undergroundCityStats.movers);
  canvas.dataset.farm3dCityDrawGroups = String(undergroundCityStats.drawGroups);
  canvas.dataset.farm3dCameraPanBounds = [
    cameraTravelLimits.minX,
    cameraTravelLimits.maxX,
    cameraTravelLimits.minZ,
    cameraTravelLimits.maxZ
  ].map((value) => Number(value).toFixed(2)).join(",");
  canvas.dataset.farm3dCameraMaxDistance = cameraTravelLimits.maxDistance.toFixed(2);
}
function setNavigationMode(mode) {
  navigationMode = mode === "orbit" ? "orbit" : "pan";
  const freeRotationButton = hud?.querySelector('[data-farm3d-action="toggle-rotation"]');
  const freeRotationEnabled = navigationMode === "orbit";
  if (freeRotationButton) {
    const label = freeRotationEnabled ? "フリールックをロックする" : "フリールックを有効にする";
    const help = freeRotationEnabled
      ? "フリールック中：左ドラッグで移動／右ドラッグで回転"
      : "フリールックを有効にする";
    freeRotationButton.classList.toggle("active", freeRotationEnabled);
    freeRotationButton.setAttribute("aria-pressed", String(freeRotationEnabled));
    freeRotationButton.setAttribute("aria-label", label);
    freeRotationButton.title = help;
    const stateLabel = freeRotationButton.querySelector("small");
    if (stateLabel) stateLabel.textContent = freeRotationEnabled ? "FREE" : "LOCK";
  }
  if (canvas) {
    canvas.style.cursor = "grab";
    canvas.dataset.farm3dFreeRotation = String(freeRotationEnabled);
  }
}
function createCleanToolPreview(button) {
  const requestedTool = button?.dataset.cleanTool || "brush";
  const tool = ["brush", "bucket", "sprayer", "wrench"].includes(requestedTool) ? requestedTool : "brush";
  if (!button || cleanToolPreviews.has(tool)) return cleanToolPreviews.get(tool) || null;
  const modelCanvas = document.createElement("canvas");
  modelCanvas.className = "clean-tool-model";
  modelCanvas.setAttribute("aria-hidden", "true");
  const fallback = button.querySelector(".clean-tool-icon");
  button.insertBefore(modelCanvas, fallback || button.firstChild);
  try {
    const previewRenderer = new THREE.WebGLRenderer({
      canvas: modelCanvas,
      alpha: true,
      antialias: !snapshot?.lowSpec,
      powerPreference: "low-power"
    });
    previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
    previewRenderer.setClearColor(0x000000, 0);
    previewRenderer.setPixelRatio(snapshot?.lowSpec ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    previewRenderer.setSize(96, 96, false);
    const previewScene = new THREE.Scene();
    const previewCamera = new THREE.OrthographicCamera(-1.22, 1.22, 1.22, -1.22, 0.1, 20);
    previewCamera.position.set(2.8, 2.2, 4.2);
    previewCamera.lookAt(0, 0, 0);
    previewScene.add(new THREE.HemisphereLight(0xdffff0, 0x06110d, 2.35));
    const previewKey = new THREE.DirectionalLight(0xeafff4, 2.4);
    previewKey.position.set(-3, 5, 4);
    previewScene.add(previewKey);
    const pivot = new THREE.Group();
    const modelBuilder = {
      brush: buildCleaningBrushModel,
      bucket: buildCleaningBucketModel,
      sprayer: buildPlantSprayerModel,
      wrench: buildMaintenanceWrenchModel
    }[tool] || buildCleaningBrushModel;
    const model = modelBuilder();
    pivot.add(model);
    previewScene.add(pivot);
    const bounds = new THREE.Box3().setFromObject(model);
    const modelSize = bounds.getSize(new THREE.Vector3());
    const scale = 1.72 / Math.max(0.001, modelSize.x, modelSize.y, modelSize.z);
    model.scale.setScalar(scale);
    bounds.setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    const scaledSize = bounds.getSize(new THREE.Vector3());
    const hangArm = Math.max(0.82, scaledSize.y * 0.58);
    model.position.sub(center);
    model.position.y -= hangArm;
    pivot.position.y = hangArm;
    const frontYaw = Math.atan2(previewCamera.position.x, previewCamera.position.z);
    pivot.rotation.set(0, frontYaw, 0);
    const preview = {
      tool, button, canvas: modelCanvas, renderer: previewRenderer,
      scene: previewScene, camera: previewCamera, pivot,
      baseY: pivot.rotation.y, hangArm,
      angle: 0, angularVelocity: 0, wobble: 0, dragging: false,
      phase: tool === "bucket" ? 1.7 : tool === "sprayer" ? 2.65 : tool === "wrench" ? 3.35 : 0.35
    };
    cleanToolPreviews.set(tool, preview);
    if (fallback) fallback.hidden = true;
    previewRenderer.render(previewScene, previewCamera);
    return preview;
  } catch (error) {
    modelCanvas.remove();
    if (fallback) fallback.hidden = false;
    console.warn("[farm3d] clean tool preview unavailable", error);
    return null;
  }
}
function initializeCleanToolPreviews() {
  cleanToolButtons().forEach((button) => createCleanToolPreview(button));
  if (canvas) canvas.dataset.farm3dToolModels = String(cleanToolPreviews.size);
}
function kickCleanToolWheelMotion(direction) {
  cleanToolPreviews.forEach((preview) => {
    preview.wobble = Math.max(preview.wobble, 0.72);
    preview.angle *= 0.55;
    const impulse = preview.button.classList.contains("wheel-current") ? 3.1 : 2.35;
    preview.angularVelocity = (direction > 0 ? 1 : -1) * impulse;
  });
}
function updateCleanToolPreviews(delta, elapsed) {
  cleanToolPreviews.forEach((preview) => {
    const moving = preview.dragging
      || Math.abs(preview.angularVelocity) > 0.002
      || Math.abs(preview.angle) > 0.001
      || preview.wobble > 0.003;
    if (!moving) return;

    preview.angularVelocity += -preview.angle * 42 * delta;
    preview.angularVelocity *= Math.exp(-delta * 10.5);
    preview.angle = clamp(preview.angle + preview.angularVelocity * delta, -0.46, 0.46);
    preview.wobble *= Math.exp(-delta * 9.5);
    const dragSway = preview.dragging ? Math.sin(elapsed * 6.4 + preview.phase) * 0.065 : 0;
    preview.pivot.rotation.x = 0;
    preview.pivot.rotation.y = preview.baseY;
    preview.pivot.rotation.z = preview.angle + dragSway;
    preview.renderer.render(preview.scene, preview.camera);
  });
}
function setCleanToolPreviewDragging(preview, dragging) {
  if (!preview) return;
  preview.dragging = Boolean(dragging);
  preview.wobble = Math.max(preview.wobble, dragging ? 0.7 : 0.45);
  preview.angularVelocity += dragging ? 0.48 : -0.24;
}
function cleanToolButtons() {
  const buttons = [...document.querySelectorAll(".facility-clean-tools [data-clean-tool]")];
  if (!document.body.classList.contains("official-demo-mode")) return buttons;
  return buttons.filter((button) => ["bucket", "sprayer"].includes(button.dataset.cleanTool));
}
function toolWheelButtons() {
  const buttons = [...document.querySelectorAll(".facility-clean-tools > .clean-tool-button[data-clean-tool], .facility-clean-tools > .clean-tool-button[data-tool-storage]")];
  if (!document.body.classList.contains("official-demo-mode")) return buttons;
  return buttons.filter((button) => ["bucket", "sprayer"].includes(button.dataset.cleanTool) || button.dataset.toolStorage === "seed");
}
function toolWheelButtonKey(button) {
  if (!button) return "";
  return button.dataset.cleanTool || (button.dataset.toolStorage ? `storage:${button.dataset.toolStorage}` : "");
}
function toolStorageRingItems(ring) {
  if (!ring) return [];
  return ring.dataset.toolStorageRing === "equipment"
    ? [...ring.querySelectorAll(".tool-storage-ring-entry")]
    : [...ring.querySelectorAll(".tool-storage-ring-items > .seed-option")];
}
function toolStorageRingPosition(index, total) {
  const count = Math.max(1, total);
  const progress = count > 1 ? index / (count - 1) : 0.5;
  const angle = (11 + progress * 68) * Math.PI / 180;
  const radius = 252;
  return {
    x: -Math.cos(angle) * radius,
    y: -Math.sin(angle) * radius,
  };
}
function updateToolStorageRing(type) {
  const ring = document.querySelector(`[data-tool-storage-ring="${type}"]`);
  if (!ring) return;
  const items = toolStorageRingItems(ring);
  const total = items.length;
  const visibleCount = Math.min(total, TOOL_STORAGE_RING_VISIBLE_LIMIT);
  const pageable = total > TOOL_STORAGE_RING_VISIBLE_LIMIT;
  let start = pageable ? Number(toolStorageRingOffsets[type]) || 0 : 0;
  start = total ? ((start % total) + total) % total : 0;
  toolStorageRingOffsets[type] = start;
  ring.dataset.storageTotal = String(total);
  ring.dataset.storageVisible = String(visibleCount);
  ring.dataset.storageOffset = String(start);
  ring.classList.toggle("storage-ring-pageable", pageable);

  items.forEach((item, itemIndex) => {
    const relativeIndex = total ? ((itemIndex - start) % total + total) % total : 0;
    const visible = relativeIndex < visibleCount;
    item.classList.toggle("tool-ring-hidden", !visible);
    item.setAttribute("aria-hidden", String(!visible));
    const interactive = item.matches("button") ? item : item.querySelector("button");
    if (interactive) {
      if (visible) interactive.removeAttribute("tabindex");
      else interactive.tabIndex = -1;
    }
    if (!visible) return;
    const position = toolStorageRingPosition(relativeIndex, visibleCount);
    item.style.setProperty("--tool-ring-x", position.x.toFixed(1) + "px");
    item.style.setProperty("--tool-ring-y", position.y.toFixed(1) + "px");
    item.style.setProperty("--tool-ring-order", String(relativeIndex));
  });

  const title = ring.querySelector(".tool-storage-ring-title");
  if (title) {
    if (!title.dataset.baseLabel) title.dataset.baseLabel = title.textContent.trim();
    const nextTitle = pageable
      ? `${title.dataset.baseLabel} ${String(start + 1).padStart(2, "0")}/${String(total).padStart(2, "0")}`
      : title.dataset.baseLabel;
    if (title.textContent !== nextTitle) title.textContent = nextTitle;
  }
}
function updateToolStorageRings() {
  updateToolStorageRing("equipment");
  updateToolStorageRing("seed");
}
function rotateToolStorageRing(type, direction) {
  const ring = document.querySelector(`[data-tool-storage-ring="${type}"]`);
  const total = toolStorageRingItems(ring).length;
  if (!ring || total <= TOOL_STORAGE_RING_VISIBLE_LIMIT) return false;
  const now = performance.now();
  if (now - (Number(toolStorageRingLastAt[type]) || 0) < TOOL_STORAGE_RING_SCROLL_INTERVAL) return false;
  toolStorageRingLastAt[type] = now;
  toolStorageRingOffsets[type] = (Number(toolStorageRingOffsets[type]) || 0) + (direction > 0 ? 1 : -1);
  updateToolStorageRing(type);
  return true;
}
function setToolStorageOpen(type = "") {
  const toolbox = document.querySelector(".facility-clean-tools");
  if (!toolbox) return;
  const nextType = ["equipment", "seed"].includes(type) ? type : "";
  toolbox.dataset.storageOpen = nextType;
  toolbox.classList.toggle("storage-ring-open", Boolean(nextType));
  toolbox.querySelectorAll("[data-tool-storage]").forEach((trigger) => {
    const active = trigger.dataset.toolStorage === nextType;
    trigger.setAttribute("aria-expanded", String(active));
    trigger.classList.toggle("storage-active", active);
  });
  toolbox.querySelectorAll("[data-tool-storage-ring]").forEach((ring) => {
    const active = ring.dataset.toolStorageRing === nextType;
    ring.setAttribute("aria-hidden", String(!active));
    ring.classList.toggle("open", active);
  });
  if (nextType) updateToolStorageRing(nextType);
}
function cleanToolCircularOffset(index, current, total) {
  let offset = index - current;
  if (offset > total / 2) offset -= total;
  if (offset < -total / 2) offset += total;
  return offset;
}
function updateCleanToolWheel(preferredTool = "") {
  const toolbox = document.querySelector(".facility-clean-tools");
  const buttons = toolWheelButtons();
  if (!toolbox || !buttons.length) return;
  const preferredIndex = preferredTool
    ? buttons.findIndex((button) => button.dataset.cleanTool === preferredTool || toolWheelButtonKey(button) === preferredTool)
    : -1;
  if (preferredIndex >= 0) cleanToolWheelIndex = preferredIndex;
  cleanToolWheelIndex = ((cleanToolWheelIndex % buttons.length) + buttons.length) % buttons.length;
  buttons.forEach((button, index) => {
    const offset = cleanToolCircularOffset(index, cleanToolWheelIndex, buttons.length);
    const distance = Math.abs(offset);
    const limitedOffset = clamp(offset, -2, 2);
    const angleDegrees = distance === 0
      ? 45
      : 45 + Math.sign(limitedOffset) * (distance === 1 ? 18 : 34);
    const angle = angleDegrees * Math.PI / 180;
    const radius = distance === 0 ? 128 : 184;
    const x = -Math.cos(angle) * radius;
    const y = -Math.sin(angle) * radius;
    const scale = distance === 0 ? 1.58 : distance === 1 ? 0.82 : 0.68;
    const opacity = distance === 0 ? 1 : distance === 1 ? 0.82 : 0.62;
    button.style.setProperty("--tool-wheel-x", x.toFixed(1) + "px");
    button.style.setProperty("--tool-wheel-y", y.toFixed(1) + "px");
    button.style.setProperty("--tool-wheel-scale", String(scale));
    button.style.setProperty("--tool-wheel-opacity", String(opacity));
    button.classList.toggle("wheel-current", offset === 0);
    button.classList.toggle("wheel-hidden", distance > 2);
    button.tabIndex = distance <= 1 ? 0 : -1;
    button.setAttribute("aria-hidden", String(distance > 2));
  });
  const current = buttons[cleanToolWheelIndex];
  const label = toolbox.querySelector(".tool-palette-label");
  const currentLabel = document.body.classList.contains("official-demo-mode") && current?.dataset.toolStorage === "seed"
    ? "植える"
    : (current?.getAttribute("aria-label") || toolWheelButtonKey(current));
  const nextLabel = "TOOLBOX // " + currentLabel;
  if (label && label.textContent !== nextLabel) label.textContent = nextLabel;
  toolbox.dataset.toolWheelIndex = String(cleanToolWheelIndex);
  toolbox.dataset.toolWheelCount = String(buttons.length);
  const focusedStorageType = current?.dataset.toolStorage || "";
  if (toolbox.dataset.storageOpen !== focusedStorageType) setToolStorageOpen(focusedStorageType);
  if (canvas) canvas.dataset.farm3dToolWheel = String(cleanToolWheelIndex + 1) + "/" + buttons.length + ":" + toolWheelButtonKey(current);
}
function rotateCleanToolWheel(direction) {
  const buttons = toolWheelButtons();
  if (!buttons.length) return;
  cleanToolWheelIndex = (cleanToolWheelIndex + (direction > 0 ? 1 : -1) + buttons.length) % buttons.length;
  const tool = toolWheelButtonKey(buttons[cleanToolWheelIndex]);
  updateCleanToolWheel(tool);
  kickCleanToolWheelMotion(direction);
}
function bindExternalControls() {
  const cleanToolbox = document.querySelector(".facility-clean-tools");
  initializeCleanToolPreviews();
  updateCleanToolWheel(document.body.classList.contains("official-demo-mode") ? "storage:seed" : "");
  updateToolStorageRings();
  cleanToolbox?.addEventListener("wheel", (event) => {
    const detailRing = event.target.closest?.("[data-tool-storage-ring].open");
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (detailRing) {
      event.preventDefault();
      event.stopPropagation();
      if (Math.abs(delta) >= 1) rotateToolStorageRing(detailRing.dataset.toolStorageRing, delta);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const now = performance.now();
    if (now - cleanToolWheelLastAt < 80) return;
    cleanToolWheelLastAt = now;
    if (Math.abs(delta) < 1) return;
    rotateCleanToolWheel(delta);
  }, { passive: false });
  cleanToolbox?.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    rotateCleanToolWheel(["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1);
  });
  cleanToolWheelObserver?.disconnect();
  if (cleanToolbox) {
    cleanToolWheelObserver = new MutationObserver(() => {
      updateCleanToolWheel();
      updateToolStorageRings();
    });
    cleanToolWheelObserver.observe(cleanToolbox, { childList: true, subtree: true });
  }
  let stockClickGuardUntil = 0;
  const clearSeedDrag = () => {
    if (!seedDrag) return;
    seedDrag.source?.classList.remove("dragging");
    seedDrag.ghost?.remove();
    document.documentElement.classList.remove("drag-active", "farm3d-seed-drag-active");
    document.body.classList.remove("drag-active", "farm3d-seed-drag-active");
    if (canvas) delete canvas.dataset.farm3dSeedDrag;
    seedDrag = null;
    hideHover();
  };
  const clearStockEquipmentDrag = () => {
    if (!stockEquipmentDrag) return;
    stockEquipmentDrag.source?.classList.remove("dragging");
    stockEquipmentDrag.ghost?.remove();
    document.documentElement.classList.remove("drag-active", "equipment-drag-active", "farm3d-equipment-drag-active");
    document.body.classList.remove("drag-active", "equipment-drag-active", "farm3d-equipment-drag-active");
    if (canvas) {
      delete canvas.dataset.farm3dEquipmentDrag;
      delete canvas.dataset.farm3dDragRotation;
    }
    stockEquipmentDrag = null;
    hideHover();
  };
  const clearCleanToolDrag = () => {
    if (!cleanToolDrag) return;
    const drag = cleanToolDrag;
    drag.source?.classList.remove("dragging");
    if (drag.preview?.canvas && drag.source && drag.preview.canvas.parentElement !== drag.source) {
      drag.source.insertBefore(drag.preview.canvas, drag.source.querySelector(".clean-tool-icon"));
    }
    setCleanToolPreviewDragging(drag.preview, false);
    drag.ghost?.remove();
    document.documentElement.classList.remove("drag-active", "farm3d-clean-drag-active");
    document.body.classList.remove("drag-active", "farm3d-clean-drag-active");
    if (canvas) delete canvas.dataset.farm3dCleanDrag;
    cleanToolDrag = null;
    hideHover();
  };
  const finishStockEquipmentDrag = (event, cancelled = false) => {
    if (!stockEquipmentDrag || stockEquipmentDrag.pointerId !== event.pointerId) return false;
    const drag = stockEquipmentDrag;
    const tabletop = drag.placement?.placementLayer !== "floor";
    const valid = !cancelled && drag.moved && drag.valid && drag.targetHit && (tabletop || drag.dropOrigin);
    clearStockEquipmentDrag();
    stockClickGuardUntil = performance.now() + 360;
    if (!drag.moved && !cancelled) {
      bridge()?.selectPlacement?.(drag.kind, drag.id);
      forceSync = true;
    } else if (valid) {
      const success = tabletop
        ? bridge()?.placeSelectedOnSurface?.(drag.targetHit.interaction.baseId, drag.targetHit.interaction.id)
        : bridge()?.placeSelected?.(
            drag.targetHit.interaction.baseId,
            drag.dropOrigin.x,
            drag.dropOrigin.y,
            drag.placement.rotationQuarter
          );
      if (success !== false) {
        spawnPulse(drag.targetHit.point, 0x72ffb8);
        spawnBurst(drag.targetHit.point, 0x72ffb8);
        bridge()?.feedback?.("place");
        forceSync = true;
      }
    } else if (drag.moved) {
      bridge()?.cancelPlacement?.();
      if (tabletop && drag.targetHit) {
        bridge()?.setStatus?.("この机の卓上スロットは埋まっています。");
      }
      forceSync = true;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  };
  const finishSeedDrag = (event, cancelled = false) => {
    if (!seedDrag || seedDrag.pointerId !== event.pointerId) return false;
    const drag = seedDrag;
    const hit = drag.targetHit;
    const valid = !cancelled && drag.moved && drag.valid && hit;
    clearSeedDrag();
    if (!drag.moved && !cancelled) bridge()?.selectSeed?.(drag.cropId);
    else if (valid) {
      const success = bridge()?.plantInUnit?.(hit.interaction.baseId, hit.interaction.id, drag.cropId);
      if (success) {
        completeOfficialPlantTutorial();
        spawnPulse(hit.point, 0x72ffb8);
        spawnBurst(hit.point, 0x72ffb8);
        bridge()?.feedback?.("place");
        forceSync = true;
      }
    } else if (!cancelled) bridge()?.setStatus?.("空きスロットのある栽培容器へ種をドロップしてください。");
    if (officialPlantTutorialPhase !== "complete") stopOfficialPlantTutorialDemo();
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  };
  const finishCleanToolDrag = (event, cancelled = false) => {
    if (!cleanToolDrag || cleanToolDrag.pointerId !== event.pointerId) return false;
    const drag = cleanToolDrag;
    const hit = drag.targetHit;
    const valid = !cancelled && drag.moved && drag.valid && hit;
    clearCleanToolDrag();
    if (valid) {
      const api = bridge();
      if (drag.tool === "wrench") {
        const opened = Boolean(api?.openLaborForRobot?.(hit.interaction.id));
        if (opened) {
          spawnPulse(hit.point, 0x48dbea);
          spawnBurst(hit.point, 0x72ffb8);
          api?.feedback?.("connect");
          forceSync = true;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        return true;
      }
      const result = api?.useTool?.(hit.interaction.kind, hit.interaction.id, drag.tool)
        || api?.cleanEquipment?.(hit.interaction.kind, hit.interaction.id, drag.tool)
        || { ok: false, effect: "none" };
      if (result.effect === "mist") {
        if (result.applied === false) {
          spawnBurst(hit.point, 0x69f5c1);
        } else {
          spawnMist(hit.point);
          spawnBurst(hit.point, 0x69f5c1);
        }
      } else if (result.effect === "short") {
        spawnShortCircuit(hit.point);
      } else if (result.effect === "ng") {
        spawnToolReject(hit.point);
      } else if (result.effect === "bucket") {
        spawnBucketWash(hit.point);
      } else if (result.effect === "brush") {
        spawnBrushScrub(hit.point);
      }
      if (result.ok) forceSync = true;
    } else if (drag.moved && !cancelled) {
      bridge()?.setStatus?.(drag.tool === "wrench"
        ? "スパナをサポートロボットへドラッグしてください。"
        : "清掃したい設備の上でツールを離してください。");
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  };
  document.addEventListener("pointerdown", (event) => {
    const officialStorageTrigger = document.body.classList.contains("official-demo-mode")
      ? event.target.closest?.(".facility-clean-tools [data-tool-storage]")
      : null;
    if (officialStorageTrigger && (event.button === undefined || event.button === 0)) {
      const type = officialStorageTrigger.dataset.toolStorage;
      updateCleanToolWheel(`storage:${type}`);
      setToolStorageOpen(type);
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const stockItem = event.target.closest?.(".placement-stock[data-place-kind][data-place-id]");
    if (stockItem && !stockItem.disabled && bridge()?.isFarmActive?.() && !snapshot?.blocked
      && (event.button === undefined || event.button === 0)) {
      stockEquipmentDrag = {
        pointerId: event.pointerId,
        pointerType: event.pointerType || "mouse",
        kind: stockItem.dataset.placeKind,
        id: stockItem.dataset.placeId,
        source: stockItem,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        rotationWheelDelta: 0,
        moved: false,
        ghost: null,
        placement: null,
        targetHit: null,
        dropOrigin: null,
        valid: false
      };
      event.stopImmediatePropagation();
      return;
    }
    const seed = event.target.closest?.(".seed-option[data-drag-crop]");
    if (seed && !seed.disabled && bridge()?.isFarmActive?.() && !snapshot?.blocked
      && (event.button === undefined || event.button === 0)) {
      if (isOfficialPlantTutorial() && seed.dataset.dragCrop === "lettuce"
        && ["waiting", "ready"].includes(officialPlantTutorialPhase)) startOfficialPlantTutorial(seed);
      seedDrag = {
        pointerId: event.pointerId,
        pointerType: event.pointerType || "mouse",
        cropId: seed.dataset.dragCrop,
        source: seed,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        ghost: null,
        targetHit: null,
        valid: false
      };
      event.stopImmediatePropagation();
      return;
    }
    const cleanTool = event.target.closest?.("[data-clean-tool]");
    if (!cleanTool || !bridge()?.isFarmActive?.() || snapshot?.blocked
      || (event.button !== undefined && event.button !== 0)) return;
    const cleanToolId = cleanTool.dataset.cleanTool || "";
    cleanToolDrag = {
      pointerId: event.pointerId,
      pointerType: event.pointerType || "mouse",
      tool: cleanToolId,
      source: cleanTool,
      preview: cleanToolPreviews.get(cleanToolId) || null,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      ghost: null,
      targetHit: null,
      valid: false
    };
    if (cleanTool.setPointerCapture) {
      try {
        cleanTool.setPointerCapture(event.pointerId);
      } catch (error) {}
    }
    event.stopImmediatePropagation();
  }, true);
  document.addEventListener("pointermove", (event) => {
    updateOfficialSeedHoverHint(event);
    if (stockEquipmentDrag && stockEquipmentDrag.pointerId === event.pointerId) {
      const drag = stockEquipmentDrag;
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (!drag.moved && distance < 8) return;
      if (!drag.moved && drag.pointerType !== "mouse"
        && Math.abs(event.clientY - drag.startY) > Math.abs(event.clientX - drag.startX) * 1.15) {
        stockClickGuardUntil = performance.now() + 360;
        stockEquipmentDrag = null;
        return;
      }
      if (!drag.moved) {
        drag.moved = true;
        drag.source.classList.add("dragging");
        drag.ghost = drag.source.cloneNode(true);
        drag.ghost.disabled = false;
        drag.ghost.className = "drag-ghost equipment-drag-ghost farm3d-equipment-drag-ghost";
        drag.ghost.removeAttribute("data-guide-active");
        const contact = document.createElement("span");
        contact.className = "equipment-drop-contact";
        contact.setAttribute("aria-hidden", "true");
        drag.ghost.appendChild(contact);
        document.body.appendChild(drag.ghost);
        document.documentElement.classList.add("drag-active", "equipment-drag-active", "farm3d-equipment-drag-active");
        document.body.classList.add("drag-active", "equipment-drag-active", "farm3d-equipment-drag-active");
        if (!bridge()?.selectPlacement?.(drag.kind, drag.id)) {
          clearStockEquipmentDrag();
          return;
        }
        forceSync = true;
        drag.placement = {
          kind: drag.kind,
          id: drag.id,
          width: 1,
          height: 1,
          baseWidth: 1,
          baseHeight: 1,
          rotationQuarter: 0,
          ...(bridge()?.snapshot?.()?.placement || {})
        };
        drag.placement.rotationQuarter = normalizeQuarterTurn(drag.placement.rotationQuarter);
        updateStockGhostFootprint(drag);
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      drag.ghost.style.left = `${clamp(event.clientX, 64, window.innerWidth - 64)}px`;
      drag.ghost.style.top = `${clamp(event.clientY - 24, 48, window.innerHeight - 72)}px`;
      refreshStockEquipmentDrop(drag, event.clientX, event.clientY);
      return;
    }
    if (cleanToolDrag && cleanToolDrag.pointerId === event.pointerId) {
      const drag = cleanToolDrag;
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (!drag.moved && distance < 8) return;
      if (!drag.moved) {
        drag.moved = true;
        drag.source.classList.add("dragging");
        drag.ghost = document.createElement("div");
        drag.ghost.className = `clean-tool-ghost farm3d-clean-drag-ghost tool-${drag.tool}`;
        drag.ghost.setAttribute("aria-hidden", "true");
        if (drag.preview?.canvas) {
          drag.ghost.appendChild(drag.preview.canvas);
          setCleanToolPreviewDragging(drag.preview, true);
        } else {
          const fallback = drag.source.querySelector(".clean-tool-icon")?.cloneNode(true);
          if (fallback) {
            fallback.hidden = false;
            drag.ghost.appendChild(fallback);
          }
        }
        document.body.appendChild(drag.ghost);
        document.documentElement.classList.add("drag-active", "farm3d-clean-drag-active");
        document.body.classList.add("drag-active", "farm3d-clean-drag-active");
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      drag.ghost.style.left = `${clamp(event.clientX, 34, window.innerWidth - 34)}px`;
      drag.ghost.style.top = `${clamp(event.clientY, 34, window.innerHeight - 34)}px`;
      const rect = canvas.getBoundingClientRect();
      const insideCanvas = event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
      const hit = insideCanvas ? cleanTargetAt(event.clientX, event.clientY) : null;
      drag.targetHit = hit;
      const targetKind = hit?.interaction?.kind || "";
      const targetItem = hit?.interaction?.item || null;
      const mismatched = Boolean(hit) && (
        (drag.tool === "bucket" && targetKind !== "unit")
        || (drag.tool === "brush" && targetKind === "unit")
        || (drag.tool === "sprayer" && targetKind !== "unit")
        || (drag.tool === "wrench" && targetItem?.type !== "support_robot")
      );
      drag.valid = Boolean(hit) && (drag.tool !== "wrench" || targetItem?.type === "support_robot");
      const unavailable = Boolean(hit) && !mismatched && (
        (drag.tool === "sprayer" && !targetItem?.slots?.some((plant) => plant && !plant.dead && !plant.ready))
        || (["bucket", "brush"].includes(drag.tool) && !targetItem?.needsCleaning)
      );
      drag.ghost.classList.toggle("drop-valid", drag.valid && !mismatched && !unavailable);
      drag.ghost.classList.toggle("drop-invalid", !drag.valid || mismatched || unavailable);
      canvas.dataset.farm3dCleanDrag = !drag.valid ? "invalid" : mismatched || unavailable ? "warning" : "valid";
      if (hit) {
        showHover(hit, event.clientX, event.clientY);
        hoverOutline.material.color.setHex(mismatched ? 0xff5b6e : unavailable ? 0xf5d65b : drag.tool === "wrench" ? 0x48dbea : drag.tool === "sprayer" ? 0x69f5c1 : 0x72ffb8);
      } else hideHover();
      return;
    }
    if (!seedDrag || seedDrag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - seedDrag.startX, event.clientY - seedDrag.startY);
    if (!seedDrag.moved && distance < 8) return;
    if (!seedDrag.moved && seedDrag.pointerType !== "mouse"
      && Math.abs(event.clientY - seedDrag.startY) > Math.abs(event.clientX - seedDrag.startX) * 1.15) {
      seedDrag = null;
      return;
    }
    if (!seedDrag.moved) {
      seedDrag.moved = true;
      seedDrag.source.classList.add("dragging");
      seedDrag.ghost = seedDrag.source.cloneNode(true);
      seedDrag.ghost.disabled = false;
      seedDrag.ghost.className = "drag-ghost farm3d-seed-drag-ghost";
      seedDrag.ghost.removeAttribute("data-guide-active");
      document.body.appendChild(seedDrag.ghost);
      document.documentElement.classList.add("drag-active", "farm3d-seed-drag-active");
      document.body.classList.add("drag-active", "farm3d-seed-drag-active");
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    seedDrag.ghost.style.left = `${clamp(event.clientX, 82, window.innerWidth - 82)}px`;
    seedDrag.ghost.style.top = `${clamp(event.clientY, 48, window.innerHeight - 48)}px`;
    const hit = seedTargetAt(event.clientX, event.clientY);
    seedDrag.targetHit = hit;
    seedDrag.valid = canPlantInTarget(hit, seedDrag.cropId);
    seedDrag.ghost.classList.toggle("drop-valid", seedDrag.valid);
    seedDrag.ghost.classList.toggle("drop-invalid", !seedDrag.valid);
    canvas.dataset.farm3dSeedDrag = seedDrag.valid ? "valid" : "invalid";
    if (hit) {
      showHover(hit, event.clientX, event.clientY);
      hoverOutline.material.color.setHex(seedDrag.valid ? 0x72ffb8 : 0xff5b6e);
    } else hideHover();
  }, true);
  document.addEventListener("wheel", (event) => {
    if (!stockEquipmentDrag?.moved) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    rotateStockEquipmentDrag(event.deltaY);
  }, { capture: true, passive: false });
  document.addEventListener("pointerup", (event) => {
    if (finishStockEquipmentDrag(event)) return;
    if (finishCleanToolDrag(event)) return;
    finishSeedDrag(event);
  }, true);
  document.addEventListener("pointercancel", (event) => {
    if (finishStockEquipmentDrag(event, true)) return;
    if (finishCleanToolDrag(event, true)) return;
    finishSeedDrag(event, true);
  }, true);
  window.addEventListener("blur", () => {
    if (stockEquipmentDrag?.moved) bridge()?.cancelPlacement?.();
    clearStockEquipmentDrag();
    clearCleanToolDrag();
    clearSeedDrag();
    stopOfficialPlantTutorialDemo();
    hideOfficialSeedHoverHint();
  });
  document.addEventListener("click", (event) => {
    const stockItem = event.target.closest?.(".placement-stock[data-place-kind][data-place-id]");
    if (stockItem && performance.now() < stockClickGuardUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const storageTrigger = event.target.closest?.(".facility-clean-tools [data-tool-storage]");
    if (storageTrigger) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const type = storageTrigger.dataset.toolStorage;
      updateCleanToolWheel(`storage:${type}`);
      setToolStorageOpen(type);
      return;
    }
    const cleanTool = event.target.closest?.(".facility-clean-tools [data-clean-tool]");
    if (!cleanTool) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}
function createHud() {
  hud = document.createElement("div");
  hud.className = "farm3d-hud";
  hud.innerHTML = [
    '<button type="button" data-farm3d-action="fit" title="全拠点を表示" aria-label="全拠点を表示">⌂</button>',
    '<button type="button" data-farm3d-action="focus" title="選択中の拠点へ" aria-label="選択中の拠点へ">◎</button>',
    '<span class="farm3d-hud-divider" aria-hidden="true"></span>',
    '<button class="farm3d-rotation-toggle" type="button" data-farm3d-action="toggle-rotation" title="フリールックを有効にする" aria-label="フリールックを有効にする" aria-pressed="false"><span aria-hidden="true">↻</span><small>LOCK</small></button>'
  ].join("");
  shell.appendChild(hud);
  hud.addEventListener("pointerdown", (event) => event.stopPropagation());
  hud.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const action = event.target.closest("[data-farm3d-action]")?.dataset.farm3dAction;
    if (action === "fit") fitAll();
    if (action === "focus") focusBase(snapshot?.activeBaseId);
    if (action === "toggle-rotation") setNavigationMode(navigationMode === "orbit" ? "pan" : "orbit");
  });
  hoverLabel = document.createElement("div");
  hoverLabel.className = "farm3d-hover-label";
  shell.appendChild(hoverLabel);
  loadingPanel = document.createElement("div");
  loadingPanel.className = "farm3d-loading";
  loadingPanel.innerHTML = "<span></span><strong>3D FARM LINK</strong>";
  shell.appendChild(loadingPanel);
}
function bindCanvasEvents() {
  canvas.addEventListener("pointerdown", beginPointerAction);
  canvas.addEventListener("pointermove", (event) => {
    if (activePointers.has(event.pointerId)) updatePointerAction(event);
    else handlePointerHover(event);
  });
  canvas.addEventListener("pointerup", finishPointerAction);
  canvas.addEventListener("pointercancel", cancelPointerAction);
  canvas.addEventListener("pointerleave", () => { if (!pointerAction) hideHover(); });
  canvas.addEventListener("contextmenu", handleContextMenu);
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (rotateActiveCanvasDrag(event.deltaY)) return;
    const limits = refreshCameraTravelLimits();
    cameraState.distanceGoal = clamp(cameraState.distanceGoal * Math.exp(event.deltaY * 0.0012), CAMERA_MIN_DISTANCE, limits.maxDistance);
  }, { passive: false });
  canvas.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (snapshot?.placement) bridge()?.cancelPlacement?.();
    hideHover();
  });
}
function initScene() {
  shell = document.querySelector(".facility-grid-shell");
  if (!shell) throw new Error("facility-grid-shell was not found");
  document.documentElement.classList.add("farm3d-active");
  document.body.classList.add("farm3d-active");
  shell.classList.add("farm3d-active");
  canvas = document.createElement("canvas");
  canvas.className = "farm3d-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "3D栽培区画");
  shell.prepend(canvas);
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x030907, 1);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030907);
  scene.fog = new THREE.FogExp2(0x030907, 0.025);
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 180);
  const hemisphere = new THREE.HemisphereLight(0xcfffe8, 0x07110d, 2.15);
  const key = new THREE.DirectionalLight(0xe7fff3, 2.1);
  key.position.set(-10, 16, 8);
  const rim = new THREE.DirectionalLight(0x48dbea, 0.85);
  rim.position.set(12, 7, -10);
  scene.add(hemisphere, key, rim);
  clearWorld();
  createHud();
  bindCanvasEvents();
  bindExternalControls();
  new ResizeObserver(resizeRenderer).observe(shell);
  resizeRenderer();
  setNavigationMode("pan");
  window.farm3dDebug = {
    canvas,
    camera,
    getState: () => ({
      bases: snapshot?.bases?.length || 0,
      interactables: interactables.length,
      camera: camera.position.toArray(),
      target: cameraState.target.toArray(),
      distance: cameraState.distance,
      yaw: cameraState.yaw,
      pitch: cameraState.pitch,
      freeRotation: navigationMode === "orbit",
      readyPlants: animatedObjects.filter((entry) => entry.type === "ready-beacon").length,
      plantEffects: transientEffects.filter((entry) => entry.type === "growth-lift").length,
      growLights: animatedObjects.filter((entry) => entry.type === "grow-light").map((entry) => ({
        itemId: entry.itemId,
        level: entry.currentLevel,
        flickering: entry.flickerStartedAt !== null,
        nextFlickerIn: entry.nextFlickerAt === null ? null : Math.max(0, entry.nextFlickerAt - performance.now() / 1000)
      })),
      accessPoints: animatedObjects.filter((entry) => entry.type === "market-access").map((entry) => {
        const rect = canvas.getBoundingClientRect();
        const point = entry.scooter.getWorldPosition(new THREE.Vector3());
        point.y += 0.72;
        point.project(camera);
        return {
          id: entry.object.children.find((child) => child.userData?.interaction?.accessId)?.userData?.interaction?.accessId || "market-courier-scooter",
          screenX: Math.round(rect.left + (point.x * 0.5 + 0.5) * rect.width),
          screenY: Math.round(rect.top + (-point.y * 0.5 + 0.5) * rect.height)
        };
      }),
      equipment: (() => {
        const seen = new Set();
        const rect = canvas.getBoundingClientRect();
        return equipmentTargets.flatMap((target) => {
          const interaction = target.userData.interaction;
          if (!interaction?.id || seen.has(interaction.id)) return [];
          seen.add(interaction.id);
          const object = interaction.dragObject || target;
          const point = object.getWorldPosition(new THREE.Vector3());
          point.y += 0.35;
          point.project(camera);
          return [{
            id: interaction.id,
            type: interaction.item?.type || "",
            baseId: interaction.baseId,
            gridX: interaction.item?.x,
            gridY: interaction.item?.y,
            screenX: Math.round(rect.left + (point.x * 0.5 + 0.5) * rect.width),
            screenY: Math.round(rect.top + (-point.y * 0.5 + 0.5) * rect.height)
          }];
        });
      })(),
      city: { ...undergroundCityStats },
      cameraLimits: { ...cameraTravelLimits }
    }),
    previewBucketWash() {
      const position = cameraState.target.clone();
      position.y = FLOOR_HEIGHT + 0.45;
      spawnBucketWash(position);
      return true;
    },
    previewBrushScrub() {
      const position = cameraState.target.clone();
      position.y = FLOOR_HEIGHT + 0.45;
      spawnBrushScrub(position);
      return true;
    },
    fitAll,
    focusBase
  };
  window.addEventListener("farm3d:preview-bucket-wash", () => {
    const position = cameraState.target.clone();
    position.y = FLOOR_HEIGHT + 0.45;
    spawnBucketWash(position);
  });
  window.addEventListener("farm3d:preview-brush-scrub", () => {
    const position = cameraState.target.clone();
    position.y = FLOOR_HEIGHT + 0.45;
    spawnBrushScrub(position);
  });
  if (new URLSearchParams(window.location.search).has("bucketwaterqa")) {
    window.setInterval(() => {
      const position = cameraState.target.clone();
      position.y = FLOOR_HEIGHT + 0.45;
      spawnBucketWash(position);
    }, 2200);
  }
  if (new URLSearchParams(window.location.search).has("brushqa")) {
    window.setInterval(() => {
      const position = cameraState.target.clone();
      position.y = FLOOR_HEIGHT + 0.45;
      spawnBrushScrub(position);
    }, 1800);
  }
  window.addEventListener("farm3d:statechange", () => { forceSync = true; });
  window.addEventListener("farm3d:render", () => { forceSync = true; });
  window.addEventListener("farm3d:sync-request", (event) => {
    const requestId = String(event.detail?.requestId || "").trim();
    if (requestId) pendingSceneSyncRequests.add(requestId);
    forceSync = true;
  });
  window.addEventListener("resize", resizeRenderer, { passive: true });
  window.requestAnimationFrame(animate);
}
function start() {
  try {
    initScene();
  } catch (error) {
    console.error("[farm3d] initialization failed", error);
    document.body.classList.add("farm3d-error");
    const target = document.querySelector(".facility-grid-shell");
    if (target) {
      const panel = document.createElement("div");
      panel.className = "farm3d-fatal";
      panel.textContent = "3D栽培区画を初期化できませんでした: " + error.message;
      target.appendChild(panel);
    }
  }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
