"use strict";

const INTRO_LINES = [
  "人類はいま、核戦争によって壊滅した地球において、緩やかな滅亡へと向かっている。",
  "土も空気も汚染され、地下シェルターへと逃げ延びた人々は、食料生産企業によって厳しく統制されている。",
  "人類史をとおして長らく続いた武器による支配は、食料生産独占による支配に置き換わった。",
  "ホコリと鉄サビにまみれたシェルター。",
  "失われた知識を手に、禁じられた食糧生産を始めた主人公。",
  "その行為は人類の未来になにをもたらすのだろうか？"
];

const TOOL_COPY = {
  seed: {
    title: "レタスの種を選択中",
    help: "種は無限です。空いているPODをクリックして植えてください。",
    robot: "種の在庫は、なぜか減りません。"
  },
  spray: {
    title: "霧吹きを選択中",
    help: "生育中のレタスに水を与え、成長を1段階進めます。",
    robot: "葉の根元へ、やさしくお願いします。"
  },
  bucket: {
    title: "バケツを選択中",
    help: "収穫後の汚れたPODを水で洗い流します。",
    robot: "床にこぼしても、私は見ています。"
  },
  brush: {
    title: "ブラシを選択中",
    help: "水洗いしたPODを磨き、次の植え付けに備えます。",
    robot: "仕上げ磨きは、人類の仕事です。"
  }
};

const podStates = [
  { stage: 5, dirt: 0 },
  { stage: 2, dirt: 0 },
  { stage: 0, dirt: 0 }
];

let selectedTool = "seed";
let harvestCount = 0;
let introStopped = false;
let introTimer = 0;
let lastPanelTrigger = null;

const intro = document.getElementById("intro");
const introCopy = document.getElementById("intro-copy");
const introSkip = document.getElementById("intro-skip");
const siteHeader = document.querySelector(".site-header");
const gameShell = document.querySelector(".game-shell");
const farmLog = document.getElementById("farm-log");
const actionTitle = document.getElementById("action-title");
const actionHelp = document.getElementById("action-help");
const robotSpeech = document.getElementById("robot-speech");
const harvestCounter = document.getElementById("harvest-count");
const infoLayer = document.getElementById("info-layer");
const plantDataName = document.getElementById("plant-data-name");
const plantDataGrowth = document.getElementById("plant-data-growth");

function renderIntroLines(full = false) {
  introCopy.innerHTML = "";
  INTRO_LINES.forEach((line) => {
    const paragraph = document.createElement("p");
    if (full) paragraph.textContent = line;
    introCopy.appendChild(paragraph);
  });
}

function closeIntro() {
  if (introStopped) return;
  introStopped = true;
  window.clearTimeout(introTimer);
  intro.classList.add("is-finished");
  intro.setAttribute("aria-hidden", "true");
  intro.inert = true;
  document.body.classList.remove("is-intro");
  document.body.classList.add("intro-complete");
  siteHeader.inert = false;
  gameShell.inert = false;
  window.setTimeout(() => intro.setAttribute("hidden", ""), 1050);
}

function finishIntroTyping() {
  if (introStopped) return;
  introSkip.innerHTML = "ENTER <span aria-hidden=\"true\">↗</span>";
  introTimer = window.setTimeout(closeIntro, 1350);
}

function playIntro() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  siteHeader.inert = true;
  gameShell.inert = true;
  if (new URLSearchParams(window.location.search).has("skipIntro")) {
    renderIntroLines(true);
    requestAnimationFrame(closeIntro);
    return;
  }
  renderIntroLines(reducedMotion);
  introSkip.focus({ preventScroll: true });

  if (reducedMotion) {
    introTimer = window.setTimeout(finishIntroTyping, 500);
    return;
  }

  const paragraphs = [...introCopy.querySelectorAll("p")];
  let lineIndex = 0;
  let characterIndex = 0;

  function typeNext() {
    if (introStopped) return;
    const line = Array.from(INTRO_LINES[lineIndex]);
    paragraphs[lineIndex].textContent += line[characterIndex];
    characterIndex += 1;

    if (characterIndex < line.length) {
      introTimer = window.setTimeout(typeNext, 14 + Math.random() * 10);
      return;
    }

    lineIndex += 1;
    characterIndex = 0;
    if (lineIndex < INTRO_LINES.length) {
      introTimer = window.setTimeout(typeNext, lineIndex === 3 ? 410 : 120);
    } else {
      finishIntroTyping();
    }
  }

  introTimer = window.setTimeout(typeNext, 420);
}

function speak(message) {
  const parts = String(message).split("|");
  robotSpeech.innerHTML = parts.map((part) => part.trim()).join("<br>");
  robotSpeech.classList.remove("is-talking");
  void robotSpeech.offsetWidth;
  robotSpeech.classList.add("is-talking");
}

function log(message, robotMessage = "") {
  farmLog.textContent = message;
  if (robotMessage) speak(robotMessage);
}

function animatePod(index, effect) {
  const pod = document.querySelector(`[data-pod="${index}"]`);
  const className = `fx-${effect}`;
  pod.classList.remove("fx-seed", "fx-spray", "fx-bucket", "fx-brush", "fx-harvest");
  void pod.offsetWidth;
  pod.classList.add(className);
  window.officialFarm3d?.animateTool(index, effect);
  window.setTimeout(() => pod.classList.remove(className), 850);
}

function updatePlantData(index) {
  const state = podStates[index];
  if (!state || !plantDataName || !plantDataGrowth) return;
  if (state.stage > 0) {
    plantDataName.textContent = `LETTUCE / POD 0${index + 1}`;
    plantDataGrowth.textContent = `${state.stage * 20}%`;
  } else if (state.dirt > 0) {
    plantDataName.textContent = `POD 0${index + 1} / CLEANING`;
    plantDataGrowth.textContent = state.dirt === 2 ? "DIRTY" : "RINSED";
  } else {
    plantDataName.textContent = `POD 0${index + 1} / EMPTY`;
    plantDataGrowth.textContent = "0%";
  }
}

function renderPod(index, animateGrowth = false) {
  const state = podStates[index];
  const pod = document.querySelector(`[data-pod="${index}"]`);
  const label = pod.querySelector("strong");
  const meter = pod.querySelector("i b");
  let status = "空き";
  let progress = 0;

  pod.classList.toggle("is-ready", state.stage === 5);
  pod.classList.toggle("is-dirty", state.dirt > 0);
  pod.classList.toggle("is-rinsed", state.dirt === 1);

  if (state.stage > 0) {
    progress = state.stage * 20;
    status = state.stage === 5 ? "収穫可能" : `生育 0${state.stage} / 05`;
  } else {
    if (state.dirt === 2) {
      status = "洗浄が必要";
      progress = 100;
    } else if (state.dirt === 1) {
      status = "ブラシ仕上げ待ち";
      progress = 50;
    }
  }

  label.textContent = status;
  meter.style.width = `${progress}%`;
  pod.setAttribute("aria-label", `栽培POD 0${index + 1}、${status}`);
  window.officialFarm3d?.setPodState(index, state);
  updatePlantData(index);

  if (animateGrowth) {
    pod.classList.remove("is-growing");
    void pod.offsetWidth;
    pod.classList.add("is-growing");
    window.setTimeout(() => pod.classList.remove("is-growing"), 700);
  }
}

function setTool(toolName) {
  if (!TOOL_COPY[toolName]) return;
  selectedTool = toolName;
  document.querySelectorAll("button.tool[data-tool]").forEach((button) => {
    const selected = button.dataset.tool === toolName;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  actionTitle.textContent = TOOL_COPY[toolName].title;
  actionHelp.textContent = TOOL_COPY[toolName].help;
  window.officialFarm3d?.setSelectedTool(toolName);
  log(TOOL_COPY[toolName].help, TOOL_COPY[toolName].robot);
}

function harvestPod(index) {
  const state = podStates[index];
  animatePod(index, "harvest");
  state.stage = 0;
  state.dirt = 2;
  harvestCount += 1;
  harvestCounter.textContent = String(harvestCount).padStart(2, "0");
  renderPod(index);
  log(`POD 0${index + 1}: レタスを収穫しました。次の植え付けには清掃が必要です。`, "収穫を確認しました。|バケツ、次にブラシです。");
}

function interactWithPod(index) {
  const state = podStates[index];

  if (state.stage === 5) {
    harvestPod(index);
    return;
  }

  if (state.dirt > 0) {
    if (selectedTool === "bucket" && state.dirt === 2) {
      state.dirt = 1;
      animatePod(index, "bucket");
      renderPod(index);
      log(`POD 0${index + 1}: 汚れを水で洗い流しました。ブラシで仕上げてください。`, "水洗い完了。|まだ少し、汚れています。");
      return;
    }
    if (selectedTool === "brush" && state.dirt === 1) {
      state.dirt = 0;
      animatePod(index, "brush");
      renderPod(index);
      log(`POD 0${index + 1}: 清掃完了。新しい種を植えられます。`, "きれいになりました。|私はずっと見ていました。");
      return;
    }
    if (selectedTool === "brush" && state.dirt === 2) {
      log(`POD 0${index + 1}: 固着した汚れです。先にバケツで水洗いしてください。`, "順番は、バケツからです。");
      return;
    }
    log(`POD 0${index + 1}: 収穫後のPODです。${state.dirt === 2 ? "バケツで洗って" : "ブラシで磨いて"}ください。`, "清掃しないと、次の種は植えられません。");
    return;
  }

  if (state.stage === 0) {
    if (selectedTool !== "seed") {
      log(`POD 0${index + 1}: 空のPODです。レタスの種を選んでください。`, "空っぽです。|種なら、無限にあります。");
      return;
    }
    state.stage = 1;
    animatePod(index, "seed");
    renderPod(index, true);
    log(`POD 0${index + 1}: レタスを播種しました。次は霧吹きで育てましょう。`, "植え付けを確認。|小さな芽が出ています。");
    return;
  }

  if (selectedTool !== "spray") {
    log(`POD 0${index + 1}: 生育中です。霧吹きを選んで水を与えてください。`, "生育には、霧吹きを使います。");
    return;
  }

  state.stage += 1;
  animatePod(index, "spray");
  renderPod(index, true);
  if (state.stage === 5) {
    log(`POD 0${index + 1}: レタスが収穫可能になりました。PODをクリックして収穫できます。`, "よく育ちました。|収穫を待っています。");
  } else {
    log(`POD 0${index + 1}: 給水完了。生育段階 0${state.stage} / 05。`, "葉が少し大きくなりました。");
  }
}

function openPanel(panelName, trigger) {
  const panel = document.querySelector(`[data-info="${panelName}"]`);
  if (!panel) return;
  lastPanelTrigger = trigger || document.activeElement;
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    const active = tab.dataset.panel === panelName;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-expanded", String(active));
  });
  document.querySelectorAll(".info-panel").forEach((entry) => entry.classList.toggle("is-active", entry === panel));
  infoLayer.classList.add("is-open");
  infoLayer.setAttribute("aria-hidden", "false");
  gameShell.inert = true;
  document.body.classList.add("panel-open");
  window.setTimeout(() => panel.querySelector(".panel-close").focus(), 80);
}

function closePanel() {
  if (!infoLayer.classList.contains("is-open")) return;
  infoLayer.classList.remove("is-open");
  infoLayer.setAttribute("aria-hidden", "true");
  gameShell.inert = false;
  document.body.classList.remove("panel-open");
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.remove("is-active");
    tab.setAttribute("aria-expanded", "false");
  });
  document.querySelectorAll(".info-panel").forEach((panel) => panel.classList.remove("is-active"));
  if (lastPanelTrigger instanceof HTMLElement) lastPanelTrigger.focus({ preventScroll: true });
}

function trapPanelFocus(event) {
  if (event.key !== "Tab" || !infoLayer.classList.contains("is-open")) return;
  const activePanel = document.querySelector(".info-panel.is-active");
  const focusable = [...activePanel.querySelectorAll('button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hasAttribute("disabled"));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

introSkip.addEventListener("click", closeIntro);
document.querySelectorAll("button.tool[data-tool]").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
document.querySelectorAll("[data-pod]").forEach((pod) => pod.addEventListener("click", () => interactWithPod(Number(pod.dataset.pod))));
document.addEventListener("official-farm3d:pod", (event) => interactWithPod(Number(event.detail.index)));
document.addEventListener("official-farm3d:hover", (event) => updatePlantData(Number(event.detail.index)));
document.addEventListener("official-farm3d:ready", () => {
  podStates.forEach((_, index) => renderPod(index));
  window.officialFarm3d?.setSelectedTool(selectedTool);
});
document.querySelectorAll(".nav-tab").forEach((tab) => {
  tab.setAttribute("aria-expanded", "false");
  tab.addEventListener("click", () => openPanel(tab.dataset.panel, tab));
});
document.querySelectorAll(".panel-close, .info-backdrop").forEach((button) => button.addEventListener("click", closePanel));
document.querySelector(".brand").addEventListener("click", closePanel);

document.addEventListener("keydown", (event) => {
  if (!introStopped && (event.key === "Escape" || event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    closeIntro();
    return;
  }
  if (event.key === "Escape") {
    closePanel();
    return;
  }
  trapPanelFocus(event);
  if (infoLayer.classList.contains("is-open") || event.ctrlKey || event.metaKey || event.altKey) return;
  const shortcut = { w: "spray", b: "bucket", r: "brush", s: "seed" }[event.key.toLowerCase()];
  if (shortcut) setTool(shortcut);
});

podStates.forEach((_, index) => renderPod(index));
window.setInterval(() => {
  const clock = document.getElementById("scene-clock");
  if (!clock) return;
  const now = new Date();
  clock.textContent = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}, 1000);
playIntro();
