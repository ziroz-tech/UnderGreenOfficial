/* =========================================================================
   UNDERGREEN // 仮モデル（プリミティブだけで組んだ低ポリゴンの置き換え）
   -------------------------------------------------------------------------
   farm3d.js から切り出した、純粋なモデル生成だけのモジュール。
   副作用が無いので、ゲームを起動せずにツール側からも読み込める
   （model-reference.html がサイズ見本の書き出しに使っている）。

   スプライトのプロポーションに寄せてある。本番モデルに差し替える際は
   MODEL_BUILDERS の該当関数を入れ替えるだけでよい。

   ● 原点は「設置マスの中心・床の高さ」。モデルは +Y 方向へ立ち上がる
   ● 1 ワールド単位 = グリッド1マス
   ● extentX = 設置マス数（グリッドの行方向）、extentZ = 同じく列方向
     ワールド X = グリッド Y、ワールド Z = グリッド X という対応のため
   ● ロボットの正面は +Z
   ========================================================================= */
import * as THREE from "./vendor/three.module.min.js";

/* 苗のビルボードは MeshBasicMaterial（ライティングを受けない＝常に最大輝度）なので、
   モデル側もそれと並んで見える明るさが要る。暗い床の上で沈まないように、
   ベース色は実物より明るめにし、わずかな自発光で影側の潰れも防ぐ。 */
export const PALETTE = Object.freeze({
  metalDark: 0x515c64,
  metalMid: 0x929ca3,
  metalLight: 0xbcc5cb,
  rubber: 0x2a3034,
  podShell: 0x424a50,
  cream: 0xe2dccd,
  cyan: 0x3ce4de
});

const lambert = (color) => new THREE.MeshLambertMaterial({ color, emissive: 0x0d1613 });
/** PS2 期の自発光パーツ相当。ライティングを受けずに一定の明るさで光る。 */
const glow = (color = PALETTE.cyan) => new THREE.MeshBasicMaterial({ color, fog: true });

function addBox(group, material, width, height, depth, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function addCylinder(group, material, radiusTop, radiusBottom, height, x, y, z, segments = 14, open = false) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, open),
    material
  );
  if (open) mesh.material.side = THREE.DoubleSide;
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}


function addSphere(group, material, radius, x, y, z, widthSegments = 12, heightSegments = 8) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, widthSegments, heightSegments), material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function addTorus(group, material, radius, tube, x, y, z, radialSegments = 8, tubularSegments = 20) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments), material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function addPipeBetween(group, material, radius, start, end, segments = 10) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), segments),
    material
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  group.add(mesh);
  return mesh;
}

function transparentLambert(color, opacity = 0.55) {
  return new THREE.MeshLambertMaterial({
    color,
    emissive: 0x07110d,
    transparent: true,
    opacity,
    depthWrite: false
  });
}

function finishPlaceholder(group, modelId) {
  group.userData.modelId = modelId;
  group.userData.placeholder = true;
  return group;
}

/** 栽培ボックス：縁の立ち上がったトレイに、株を挿す穴が並ぶ。 */
export function buildBoxModel({ extentX, extentZ, deckHeight, holes }) {
  const group = new THREE.Group();
  const shell = lambert(PALETTE.metalMid);
  const dark = lambert(PALETTE.metalDark);
  const deep = lambert(PALETTE.rubber);
  const strip = glow();
  const h = deckHeight;

  // 台座 → 本体 → 天板の三段構成。スプライトも同じ積み方をしている。
  addBox(group, dark, extentX * 0.99, h * 0.24, extentZ * 0.99, 0, h * 0.12, 0);
  addBox(group, shell, extentX * 0.9, h * 0.6, extentZ * 0.93, 0, h * 0.5, 0);
  addBox(group, dark, extentX * 0.94, h * 0.16, extentZ * 0.96, 0, h * 0.88, 0);

  // 立ち上がった縁と四隅のブロック
  const rimHeight = h * 0.3;
  const rimY = h + rimHeight / 2 - h * 0.04;
  const rimThickness = Math.min(extentX, extentZ) * 0.12;
  addBox(group, shell, extentX, rimHeight, rimThickness, 0, rimY, (extentZ - rimThickness) / 2);
  addBox(group, shell, extentX, rimHeight, rimThickness, 0, rimY, -(extentZ - rimThickness) / 2);
  addBox(group, shell, rimThickness, rimHeight, extentZ - rimThickness * 2, (extentX - rimThickness) / 2, rimY, 0);
  addBox(group, shell, rimThickness, rimHeight, extentZ - rimThickness * 2, -(extentX - rimThickness) / 2, rimY, 0);
  [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
    addBox(group, dark, rimThickness * 1.5, rimHeight * 1.35, rimThickness * 1.5,
      sx * (extentX - rimThickness * 1.5) / 2, rimY + rimHeight * 0.1, sz * (extentZ - rimThickness * 1.5) / 2);
  }));

  // 縁のLEDストリップ
  const stripLength = extentZ * 0.32;
  [-1, 1].forEach((sx) => [-0.62, 0.62].forEach((offset) => {
    addBox(group, strip, rimThickness * 0.3, rimHeight * 0.26, stripLength,
      sx * (extentX - rimThickness * 0.6) / 2, rimY + rimHeight * 0.12, offset * extentZ * 0.5);
  }));

  // 一段落ちた培地面
  addBox(group, deep, extentX - rimThickness * 2.2, h * 0.06, extentZ - rimThickness * 2.2, 0, h - h * 0.02, 0);

  // 株を挿す穴。位置は 2D のスロット定義から逆算しているので苗とずれない。
  const holeRadius = Math.min(extentX, extentZ) * 0.155;
  holes.forEach((hole) => {
    addCylinder(group, shell, holeRadius, holeRadius, h * 0.16, hole.x, h + h * 0.03, hole.z, 14, true);
    addCylinder(group, deep, holeRadius * 0.86, holeRadius * 0.86, h * 0.05, hole.x, h - h * 0.02, hole.z, 14);
  });

  // 側面の配管
  addCylinder(group, PALETTE.metalLight ? lambert(PALETTE.metalLight) : shell,
    extentZ * 0.035, extentZ * 0.035, extentZ * 0.78, -(extentX * 0.46), h * 0.42, 0, 8)
    .rotation.x = Math.PI / 2;
  return group;
}

/** 栽培ポッド：円筒の缶に、上面が窪んで苗が1株のぞく。 */
export function buildPodModel({ extentX, extentZ, deckHeight }) {
  const group = new THREE.Group();
  const shell = lambert(PALETTE.podShell);
  const trim = lambert(PALETTE.metalDark);
  const deep = lambert(0x0d1012);
  const radius = Math.min(extentX, extentZ) * 0.34;
  const h = deckHeight;

  addCylinder(group, trim, radius * 1.06, radius * 1.1, h * 0.09, 0, h * 0.045, 0, 16);
  addCylinder(group, shell, radius, radius, h * 0.86, 0, h * 0.5, 0, 16);
  addCylinder(group, trim, radius * 1.05, radius * 1.05, h * 0.13, 0, h * 0.94, 0, 16);
  // 上面の窪みと、内側のリブ
  addCylinder(group, deep, radius * 0.78, radius * 0.78, h * 0.14, 0, h * 0.93, 0, 16, true);
  addCylinder(group, deep, radius * 0.8, radius * 0.8, h * 0.02, 0, h * 0.87, 0, 16);
  // 正面の表示帯
  addBox(group, glow(), radius * 0.5, h * 0.03, radius * 0.06, radius * 0.2, h * 0.72, radius * 0.98);
  return group;
}

/** サポートロボット：丸い胴体・大きな顔・背中のタンク。仮モデル。
    スプライトの実測高さは透明な余白を含んでいて当てにならないため、
    大きさは設置マスからの比率で決める（ポッドと同じくらいの背丈になる）。

    前方は +Z。向きは group.rotation.y だけで決まるので、モーション側から扱いやすい。
    各パーツは userData.parts に名前で入れてあり、静止位置も控えてある。
    本番モデルに差し替えるときは、同じ名前でパーツを用意すれば
    robot_animations.csv の clip 指定をそのまま流用できる。 */
export function buildRobotModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const body = lambert(PALETTE.cream);
  const dark = lambert(PALETTE.metalDark);
  const cyan = glow();
  const radius = Math.min(extentX, extentZ) * 0.95 / 2.45;   // 全高はおよそ半径の 2.45 倍

  const torso = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), body);
  torso.position.set(0, radius * 1.5, 0);
  torso.scale.set(1, 0.94, 0.92);
  group.add(torso);

  const face = addBox(group, dark, radius * 1.16, radius * 1.0, radius * 0.5, 0, radius * 1.62, radius * 0.62);
  const eyes = [-0.28, 0.28].map((offset) => (
    addBox(group, cyan, radius * 0.2, radius * 0.2, radius * 0.1, offset * radius, radius * 1.72, radius * 0.86)
  ));

  // 背中の養液タンク
  const tank = addCylinder(group, cyan, radius * 0.26, radius * 0.26, radius * 0.62, radius * 0.62, radius * 1.85, -radius * 0.5, 10);
  addCylinder(group, dark, radius * 0.29, radius * 0.29, radius * 0.1, radius * 0.62, radius * 2.18, -radius * 0.5, 10);

  const legs = [];
  const arms = [];
  [-1, 1].forEach((side) => {
    legs.push(addBox(group, dark, radius * 0.3, radius * 0.5, radius * 0.34, side * radius * 0.44, radius * 0.42, 0));
    addBox(group, cyan, radius * 0.26, radius * 0.07, radius * 0.3, side * radius * 0.44, radius * 0.2, radius * 0.02);
    arms.push(addBox(group, body, radius * 0.14, radius * 0.62, radius * 0.14, side * radius * 1.0, radius * 1.4, radius * 0.08));
  });

  group.userData.parts = { torso, face, eyes, tank, legs, arms, radius };
  group.userData.rest = new Map();
  group.traverse((child) => {
    if (child !== group) group.userData.rest.set(child, child.position.clone());
  });
  return group;
}

/** ロボットの持ち場に置く小さな充電ユニット。
    ロボットが出払っていても、どこが持ち場かが盤面で分かるようにする。 */
export function buildChargeDockModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const dark = lambert(PALETTE.metalDark);
  const shell = lambert(PALETTE.metalMid);
  const lamp = glow();
  const size = Math.min(extentX, extentZ);
  const pad = size * 0.66;

  // 低い台座（ロボットが乗っても不自然にならない高さ）
  addBox(group, dark, pad, size * 0.06, pad, 0, size * 0.03, 0);
  addBox(group, shell, pad * 0.84, size * 0.045, pad * 0.84, 0, size * 0.08, 0);
  // 奥側の支柱と充電灯
  const postX = -pad * 0.34;
  const postZ = -pad * 0.34;
  addBox(group, shell, size * 0.11, size * 0.34, size * 0.11, postX, size * 0.25, postZ);
  addBox(group, dark, size * 0.17, size * 0.08, size * 0.17, postX, size * 0.45, postZ);
  addBox(group, lamp, size * 0.13, size * 0.05, size * 0.13, postX, size * 0.5, postZ);
  // 床面の発光ライン（ドックの目印）
  addBox(group, lamp, pad * 0.46, size * 0.015, size * 0.035, 0, size * 0.105, pad * 0.3);
  addBox(group, lamp, size * 0.035, size * 0.015, pad * 0.46, pad * 0.3, size * 0.105, 0);
  return group;
}


/** Four-panel grow light on a reinforced central mast. */
export function buildAreaLightModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const dark = lambert(PALETTE.rubber);
  const shell = lambert(PALETTE.metalDark);
  const trim = lambert(PALETTE.metalMid);
  const cyan = glow(PALETTE.cyan);
  const lamp = glow(0xc8ff58);
  const size = Math.min(extentX, extentZ);
  const base = size * 0.78;

  addBox(group, dark, base, size * 0.16, base, 0, size * 0.08, 0);
  addBox(group, shell, base * 0.86, size * 0.16, base * 0.86, 0, size * 0.2, 0);
  addCylinder(group, trim, size * 0.13, size * 0.16, size * 0.22, 0, size * 0.34, 0, 12);
  addCylinder(group, shell, size * 0.085, size * 0.09, size * 1.38, 0, size * 1.0, 0, 12);
  addCylinder(group, cyan, size * 0.105, size * 0.105, size * 0.06, 0, size * 1.72, 0, 12);

  const hubY = size * 1.43;
  addBox(group, trim, size * 0.24, size * 0.28, size * 0.22, 0, hubY, 0);
  const panelConfigs = [
    { x: -0.31, y: 1.69, rotation: 0.22 },
    { x: 0.31, y: 1.69, rotation: -0.22 },
    { x: -0.31, y: 1.17, rotation: -0.22 },
    { x: 0.31, y: 1.17, rotation: 0.22 }
  ];
  panelConfigs.forEach((config) => {
    const panelX = size * config.x;
    const panelY = size * config.y;
    const arm = addBox(group, shell, size * 0.36, size * 0.075, size * 0.08,
      panelX * 0.52, (hubY + panelY) * 0.5, -size * 0.01);
    arm.rotation.z = Math.atan2(panelY - hubY, panelX) * 0.24;
    const frame = addBox(group, dark, size * 0.48, size * 0.29, size * 0.1, panelX, panelY, size * 0.02);
    frame.rotation.z = config.rotation;
    const face = addBox(group, lamp, size * 0.39, size * 0.2, size * 0.018, panelX, panelY, size * 0.08);
    face.rotation.z = config.rotation;
    addBox(group, cyan, size * 0.16, size * 0.025, size * 0.02,
      panelX, panelY + size * 0.115, size * 0.09).rotation.z = config.rotation;
  });
  return finishPlaceholder(group, "light");
}

function addFanModule(group, materials, size, x, y, z) {
  const module = new THREE.Group();
  module.position.set(x, y, z);
  group.add(module);

  const housing = addCylinder(module, materials.shell, size * 0.235, size * 0.235, size * 0.13, 0, 0, 0, 18, true);
  housing.rotation.x = Math.PI / 2;
  const inner = addCylinder(module, materials.deep, size * 0.19, size * 0.19, size * 0.09, 0, 0, size * 0.005, 18);
  inner.rotation.x = Math.PI / 2;
  const wash = addCylinder(module, materials.cyan, size * 0.16, size * 0.16, size * 0.018, 0, 0, size * 0.075, 18);
  wash.rotation.x = Math.PI / 2;
  for (let index = 0; index < 5; index += 1) {
    const angle = index * Math.PI * 2 / 5;
    const blade = addBox(module, materials.trim, size * 0.055, size * 0.17, size * 0.025,
      Math.cos(angle) * size * 0.065, Math.sin(angle) * size * 0.065, size * 0.09);
    blade.rotation.z = angle - Math.PI * 0.17;
  }
  const hub = addCylinder(module, materials.shell, size * 0.055, size * 0.055, size * 0.11, 0, 0, size * 0.09, 12);
  hub.rotation.x = Math.PI / 2;
}

/** Four circulation fans sharing the same tower as the source illustration. */
export function buildAreaFanModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const materials = {
    deep: lambert(0x11191b),
    shell: lambert(PALETTE.metalDark),
    trim: lambert(PALETTE.metalMid),
    cyan: glow(PALETTE.cyan)
  };
  const size = Math.min(extentX, extentZ);
  const base = size * 0.78;

  addBox(group, materials.deep, base, size * 0.16, base, 0, size * 0.08, 0);
  addBox(group, materials.shell, base * 0.86, size * 0.16, base * 0.86, 0, size * 0.2, 0);
  addCylinder(group, materials.trim, size * 0.13, size * 0.16, size * 0.22, 0, size * 0.34, 0, 12);
  addCylinder(group, materials.shell, size * 0.09, size * 0.095, size * 1.38, 0, size * 1.0, 0, 12);
  [0.98, 1.5].forEach((level, row) => {
    [-1, 1].forEach((side) => {
      addBox(group, materials.shell, size * 0.34, size * 0.08, size * 0.08,
        side * size * 0.18, size * level, 0);
      addFanModule(group, materials, size, side * size * 0.34, size * level, row ? 0 : size * 0.03);
    });
  });
  addBox(group, materials.cyan, size * 0.07, size * 0.25, size * 0.025, 0, size * 1.25, size * 0.105);
  return finishPlaceholder(group, "fan");
}


/** Angled procurement console with cartridge bank and crop display. */
export function buildProcurementTerminalModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const deep = lambert(0x111617);
  const shell = lambert(PALETTE.metalDark);
  const trim = lambert(PALETTE.metalMid);
  const cyan = glow(PALETTE.cyan);
  const screenGreen = glow(0x48f69c);
  const size = Math.min(extentX, extentZ);

  addBox(group, deep, size * 0.9, size * 0.16, size * 0.8, 0, size * 0.08, 0);
  addBox(group, shell, size * 0.72, size * 0.62, size * 0.58, 0, size * 0.43, -size * 0.04);
  addBox(group, trim, size * 0.82, size * 0.12, size * 0.68, 0, size * 0.18, 0);
  [-0.24, -0.08, 0.08, 0.24].forEach((offset) => {
    addBox(group, deep, size * 0.12, size * 0.34, size * 0.07,
      size * offset, size * 0.37, size * 0.29);
    addBox(group, screenGreen, size * 0.05, size * 0.035, size * 0.015,
      size * offset, size * 0.22, size * 0.335);
  });

  const screenGroup = new THREE.Group();
  screenGroup.position.set(0, size * 0.91, -size * 0.02);
  screenGroup.rotation.x = -Math.PI * 0.09;
  group.add(screenGroup);
  addBox(screenGroup, shell, size * 0.84, size * 0.56, size * 0.13, 0, 0, 0);
  addBox(screenGroup, deep, size * 0.68, size * 0.4, size * 0.025, 0, 0, size * 0.075);
  addBox(screenGroup, screenGreen, size * 0.59, size * 0.31, size * 0.012, 0, 0, size * 0.095);
  [-0.2, 0, 0.2].forEach((offset) => {
    addBox(screenGroup, cyan, size * 0.12, size * 0.018, size * 0.008,
      size * offset, -size * 0.14, size * 0.105);
  });
  addBox(group, shell, size * 0.25, size * 0.15, size * 0.12, size * 0.24, size * 0.69, size * 0.26);
  addBox(group, cyan, size * 0.14, size * 0.035, size * 0.018, size * 0.24, size * 0.71, size * 0.33);
  return finishPlaceholder(group, "procurement_terminal");
}

/** Low loading hatch with a recessed pad and front ramp. */
export function buildShippingHatchModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const deep = lambert(0x111617);
  const shell = lambert(PALETTE.metalDark);
  const trim = lambert(PALETTE.metalMid);
  const cyan = glow(PALETTE.cyan);
  const amber = glow(0xffc83d);
  const size = Math.min(extentX, extentZ);

  addBox(group, deep, size * 0.94, size * 0.16, size * 0.92, 0, size * 0.08, -size * 0.02);
  addBox(group, shell, size * 0.84, size * 0.25, size * 0.72, 0, size * 0.23, -size * 0.07);
  addBox(group, trim, size * 0.68, size * 0.04, size * 0.54, 0, size * 0.375, -size * 0.08);
  addBox(group, deep, size * 0.54, size * 0.035, size * 0.4, 0, size * 0.402, -size * 0.08);
  [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
    addBox(group, trim, size * 0.13, size * 0.34, size * 0.13,
      sx * size * 0.36, size * 0.25, sz * size * 0.31 - size * 0.05);
    addBox(group, amber, size * 0.04, size * 0.07, size * 0.015,
      sx * size * 0.36, size * 0.32, sz > 0 ? size * 0.34 : -size * 0.39);
  }));
  addBox(group, cyan, size * 0.54, size * 0.035, size * 0.025, 0, size * 0.29, size * 0.32);
  const ramp = addBox(group, shell, size * 0.56, size * 0.08, size * 0.38, 0, size * 0.16, size * 0.44);
  ramp.rotation.x = -Math.PI * 0.08;
  for (let index = -2; index <= 2; index += 1) {
    addBox(group, deep, size * 0.47, size * 0.015, size * 0.025,
      0, size * (0.18 - index * 0.006), size * (0.43 + index * 0.055)).rotation.x = -Math.PI * 0.08;
  }
  return finishPlaceholder(group, "shipping_hatch");
}


/** Portable-looking receiver with front speaker, CRT display and antenna. */
export function buildRadioModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const deep = lambert(0x101516);
  const shell = lambert(PALETTE.metalDark);
  const trim = lambert(PALETTE.metalMid);
  const cyan = glow(PALETTE.cyan);
  const screen = glow(0x59ff93);
  const size = Math.min(extentX, extentZ);

  addBox(group, deep, size * 0.88, size * 0.12, size * 0.55, 0, size * 0.06, 0);
  addBox(group, shell, size * 0.84, size * 0.68, size * 0.5, 0, size * 0.46, 0);
  addBox(group, trim, size * 0.78, size * 0.08, size * 0.54, 0, size * 0.83, 0);
  addBox(group, deep, size * 0.29, size * 0.34, size * 0.025, -size * 0.22, size * 0.5, size * 0.265);
  for (let index = -2; index <= 2; index += 1) {
    addBox(group, trim, size * 0.22, size * 0.015, size * 0.012,
      -size * 0.22, size * (0.5 + index * 0.055), size * 0.285);
  }
  addBox(group, deep, size * 0.29, size * 0.24, size * 0.025, size * 0.18, size * 0.57, size * 0.265);
  addBox(group, screen, size * 0.23, size * 0.17, size * 0.012, size * 0.18, size * 0.57, size * 0.285);
  [0.08, 0.25].forEach((x, index) => {
    const knob = addCylinder(group, trim, size * (index ? 0.065 : 0.09), size * (index ? 0.065 : 0.09), size * 0.07,
      size * x, size * 0.34, size * 0.29, 14);
    knob.rotation.x = Math.PI / 2;
  });
  [-0.25, -0.08, 0.09].forEach((x) => {
    addBox(group, cyan, size * 0.07, size * 0.025, size * 0.012, size * x, size * 0.19, size * 0.285);
  });
  addCylinder(group, shell, size * 0.035, size * 0.05, size * 0.72,
    -size * 0.33, size * 1.15, -size * 0.05, 10);
  addCylinder(group, trim, size * 0.048, size * 0.048, size * 0.08,
    -size * 0.33, size * 1.53, -size * 0.05, 10);
  addTorus(group, cyan, size * 0.055, size * 0.012, -size * 0.33, size * 0.86, -size * 0.05, 6, 16).rotation.x = Math.PI / 2;
  return finishPlaceholder(group, "radio");
}

/** Two-cell work desk with terminal, tablet, paper stack and task lamp. */
export function buildOfficeDeskModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const deep = lambert(0x111617);
  const shell = lambert(PALETTE.metalDark);
  const trim = lambert(PALETTE.metalMid);
  const cyan = glow(PALETTE.cyan);
  const screen = glow(0x57f49b);
  const paper = lambert(0xd4c9ac);
  const width = extentX * 0.86;
  const depth = extentZ * 0.78;

  addBox(group, shell, width, 0.14, depth, 0, 0.79, 0);
  addBox(group, trim, width * 0.96, 0.035, depth * 0.94, 0, 0.88, 0);
  [-1, 1].forEach((side) => {
    addBox(group, shell, width * 0.22, 0.68, depth * 0.82, side * width * 0.36, 0.4, 0);
    addBox(group, deep, width * 0.16, 0.17, 0.025, side * width * 0.36, 0.58, depth * 0.43);
    addBox(group, cyan, width * 0.09, 0.025, 0.012, side * width * 0.36, 0.58, depth * 0.45);
  });
  addBox(group, deep, width * 0.35, 0.08, depth * 0.45, 0, 0.22, -depth * 0.08);

  const monitor = new THREE.Group();
  monitor.position.set(-width * 0.22, 1.17, -depth * 0.08);
  monitor.rotation.x = -Math.PI * 0.055;
  group.add(monitor);
  addBox(monitor, shell, width * 0.4, 0.48, 0.09, 0, 0, 0);
  addBox(monitor, deep, width * 0.32, 0.37, 0.02, 0, 0, 0.055);
  addBox(monitor, screen, width * 0.28, 0.31, 0.01, 0, 0, 0.07);
  addBox(group, shell, width * 0.24, 0.045, depth * 0.28, width * 0.08, 0.92, depth * 0.05).rotation.x = -Math.PI * 0.02;
  addBox(group, screen, width * 0.19, 0.012, depth * 0.21, width * 0.08, 0.95, depth * 0.055).rotation.x = -Math.PI * 0.02;
  for (let index = 0; index < 3; index += 1) {
    addBox(group, paper, width * 0.22, 0.012, depth * 0.25,
      width * 0.28 + index * 0.012, 0.91 + index * 0.012, depth * 0.08 - index * 0.008).rotation.y = -0.12;
  }
  const lampX = width * 0.38;
  addCylinder(group, shell, 0.08, 0.1, 0.06, lampX, 0.93, -depth * 0.22, 10);
  addPipeBetween(group, trim, 0.035,
    new THREE.Vector3(lampX, 0.96, -depth * 0.22),
    new THREE.Vector3(lampX, 1.35, -depth * 0.22));
  addPipeBetween(group, trim, 0.03,
    new THREE.Vector3(lampX, 1.35, -depth * 0.22),
    new THREE.Vector3(lampX - width * 0.1, 1.48, -depth * 0.14));
  addBox(group, cyan, width * 0.17, 0.07, 0.09, lampX - width * 0.14, 1.48, -depth * 0.11).rotation.z = -0.25;
  return finishPlaceholder(group, "office_desk");
}


/** Tall atmospheric water filter with external circulation pipe. */
export function buildWaterGeneratorModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const deep = lambert(0x111617);
  const shell = lambert(PALETTE.metalDark);
  const trim = lambert(PALETTE.metalMid);
  const filter = lambert(0xd8ddd8);
  const cyan = glow(PALETTE.cyan);
  const size = Math.min(extentX, extentZ);
  const radius = size * 0.31;

  addCylinder(group, deep, radius * 1.12, radius * 1.16, size * 0.2, 0, size * 0.1, 0, 18);
  addCylinder(group, shell, radius * 1.08, radius * 1.08, size * 0.19, 0, size * 0.28, 0, 18);
  addCylinder(group, filter, radius * 0.9, radius * 0.9, size * 0.88, 0, size * 0.79, 0, 24);
  for (let index = 0; index < 12; index += 1) {
    const angle = index * Math.PI * 2 / 12;
    addPipeBetween(group, trim, size * 0.012,
      new THREE.Vector3(Math.cos(angle) * radius * 0.91, size * 0.37, Math.sin(angle) * radius * 0.91),
      new THREE.Vector3(Math.cos(angle) * radius * 0.91, size * 1.21, Math.sin(angle) * radius * 0.91), 6);
  }
  addCylinder(group, shell, radius * 1.12, radius * 1.08, size * 0.22, 0, size * 1.34, 0, 18);
  addCylinder(group, trim, radius * 0.52, radius * 0.62, size * 0.13, 0, size * 1.51, 0, 16);
  addTorus(group, cyan, radius * 0.88, size * 0.018, 0, size * 1.24, 0, 6, 24).rotation.x = Math.PI / 2;

  const pipeX = radius * 1.12;
  addPipeBetween(group, shell, size * 0.04,
    new THREE.Vector3(pipeX, size * 0.42, -size * 0.02),
    new THREE.Vector3(pipeX, size * 1.35, -size * 0.02));
  addBox(group, deep, size * 0.16, size * 0.34, size * 0.16, pipeX, size * 0.55, 0);
  addBox(group, cyan, size * 0.035, size * 0.18, size * 0.012, pipeX, size * 0.58, size * 0.086);
  addPipeBetween(group, shell, size * 0.04,
    new THREE.Vector3(pipeX, size * 0.42, 0),
    new THREE.Vector3(radius * 0.72, size * 0.27, 0));
  return finishPlaceholder(group, "filter");
}

/** Nutrient culture tank with luminous liquid, bubbles and pipework. */
export function buildNutrientCultureModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const deep = lambert(0x101617);
  const shell = lambert(PALETTE.metalDark);
  const trim = lambert(PALETTE.metalMid);
  const glass = transparentLambert(0x56d9b2, 0.38);
  const liquid = transparentLambert(0x22e47f, 0.72);
  const cyan = glow(PALETTE.cyan);
  const amber = glow(0xffc83d);
  const size = Math.min(extentX, extentZ);
  const radius = size * 0.35;

  addCylinder(group, deep, radius * 1.15, radius * 1.18, size * 0.18, 0, size * 0.09, 0, 20);
  addCylinder(group, shell, radius * 1.1, radius * 1.12, size * 0.2, 0, size * 0.27, 0, 20);
  addCylinder(group, glass, radius, radius, size * 0.82, 0, size * 0.76, 0, 24, true);
  addCylinder(group, liquid, radius * 0.9, radius * 0.9, size * 0.69, 0, size * 0.7, 0, 24);
  addCylinder(group, shell, radius * 1.12, radius * 1.08, size * 0.23, 0, size * 1.31, 0, 20);
  addCylinder(group, trim, radius * 0.5, radius * 0.58, size * 0.12, 0, size * 1.49, 0, 16);
  addTorus(group, cyan, radius * 0.92, size * 0.018, 0, size * 0.36, 0, 6, 24).rotation.x = Math.PI / 2;
  addTorus(group, cyan, radius * 0.92, size * 0.018, 0, size * 1.16, 0, 6, 24).rotation.x = Math.PI / 2;

  [
    [-0.16, 0.53, 0.12, 0.035], [0.13, 0.61, 0.18, 0.045],
    [-0.02, 0.74, -0.12, 0.028], [0.16, 0.85, -0.05, 0.04],
    [-0.13, 0.96, 0.02, 0.03], [0.04, 1.05, 0.13, 0.025]
  ].forEach(([x, y, z, bubbleRadius]) => {
    addSphere(group, transparentLambert(0x9dffd2, 0.8), size * bubbleRadius,
      size * x, size * y, size * z, 8, 6);
  });
  [-1, 1].forEach((side) => {
    const pipeX = side * radius * 1.08;
    addPipeBetween(group, shell, size * 0.035,
      new THREE.Vector3(pipeX, size * 0.36, 0),
      new THREE.Vector3(pipeX, size * 1.25, 0));
  });
  addBox(group, deep, size * 0.14, size * 0.32, size * 0.13, radius * 1.1, size * 0.67, size * 0.08);
  addBox(group, amber, size * 0.025, size * 0.08, size * 0.012, radius * 1.1, size * 0.7, size * 0.151);
  return finishPlaceholder(group, "tank");
}

/** Reclaimed two-seat sofa with a low luminous base rail. */
export function buildSofaModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const frame = lambert(0x303a3f);
  const upholstery = lambert(0x426b66);
  const cushion = lambert(0x568b7f);
  const dark = lambert(PALETTE.rubber);
  const cyan = glow(PALETTE.cyan);
  const width = extentX * 0.9;
  const depth = extentZ * 0.82;

  addBox(group, dark, width * 0.92, 0.16, depth * 0.82, 0, 0.12, 0);
  [-1, 1].forEach((side) => {
    addBox(group, frame, 0.12, 0.24, depth * 0.68, side * width * 0.4, 0.2, 0);
  });
  addBox(group, upholstery, width * 0.82, 0.28, depth * 0.58, 0, 0.4, depth * 0.07);
  [-1, 1].forEach((side) => {
    addBox(group, cushion, width * 0.37, 0.18, depth * 0.51, side * width * 0.2, 0.55, depth * 0.08);
  });
  addBox(group, upholstery, width * 0.84, 0.78, depth * 0.2, 0, 0.82, -depth * 0.31).rotation.x = -0.08;
  [-1, 1].forEach((side) => {
    addBox(group, cushion, width * 0.36, 0.58, depth * 0.14,
      side * width * 0.2, 0.84, -depth * 0.21).rotation.x = -0.08;
    addBox(group, upholstery, width * 0.09, 0.42, depth * 0.62,
      side * width * 0.46, 0.52, 0);
  });
  addBox(group, cyan, width * 0.54, 0.035, 0.025, 0, 0.18, depth * 0.43);
  return finishPlaceholder(group, "sofa");
}

/** Compact communal locker with two numbered doors. */
export function buildLockerModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const shell = lambert(0x56636a);
  const door = lambert(0x68777d);
  const dark = lambert(0x171d20);
  const cyan = glow(0x69dff4);
  const size = Math.min(extentX, extentZ);
  const width = size * 0.76;
  const depth = size * 0.58;

  addBox(group, dark, width * 1.06, 0.1, depth * 1.08, 0, 0.05, 0);
  addBox(group, shell, width, 1.45, depth, 0, 0.78, 0);
  addBox(group, dark, width * 0.94, 0.04, 0.025, 0, 0.79, depth * 0.52);
  [-1, 1].forEach((side) => {
    addBox(group, door, width * 0.45, 0.66, 0.035, side * width * 0.235, 1.14, depth * 0.52);
    addBox(group, door, width * 0.45, 0.66, 0.035, side * width * 0.235, 0.43, depth * 0.52);
    [0.24, 0.31, 0.38].forEach((offset) => {
      addBox(group, dark, width * 0.19, 0.018, 0.012, side * width * 0.235, offset, depth * 0.55);
    });
    addBox(group, cyan, width * 0.035, 0.15, 0.012, side * width * 0.08, 1.08, depth * 0.55);
  });
  addBox(group, dark, width * 1.04, 0.08, depth * 1.02, 0, 1.54, 0);
  return finishPlaceholder(group, "locker");
}

/** Decorative plant in a reclaimed hydroponic vessel. */
export function buildHouseplantModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const pot = lambert(0x48545b);
  const trim = lambert(0x758087);
  const soil = lambert(0x17211c);
  const stem = lambert(0x3f8d58);
  const leaf = lambert(0x63b95d);
  const cyan = glow(0x55e0cc);
  const size = Math.min(extentX, extentZ);

  addCylinder(group, trim, size * 0.34, size * 0.38, size * 0.12, 0, size * 0.06, 0, 14);
  addCylinder(group, pot, size * 0.3, size * 0.34, size * 0.54, 0, size * 0.35, 0, 14);
  addCylinder(group, soil, size * 0.27, size * 0.27, size * 0.045, 0, size * 0.63, 0, 16);
  addBox(group, cyan, size * 0.18, size * 0.025, size * 0.018, 0, size * 0.31, size * 0.345);

  const stems = [
    [0, 0.63, 0, 0, 1.28, 0],
    [0, 0.66, 0, -0.18, 1.08, 0.04],
    [0, 0.67, 0, 0.2, 1.02, -0.06],
    [0, 0.72, 0, -0.05, 1.16, 0.18]
  ];
  stems.forEach(([sx, sy, sz, ex, ey, ez]) => {
    addPipeBetween(group, stem, size * 0.025,
      new THREE.Vector3(size * sx, size * sy, size * sz),
      new THREE.Vector3(size * ex, size * ey, size * ez), 7);
  });
  [
    [-0.26, 1.0, 0.02, -0.35], [0.27, 0.96, -0.04, 0.35],
    [-0.2, 1.2, 0.02, -0.2], [0.2, 1.18, 0.03, 0.22],
    [-0.08, 1.34, -0.02, -0.08], [0.08, 1.3, 0.12, 0.1]
  ].forEach(([x, y, z, angle], index) => {
    const blade = addSphere(group, leaf, size * (index < 2 ? 0.2 : 0.18), size * x, size * y, size * z, 10, 6);
    blade.scale.set(1.45, 0.34, 0.72);
    blade.rotation.y = angle;
    blade.rotation.z = angle * 0.55;
  });
  return finishPlaceholder(group, "houseplant");
}

/** Countertop drink dispenser with a visible colored reservoir. */
export function buildJuiceServerModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const shell = lambert(0x4b5960);
  const trim = lambert(0x87949a);
  const dark = lambert(0x13191b);
  const glass = transparentLambert(0xf1b64b, 0.38);
  const liquid = transparentLambert(0xff9c2d, 0.78);
  const cyan = glow(PALETTE.cyan);
  const amber = glow(0xffc04b);
  const size = Math.min(extentX, extentZ);

  addBox(group, dark, size * 0.76, size * 0.12, size * 0.66, 0, size * 0.06, 0);
  addBox(group, shell, size * 0.7, size * 0.76, size * 0.6, 0, size * 0.49, 0);
  addBox(group, dark, size * 0.54, size * 0.31, size * 0.035, 0, size * 0.42, size * 0.315);
  addBox(group, trim, size * 0.46, size * 0.05, size * 0.26, 0, size * 0.24, size * 0.19);
  addCylinder(group, trim, size * 0.045, size * 0.045, size * 0.2, 0, size * 0.62, size * 0.35, 10);
  addCylinder(group, dark, size * 0.075, size * 0.055, size * 0.11, 0, size * 0.49, size * 0.35, 10);
  addCylinder(group, trim, size * 0.28, size * 0.3, size * 0.11, 0, size * 0.93, 0, 18);
  addCylinder(group, glass, size * 0.25, size * 0.25, size * 0.56, 0, size * 1.22, 0, 20, true);
  addCylinder(group, liquid, size * 0.22, size * 0.22, size * 0.42, 0, size * 1.17, 0, 20);
  addCylinder(group, shell, size * 0.29, size * 0.27, size * 0.13, 0, size * 1.56, 0, 18);
  addTorus(group, amber, size * 0.23, size * 0.018, 0, size * 0.96, 0, 6, 22).rotation.x = Math.PI / 2;
  addBox(group, cyan, size * 0.22, size * 0.035, size * 0.015, 0, size * 0.72, size * 0.315);
  addBox(group, amber, size * 0.05, size * 0.05, size * 0.015, size * 0.2, size * 0.72, size * 0.315);
  return finishPlaceholder(group, "juice_server");
}

/** Folding privacy partition, sized to span two grid cells. */
export function buildPartitionModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const frame = lambert(0x59666e);
  const dark = lambert(0x1b2225);
  const panel = transparentLambert(0x5a8d8c, 0.56);
  const cyan = glow(0x66e8de);
  const width = extentX * 0.9;
  const depth = Math.max(0.12, extentZ * 0.12);
  const height = 1.42;

  [-1, 0, 1].forEach((step) => {
    const x = step * width * 0.49;
    addBox(group, frame, 0.075, height, depth, x, height * 0.52, 0);
    addBox(group, dark, 0.28, 0.07, depth * 2.2, x, 0.035, 0);
  });
  addBox(group, frame, width, 0.07, depth, 0, height + 0.02, 0);
  addBox(group, frame, width, 0.07, depth, 0, 0.13, 0);
  [-1, 1].forEach((side) => {
    addBox(group, panel, width * 0.44, height * 0.8, depth * 0.5,
      side * width * 0.245, height * 0.56, 0);
  });
  addBox(group, cyan, width * 0.72, 0.025, depth * 0.58, 0, 0.2, depth * 0.4);
  return finishPlaceholder(group, "partition");
}

/** Uncatalogued kinetic sculpture with a floating, asymmetric core. */
export function buildMysteriousSculptureModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const pedestal = lambert(0x343d43);
  const trim = lambert(0x78848b);
  const dark = lambert(0x151a1c);
  const violet = glow(0xd092ff);
  const cyan = glow(PALETTE.cyan);
  const size = Math.min(extentX, extentZ);

  addCylinder(group, dark, size * 0.37, size * 0.42, size * 0.12, 0, size * 0.06, 0, 10);
  addCylinder(group, pedestal, size * 0.31, size * 0.35, size * 0.58, 0, size * 0.35, 0, 10);
  addCylinder(group, trim, size * 0.34, size * 0.31, size * 0.1, 0, size * 0.68, 0, 10);
  addTorus(group, violet, size * 0.33, size * 0.035, 0, size * 1.04, 0, 7, 24).rotation.x = Math.PI * 0.5;
  const ringB = addTorus(group, cyan, size * 0.27, size * 0.028, 0, size * 1.04, 0, 7, 22);
  ringB.rotation.set(Math.PI * 0.5, 0.65, 0.42);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(size * 0.23, 0), violet);
  core.position.set(size * 0.04, size * 1.05, -size * 0.03);
  core.rotation.set(0.32, 0.68, 0.18);
  group.add(core);
  addSphere(group, cyan, size * 0.055, -size * 0.31, size * 1.2, size * 0.08, 8, 6);
  addSphere(group, violet, size * 0.045, size * 0.28, size * 0.91, -size * 0.12, 8, 6);
  addBox(group, cyan, size * 0.17, size * 0.025, size * 0.018, 0, size * 0.42, size * 0.35);
  return finishPlaceholder(group, "mysterious_sculpture");
}

/** Plain workshop desk without the terminal functions of the office desk. */
export function buildDeskModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const shell = lambert(0x48545b);
  const trim = lambert(0x7c888e);
  const dark = lambert(0x171d20);
  const cyan = glow(PALETTE.cyan);
  const top = lambert(0x58686a);
  const width = extentX * 0.88;
  const depth = extentZ * 0.76;

  [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
    addBox(group, shell, 0.11, 0.72, 0.11,
      sx * width * 0.42, 0.37, sz * depth * 0.4);
  }));
  addBox(group, dark, width * 0.94, 0.09, depth * 0.92, 0, 0.72, 0);
  addBox(group, top, width, 0.12, depth, 0, 0.82, 0);
  addBox(group, trim, width * 0.98, 0.025, depth * 0.96, 0, 0.895, 0);
  addBox(group, shell, width * 0.32, 0.37, depth * 0.72, width * 0.29, 0.52, 0);
  [-0.1, 0.12].forEach((offset) => {
    addBox(group, dark, width * 0.26, 0.13, 0.022, width * 0.29, 0.53 + offset, depth * 0.37);
    addBox(group, cyan, width * 0.07, 0.018, 0.012, width * 0.29, 0.53 + offset, depth * 0.387);
  });
  addBox(group, dark, width * 0.34, 0.035, depth * 0.38, -width * 0.18, 0.91, 0.02).rotation.y = 0.08;
  addBox(group, cyan, width * 0.24, 0.012, depth * 0.025, -width * 0.18, 0.935, depth * 0.2);
  return finishPlaceholder(group, "desk");
}

/** Mobile office whiteboard with marker tray and status notes. */
export function buildWhiteboardModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const frame = lambert(0x66747a);
  const panel = lambert(0xc3d0cc);
  const dark = lambert(0x1a2022);
  const cyan = glow(0x48dbea);
  const amber = glow(0xf5d65b);
  const width = Math.max(1.35, extentX * 0.84);
  const depth = Math.max(0.16, extentZ * 0.15);
  const boardY = 1.05;

  addBox(group, panel, width * 0.9, 0.88, depth * 0.28, 0, boardY, 0);
  addBox(group, frame, width, 0.07, depth, 0, boardY + 0.49, 0);
  addBox(group, frame, width, 0.07, depth, 0, boardY - 0.49, 0);
  [-1, 1].forEach((side) => {
    const x = side * width * 0.48;
    addBox(group, frame, 0.075, 1.02, depth, x, boardY, 0);
    addBox(group, frame, 0.07, 0.58, 0.07, x, 0.35, 0);
    addBox(group, dark, 0.34, 0.055, 0.16, x, 0.055, 0);
  });
  addBox(group, dark, width * 0.7, 0.07, 0.22, 0, 0.54, depth * 0.38);
  [-0.3, -0.08, 0.18].forEach((x, index) => {
    addBox(group, index === 2 ? amber : cyan, width * 0.16, 0.025, 0.012,
      width * x, boardY + 0.18 - index * 0.15, depth * 0.18);
  });
  addBox(group, amber, 0.16, 0.13, 0.014, width * 0.3, boardY + 0.27, depth * 0.18);
  return finishPlaceholder(group, "whiteboard");
}

/** Familiar multifunction copier with scanner lid, paper trays and control panel. */
export function buildCopierModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const shell = lambert(0x89969b);
  const light = lambert(0xb9c3c4);
  const dark = lambert(0x1a2023);
  const cyan = glow(0x5ce6dd);
  const size = Math.min(extentX, extentZ);
  const width = size * 0.78;
  const depth = size * 0.72;

  addBox(group, dark, width * 1.04, 0.09, depth * 1.04, 0, 0.045, 0);
  addBox(group, shell, width, 0.88, depth, 0, 0.5, 0);
  [-0.16, 0.08].forEach((offset) => {
    addBox(group, light, width * 0.84, 0.19, 0.035, 0, 0.42 + offset, depth * 0.51);
    addBox(group, dark, width * 0.34, 0.025, 0.018, 0, 0.42 + offset, depth * 0.535);
  });
  addBox(group, dark, width * 0.7, 0.25, 0.05, 0, 0.83, depth * 0.51);
  addBox(group, shell, width * 0.92, 0.25, depth * 0.88, 0, 1.02, -depth * 0.03);
  const lid = addBox(group, light, width, 0.09, depth * 0.92, 0, 1.2, -depth * 0.03);
  lid.rotation.x = -0.05;
  const panel = addBox(group, dark, width * 0.42, 0.08, depth * 0.25, width * 0.23, 1.16, depth * 0.48);
  panel.rotation.x = -0.2;
  addBox(group, cyan, width * 0.2, 0.012, depth * 0.13, width * 0.23, 1.205, depth * 0.49).rotation.x = -0.2;
  return finishPlaceholder(group, "copier");
}

/** Paired sorting bins with distinct illuminated lids. */
export function buildRecyclingBinModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const shell = lambert(0x455258);
  const dark = lambert(0x161c1e);
  const green = glow(0x72ffb8);
  const amber = glow(0xf5d65b);
  const size = Math.min(extentX, extentZ);

  [-1, 1].forEach((side) => {
    const x = side * size * 0.22;
    addBox(group, dark, size * 0.4, 0.08, size * 0.56, x, 0.04, 0);
    addBox(group, shell, size * 0.37, 0.7, size * 0.52, x, 0.42, 0);
    addBox(group, side < 0 ? green : amber, size * 0.39, 0.07, size * 0.55, x, 0.81, 0);
    addBox(group, dark, size * 0.24, 0.035, size * 0.12, x, 0.825, size * 0.04);
    addBox(group, side < 0 ? green : amber, size * 0.16, 0.025, 0.014, x, 0.49, size * 0.27);
  });
  return finishPlaceholder(group, "recycling_bin");
}

/** Umbrella stand carrying a few mismatched communal umbrellas. */
export function buildUmbrellaStandModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const shell = lambert(0x4b575d);
  const dark = lambert(0x1a2022);
  const amber = glow(0xf5d65b);
  const cyan = glow(0x48dbea);
  const size = Math.min(extentX, extentZ);

  addCylinder(group, dark, size * 0.32, size * 0.36, 0.1, 0, 0.05, 0, 14);
  addCylinder(group, shell, size * 0.29, size * 0.32, 0.64, 0, 0.38, 0, 14, true);
  addTorus(group, cyan, size * 0.29, size * 0.025, 0, 0.7, 0, 7, 22).rotation.x = Math.PI / 2;
  [
    [-0.15, 0.02, -0.08, amber, -0.1],
    [0.1, -0.02, 0.03, cyan, 0.08],
    [0.02, 0.12, -0.04, lambert(0xa272c7), 0.02]
  ].forEach(([x, z, lean, material, sway]) => {
    const bottom = new THREE.Vector3(size * x, 0.18, size * z);
    const top = new THREE.Vector3(size * (x + lean), 1.34, size * (z + sway));
    addPipeBetween(group, shell, size * 0.024, bottom, top, 8);
    addCylinder(group, material, size * 0.07, size * 0.025, 0.17,
      top.x, top.y + 0.08, top.z, 10);
  });
  return finishPlaceholder(group, "umbrella_stand");
}

/** Freestanding coat hanger with work jackets left on its hooks. */
export function buildCoatHangerModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const frame = lambert(0x59666c);
  const dark = lambert(0x20272a);
  const violet = lambert(0x705d86);
  const green = lambert(0x496f62);
  const cyan = glow(0x48dbea);
  const size = Math.min(extentX, extentZ);

  addCylinder(group, dark, size * 0.35, size * 0.4, 0.1, 0, 0.05, 0, 12);
  addCylinder(group, frame, size * 0.045, size * 0.055, 1.55, 0, 0.82, 0, 10);
  [-1, 1].forEach((side) => {
    addPipeBetween(group, frame, size * 0.035,
      new THREE.Vector3(0, 1.34, 0), new THREE.Vector3(side * size * 0.31, 1.55, 0), 8);
    addPipeBetween(group, frame, size * 0.03,
      new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(0, 1.42, side * size * 0.27), 8);
  });
  const coatA = addBox(group, violet, size * 0.38, 0.72, size * 0.08, -size * 0.21, 0.93, 0.02);
  coatA.rotation.z = 0.08;
  const coatB = addBox(group, green, size * 0.34, 0.62, size * 0.08, size * 0.22, 0.98, -0.01);
  coatB.rotation.z = -0.07;
  addBox(group, cyan, size * 0.18, 0.025, 0.014, 0, 0.3, size * 0.055);
  return finishPlaceholder(group, "coat_hanger");
}

/** Communal pressure coffee maker on its own compact counter. */
export function buildCoffeeMachineModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const shell = lambert(0x4c575b);
  const light = lambert(0x889397);
  const dark = lambert(0x171d1f);
  const glass = transparentLambert(0x7f4d31, 0.62);
  const amber = glow(0xf5d65b);
  const cyan = glow(0x48dbea);
  const size = Math.min(extentX, extentZ);

  addBox(group, dark, size * 0.72, 0.09, size * 0.66, 0, 0.045, 0);
  addBox(group, shell, size * 0.68, 0.72, size * 0.62, 0, 0.42, 0);
  addBox(group, dark, size * 0.5, 0.32, 0.045, 0, 0.45, size * 0.32);
  addCylinder(group, light, size * 0.04, size * 0.04, 0.18, 0, 0.62, size * 0.36, 10);
  addBox(group, light, size * 0.38, 0.045, size * 0.24, 0, 0.24, size * 0.22);
  addCylinder(group, light, size * 0.11, size * 0.1, 0.19, 0, 0.34, size * 0.24, 14);
  addCylinder(group, glass, size * 0.22, size * 0.24, 0.35, 0, 0.91, 0, 16, true);
  addCylinder(group, dark, size * 0.25, size * 0.22, 0.08, 0, 1.105, 0, 14);
  addBox(group, amber, size * 0.08, 0.035, 0.015, -size * 0.16, 0.75, size * 0.32);
  addBox(group, cyan, size * 0.08, 0.035, 0.015, size * 0.16, 0.75, size * 0.32);
  return finishPlaceholder(group, "coffee_machine");
}

/** Shared refrigerator with labelled containers and warning notes. */
export function buildStaffFridgeModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const shell = lambert(0x77858b);
  const door = lambert(0x9aa7aa);
  const dark = lambert(0x192023);
  const cyan = glow(0x62e8df);
  const amber = glow(0xf5d65b);
  const size = Math.min(extentX, extentZ);
  const width = size * 0.75;
  const depth = size * 0.68;

  addBox(group, dark, width * 1.05, 0.09, depth * 1.05, 0, 0.045, 0);
  addBox(group, shell, width, 1.48, depth, 0, 0.79, 0);
  addBox(group, door, width * 0.94, 0.92, 0.04, 0, 1.06, depth * 0.52);
  addBox(group, door, width * 0.94, 0.42, 0.04, 0, 0.36, depth * 0.52);
  addBox(group, dark, width * 0.06, 0.46, 0.025, width * 0.34, 1.03, depth * 0.55);
  addBox(group, dark, width * 0.06, 0.19, 0.025, width * 0.34, 0.37, depth * 0.55);
  addBox(group, amber, width * 0.18, 0.14, 0.015, -width * 0.2, 1.22, depth * 0.55);
  addBox(group, cyan, width * 0.16, 0.1, 0.015, width * 0.02, 0.88, depth * 0.55);
  addBox(group, dark, width * 1.03, 0.08, depth * 1.02, 0, 1.56, 0);
  return finishPlaceholder(group, "staff_fridge");
}

/** Microwave and storage cabinet combined into a compact break-room station. */
export function buildMicrowaveStationModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const cabinet = lambert(0x536066);
  const shell = lambert(0x8a969a);
  const dark = lambert(0x171d20);
  const cyan = glow(0x48dbea);
  const amber = glow(0xf5d65b);
  const size = Math.min(extentX, extentZ);

  addBox(group, dark, size * 0.76, 0.09, size * 0.7, 0, 0.045, 0);
  addBox(group, cabinet, size * 0.72, 0.58, size * 0.66, 0, 0.36, 0);
  addBox(group, dark, size * 0.58, 0.04, size * 0.035, 0, 0.36, size * 0.345);
  addBox(group, shell, size * 0.76, 0.06, size * 0.7, 0, 0.68, 0);
  addBox(group, shell, size * 0.72, 0.5, size * 0.62, 0, 0.96, 0);
  addBox(group, dark, size * 0.47, 0.34, 0.035, -size * 0.08, 0.96, size * 0.325);
  addBox(group, cyan, size * 0.14, 0.055, 0.015, size * 0.22, 1.08, size * 0.345);
  [0.93, 0.83].forEach((y, index) => {
    addSphere(group, index ? amber : cyan, size * 0.035, size * 0.22, y, size * 0.345, 8, 6);
  });
  addBox(group, dark, size * 0.76, 0.07, size * 0.66, 0, 1.245, 0);
  return finishPlaceholder(group, "microwave_station");
}

/** Floor-mounted first-aid cabinet with a luminous medical cross. */
export function buildFirstAidCabinetModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const shell = lambert(0x657277);
  const light = lambert(0xa8b2b2);
  const dark = lambert(0x1b2123);
  const red = glow(0xff626c);
  const cyan = glow(0x48dbea);
  const size = Math.min(extentX, extentZ);

  addBox(group, dark, size * 0.68, 0.09, size * 0.6, 0, 0.045, 0);
  addBox(group, shell, size * 0.62, 0.68, size * 0.54, 0, 0.39, 0);
  addBox(group, shell, size * 0.64, 0.9, size * 0.52, 0, 0.96, 0);
  addBox(group, light, size * 0.58, 0.82, size * 0.045, 0, 0.96, size * 0.29);
  addBox(group, red, size * 0.3, 0.09, 0.018, 0, 1.02, size * 0.32);
  addBox(group, red, size * 0.09, 0.3, 0.018, 0, 1.02, size * 0.32);
  addBox(group, dark, size * 0.04, 0.2, 0.018, size * 0.23, 0.82, size * 0.32);
  addBox(group, cyan, size * 0.12, 0.025, 0.014, 0, 0.3, size * 0.29);
  return finishPlaceholder(group, "first_aid_cabinet");
}

/** Oversized communal massage chair with articulated foot rest. */
export function buildMassageChairModel({ extentX, extentZ }) {
  const group = new THREE.Group();
  const frame = lambert(0x30393d);
  const shell = lambert(0x46645f);
  const cushion = lambert(0x5b8178);
  const dark = lambert(0x171d1f);
  const cyan = glow(0x72ffb8);
  const width = Math.min(1.05, Math.max(0.72, extentX * 0.46));
  const depth = Math.min(1.65, Math.max(0.95, extentZ * 0.82));

  addBox(group, dark, width * 0.86, 0.14, depth * 0.62, 0, 0.1, -depth * 0.02);
  const seat = addBox(group, cushion, width * 0.72, 0.24, depth * 0.52, 0, 0.48, depth * 0.03);
  seat.rotation.x = -0.08;
  const back = addBox(group, cushion, width * 0.76, 1.08, depth * 0.25, 0, 0.98, -depth * 0.36);
  back.rotation.x = -0.22;
  [-1, 1].forEach((side) => {
    const arm = addBox(group, shell, width * 0.18, 0.34, depth * 0.63,
      side * width * 0.46, 0.56, -depth * 0.01);
    arm.rotation.x = -0.06;
    addBox(group, cyan, width * 0.1, 0.025, depth * 0.24,
      side * width * 0.46, 0.76, depth * 0.01);
  });
  const legRest = addBox(group, cushion, width * 0.62, 0.22, depth * 0.46, 0, 0.31, depth * 0.47);
  legRest.rotation.x = 0.22;
  addBox(group, frame, width * 0.68, 0.18, depth * 0.16, 0, 0.22, depth * 0.75).rotation.x = 0.22;
  addBox(group, cyan, width * 0.34, 0.03, 0.018, 0, 0.9, -depth * 0.5);
  return finishPlaceholder(group, "massage_chair");
}

/** Tabletop fruit service: shallow metal dish with preserved fruit. */
export function buildFruitPlatterModel() {
  const group = new THREE.Group();
  const tray = lambert(0x7d8a8e);
  const dark = lambert(0x22292c);
  const leaf = lambert(0x4c9b67);
  const red = lambert(0xd85c55);
  const amber = lambert(0xe3ad4a);
  const green = lambert(0x83b95d);
  addCylinder(group, dark, 0.3, 0.32, 0.045, 0, 0.035, 0, 20);
  addCylinder(group, tray, 0.28, 0.3, 0.055, 0, 0.075, 0, 20);
  [
    [-0.14, 0.17, red, 0.105], [0.02, 0.16, amber, 0.115], [0.15, 0.1, green, 0.1],
    [-0.04, -0.02, green, 0.11], [0.12, -0.08, red, 0.095], [-0.17, -0.1, amber, 0.09]
  ].forEach(([x, z, material, radius], index) => {
    addSphere(group, material, radius, x, 0.15 + (index % 2) * 0.035, z, 10, 7);
  });
  const leafA = addBox(group, leaf, 0.2, 0.025, 0.08, -0.08, 0.245, 0.04);
  leafA.rotation.y = 0.48;
  const leafB = addBox(group, leaf, 0.17, 0.022, 0.07, 0.06, 0.238, -0.02);
  leafB.rotation.y = -0.62;
  return finishPlaceholder(group, "fruit_platter");
}

/** Tabletop legacy telephone with a heavy handset and luminous status lamp. */
export function buildBlackPhoneModel() {
  const group = new THREE.Group();
  const shell = lambert(0x171b1d);
  const edge = lambert(0x485258);
  const dial = lambert(0x777f82);
  const cyan = glow(0x48dbea);
  addBox(group, shell, 0.54, 0.16, 0.42, 0, 0.1, 0);
  addBox(group, edge, 0.48, 0.055, 0.36, 0, 0.205, 0);
  addCylinder(group, shell, 0.14, 0.14, 0.05, 0, 0.25, 0.05, 18).rotation.x = Math.PI / 2;
  addTorus(group, dial, 0.105, 0.022, 0, 0.278, 0.075, 8, 24).rotation.x = Math.PI / 2;
  const handset = new THREE.Group();
  handset.position.set(0, 0.34, -0.04);
  addBox(handset, shell, 0.42, 0.075, 0.09, 0, 0, 0);
  addCylinder(handset, shell, 0.085, 0.085, 0.13, -0.23, 0, 0, 12).rotation.z = Math.PI / 2;
  addCylinder(handset, shell, 0.085, 0.085, 0.13, 0.23, 0, 0, 12).rotation.z = Math.PI / 2;
  handset.rotation.y = -0.08;
  group.add(handset);
  addBox(group, cyan, 0.055, 0.018, 0.018, 0.18, 0.218, 0.19);
  return finishPlaceholder(group, "black_phone");
}

/** Tabletop snack service: a tray of individually wrapped sweets and crackers. */
export function buildSnackPlatterModel() {
  const group = new THREE.Group();
  const tray = lambert(0x6f747d);
  const dark = lambert(0x24292e);
  const violet = lambert(0xae72c7);
  const amber = lambert(0xdd9f42);
  const cyan = lambert(0x4caeb5);
  addBox(group, dark, 0.62, 0.045, 0.42, 0, 0.03, 0);
  addBox(group, tray, 0.58, 0.055, 0.38, 0, 0.075, 0);
  [
    [-0.18, 0.09, violet, -0.22], [0.02, 0.1, amber, 0.16], [0.2, 0.06, cyan, -0.12],
    [-0.1, -0.1, cyan, 0.2], [0.13, -0.11, violet, -0.18]
  ].forEach(([x, z, material, angle], index) => {
    const packet = addBox(group, material, index % 2 ? 0.17 : 0.15, 0.055, 0.12, x, 0.14, z);
    packet.rotation.y = angle;
    addBox(group, glow(index % 2 ? 0xf5d65b : 0x72ffb8), 0.07, 0.012, 0.018, x, 0.172, z + 0.061);
  });
  return finishPlaceholder(group, "snack_platter");
}

export function buildCleaningBrushModel() {
  const group = new THREE.Group();
  const shell = lambert(PALETTE.metalMid);
  const dark = lambert(PALETTE.rubber);
  const bristle = lambert(0x55a77a);
  const cyan = glow();
  addBox(group, shell, 0.86, 0.18, 0.38, -0.28, 0.2, 0);
  addBox(group, dark, 0.72, 0.08, 0.31, -0.28, 0.09, 0);
  [-0.58, -0.43, -0.28, -0.13, 0.02].forEach((x) => {
    addBox(group, bristle, 0.075, 0.2, 0.27, x, -0.02, 0);
  });
  addPipeBetween(group, shell, 0.075,
    new THREE.Vector3(0.04, 0.28, 0), new THREE.Vector3(0.86, 1.22, 0), 12);
  addPipeBetween(group, dark, 0.1,
    new THREE.Vector3(0.64, 0.96, 0), new THREE.Vector3(0.92, 1.28, 0), 12);
  addBox(group, cyan, 0.31, 0.045, 0.055, -0.28, 0.31, 0.2);
  return group;
}

export function buildCleaningBucketModel() {
  const group = new THREE.Group();
  const shell = lambert(0x335d70);
  const dark = lambert(PALETTE.rubber);
  const rim = glow(0x55dbe3);
  const water = transparentLambert(0x4bdde7, 0.72);
  addCylinder(group, dark, 0.5, 0.42, 0.12, 0, 0.08, 0, 18);
  addCylinder(group, shell, 0.55, 0.45, 0.72, 0, 0.46, 0, 18, true);
  addCylinder(group, water, 0.47, 0.47, 0.035, 0, 0.79, 0, 24);
  addTorus(group, rim, 0.54, 0.035, 0, 0.82, 0, 8, 28).rotation.x = Math.PI / 2;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.63, 0.035, 8, 28, Math.PI), shell);
  handle.position.y = 0.78;
  group.add(handle);
  addBox(group, rim, 0.38, 0.05, 0.055, 0, 0.45, 0.49);
  return group;
}
export function buildPlantSprayerModel() {
  const group = new THREE.Group();
  const shell = lambert(0x2c5260);
  const dark = lambert(PALETTE.rubber);
  const cyan = glow(0x52e8df);
  const reservoir = transparentLambert(0x5edfd0, 0.68);

  addCylinder(group, dark, 0.31, 0.34, 0.09, 0, 0.06, 0, 18);
  addCylinder(group, reservoir, 0.28, 0.32, 0.66, 0, 0.42, 0, 22);
  addTorus(group, cyan, 0.285, 0.025, 0, 0.69, 0, 7, 26).rotation.x = Math.PI / 2;
  addCylinder(group, shell, 0.15, 0.19, 0.2, 0, 0.83, 0, 16);
  addBox(group, shell, 0.43, 0.18, 0.27, 0.09, 1.01, 0);
  addPipeBetween(group, shell, 0.06,
    new THREE.Vector3(0.25, 1.04, 0),
    new THREE.Vector3(0.72, 1.11, 0), 12);
  addCylinder(group, cyan, 0.09, 0.07, 0.16, 0.79, 1.12, 0, 12).rotation.z = Math.PI / 2;
  const trigger = addBox(group, dark, 0.09, 0.34, 0.08, -0.01, 0.82, 0);
  trigger.rotation.z = -0.24;
  addBox(group, cyan, 0.04, 0.26, 0.05, 0.21, 0.4, 0.3);
  return group;
}

export function buildMaintenanceWrenchModel() {
  const group = new THREE.Group();
  const shell = lambert(0x7d9698);
  const dark = lambert(PALETTE.rubber);
  const cyan = glow(0x52e8df);

  const handleStart = new THREE.Vector3(-0.48, 0.2, 0);
  const handleEnd = new THREE.Vector3(0.42, 1.08, 0);
  addPipeBetween(group, shell, 0.105, handleStart, handleEnd, 14);
  addPipeBetween(group, cyan, 0.025,
    new THREE.Vector3(-0.35, 0.32, 0.105),
    new THREE.Vector3(0.27, 0.93, 0.105), 8);

  const grip = addCylinder(group, dark, 0.2, 0.2, 0.16, -0.51, 0.17, 0, 16);
  grip.rotation.x = Math.PI / 2;
  const gripCore = addCylinder(group, cyan, 0.09, 0.09, 0.18, -0.51, 0.17, 0, 14);
  gripCore.rotation.x = Math.PI / 2;

  const head = new THREE.Mesh(
    new THREE.TorusGeometry(0.27, 0.105, 10, 30, Math.PI * 1.38),
    shell
  );
  head.position.set(0.52, 1.18, 0);
  head.rotation.z = -0.88;
  group.add(head);
  const jawA = addBox(group, shell, 0.32, 0.18, 0.22, 0.72, 1.3, 0);
  jawA.rotation.z = -0.62;
  const jawB = addBox(group, shell, 0.32, 0.18, 0.22, 0.42, 1.48, 0);
  jawB.rotation.z = 0.38;
  addBox(group, cyan, 0.19, 0.045, 0.24, 0.5, 1.12, 0);
  return group;
}

/** 闇市場への足として常設される、無銘の配達用電動キックボード。 */
export function buildMarketCourierScooterModel() {
  const group = new THREE.Group();
  const frame = lambert(0x6f7b80);
  const frameDark = lambert(0x252d31);
  const rubber = lambert(PALETTE.rubber);
  const courier = lambert(0xb7d83f);
  const cargoDark = lambert(0x303a31);
  const cyan = glow(0x48dbea);
  const amber = glow(0xf5d65b);

  [-0.59, 0.59].forEach((z) => {
    const tyre = addTorus(group, rubber, 0.2, 0.065, 0, 0.24, z, 8, 24);
    tyre.rotation.y = Math.PI / 2;
    const hub = addCylinder(group, frame, 0.075, 0.075, 0.32, 0, 0.24, z, 12);
    hub.rotation.z = Math.PI / 2;
    const hubGlow = addCylinder(group, cyan, 0.028, 0.028, 0.335, 0, 0.24, z, 10);
    hubGlow.rotation.z = Math.PI / 2;
  });

  addBox(group, frameDark, 0.34, 0.11, 1.02, 0, 0.34, -0.02);
  addBox(group, courier, 0.28, 0.035, 0.78, 0, 0.407, -0.04);
  addBox(group, cyan, 0.25, 0.024, 0.05, 0, 0.43, 0.34);

  addPipeBetween(group, frame, 0.055,
    new THREE.Vector3(0, 0.34, 0.49),
    new THREE.Vector3(0, 1.39, 0.63), 12);
  addPipeBetween(group, frameDark, 0.048,
    new THREE.Vector3(-0.37, 1.41, 0.64),
    new THREE.Vector3(0.37, 1.41, 0.64), 12);
  addPipeBetween(group, rubber, 0.073,
    new THREE.Vector3(-0.49, 1.41, 0.64),
    new THREE.Vector3(-0.31, 1.41, 0.64), 12);
  addPipeBetween(group, rubber, 0.073,
    new THREE.Vector3(0.31, 1.41, 0.64),
    new THREE.Vector3(0.49, 1.41, 0.64), 12);
  addBox(group, frameDark, 0.18, 0.12, 0.1, 0, 1.32, 0.63);
  const display = addBox(group, cyan, 0.12, 0.065, 0.018, 0, 1.34, 0.57);
  display.rotation.x = -0.18;

  const cargo = addBox(group, cargoDark, 0.72, 0.66, 0.57, 0, 0.82, -0.45);
  cargo.rotation.x = -0.025;
  addBox(group, courier, 0.65, 0.075, 0.51, 0, 1.19, -0.45);
  addBox(group, courier, 0.05, 0.46, 0.59, -0.36, 0.84, -0.45);
  addBox(group, courier, 0.05, 0.46, 0.59, 0.36, 0.84, -0.45);
  addBox(group, cyan, 0.38, 0.035, 0.02, 0, 0.84, -0.742);
  addBox(group, amber, 0.09, 0.09, 0.025, 0.24, 0.84, -0.746);

  const headlight = addCylinder(group, cyan, 0.085, 0.085, 0.08, 0, 1.22, 0.68, 16);
  headlight.rotation.x = Math.PI / 2;
  headlight.name = "market-scooter-headlight";
  const tailLight = addBox(group, amber, 0.18, 0.07, 0.035, 0, 0.55, -0.68);
  tailLight.name = "market-scooter-tail-light";

  addPipeBetween(group, frameDark, 0.027,
    new THREE.Vector3(0.13, 0.29, -0.28),
    new THREE.Vector3(0.33, 0.03, -0.18), 8);
  group.userData.modelId = "market_courier_scooter";
  return group;
}

export const MODEL_BUILDERS = Object.freeze({
  pod: buildPodModel,
  box: buildBoxModel,
  light: buildAreaLightModel,
  fan: buildAreaFanModel,
  support_robot: buildRobotModel,
  procurement_terminal: buildProcurementTerminalModel,
  shipping_hatch: buildShippingHatchModel,
  radio: buildRadioModel,
  office_desk: buildOfficeDeskModel,
  sofa: buildSofaModel,
  locker: buildLockerModel,
  houseplant: buildHouseplantModel,
  juice_server: buildJuiceServerModel,
  partition: buildPartitionModel,
  mysterious_sculpture: buildMysteriousSculptureModel,
  desk: buildDeskModel,
  fruit_platter: buildFruitPlatterModel,
  black_phone: buildBlackPhoneModel,
  snack_platter: buildSnackPlatterModel,
  whiteboard: buildWhiteboardModel,
  copier: buildCopierModel,
  recycling_bin: buildRecyclingBinModel,
  umbrella_stand: buildUmbrellaStandModel,
  coat_hanger: buildCoatHangerModel,
  coffee_machine: buildCoffeeMachineModel,
  staff_fridge: buildStaffFridgeModel,
  microwave_station: buildMicrowaveStationModel,
  first_aid_cabinet: buildFirstAidCabinetModel,
  massage_chair: buildMassageChairModel,
  filter: buildWaterGeneratorModel,
  tank: buildNutrientCultureModel
});
