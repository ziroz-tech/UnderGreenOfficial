"use strict";

const INTRO_LINES = [
  "人類はいま、核戦争によって壊滅した地球において、緩やかな滅亡へと向かっている。",
  "土も空気も汚染され、地下シェルターへと逃げ延びた人々は、食料生産企業によって厳しく統制されている。",
  "人類史をとおして長らく続いた武器による支配は、食料生産独占による支配に置き換わった。",
  "ホコリと鉄サビにまみれたシェルター。",
  "失われた知識を手に、禁じられた食糧生産を始めた主人公。",
  "その行為は人類の未来になにをもたらすのだろうか？"
];

const intro = document.getElementById("intro");
const introCopy = document.getElementById("intro-copy");
const introSkip = document.getElementById("intro-skip");
const introLoadingStatus = document.getElementById("intro-loading-status");
const introLoadingProgress = document.getElementById("intro-loading-progress");
const introLoadingBar = document.getElementById("intro-loading-bar");
const gameFrame = document.getElementById("game-frame");
const gameLoading = document.getElementById("game-loading");
const portalGameDay = document.getElementById("portal-game-day");
const infoLayer = document.getElementById("info-layer");
const localLaunchNote = document.getElementById("local-launch-note");
const creditList = document.getElementById("credit-list");
let introFinished = false;
let introTimer = 0;
let introLoadingFrame = 0;
let introFinalLoadingStarted = false;
let lastPanelTrigger = null;
let gameStatusTimer = 0;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map((value) => value.trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").trim()])));
}

function renderCredits(rows) {
  if (!creditList) return;
  const ordered = rows
    .filter((credit) => credit.sectionLabel && credit.name)
    .sort((left, right) => (Number(left.order) || 0) - (Number(right.order) || 0));
  const groups = new Map();
  ordered.forEach((credit) => {
    if (!groups.has(credit.sectionLabel)) groups.set(credit.sectionLabel, []);
    groups.get(credit.sectionLabel).push(credit);
  });
  creditList.replaceChildren();
  groups.forEach((credits, label) => {
    const group = document.createElement("div");
    const term = document.createElement("dt");
    const details = document.createElement("dd");
    term.textContent = label;
    credits.forEach((credit) => {
      const person = document.createElement("span");
      person.className = "credit-person";
      const name = credit.url ? document.createElement("a") : document.createElement("b");
      name.textContent = credit.name;
      if (credit.url) {
        name.href = credit.url;
        name.target = "_blank";
        name.rel = "noopener noreferrer";
      }
      person.appendChild(name);
      const metadata = [credit.role, ...(credit.note || "").split("|")].filter(Boolean);
      if (metadata.length) {
        const note = document.createElement("small");
        note.textContent = metadata.join(" / ");
        person.appendChild(note);
      }
      details.appendChild(person);
    });
    group.append(term, details);
    creditList.appendChild(group);
  });
  creditList.dataset.loadedCount = String(ordered.length);
}

async function loadCredits() {
  if (!creditList?.dataset.creditSource) return;
  try {
    const response = await fetch(creditList.dataset.creditSource, { cache: "no-store" });
    if (!response.ok) throw new Error(`credits: ${response.status}`);
    renderCredits(parseCsv(await response.text()));
  } catch (error) {
    creditList.replaceChildren();
    const group = document.createElement("div");
    const term = document.createElement("dt");
    const details = document.createElement("dd");
    term.textContent = "CREDITS";
    details.textContent = "クレジットデータを読み込めませんでした。";
    group.append(term, details);
    creditList.appendChild(group);
    creditList.dataset.loadedCount = "0";
  }
}

function updateGameStatus() {
  if (!portalGameDay) return;
  try {
    const snapshot = gameFrame.contentWindow?.farm3dBridge?.snapshot?.();
    if (!snapshot) return;
    const day = String(Math.max(1, Number(snapshot.day) || 1)).padStart(2, "0");
    const progress = Math.round(Math.max(0, Math.min(1, Number(snapshot.dayProgress) || 0)) * 100);
    portalGameDay.textContent = `DAY ${day} · ${String(progress).padStart(2, "0")}% · ${snapshot.timeRunning ? "GROWING" : "PAUSED"}`;
  } catch (error) {}
}

function buildIntro(full = false) {
  introCopy.replaceChildren();
  INTRO_LINES.forEach((line) => {
    const paragraph = document.createElement("p");
    if (full) paragraph.textContent = line;
    introCopy.appendChild(paragraph);
  });
}

function setIntroProgress(value, status = "") {
  const progress = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  if (introLoadingProgress) introLoadingProgress.textContent = `${String(progress).padStart(3, "0")}%`;
  if (introLoadingBar) introLoadingBar.style.width = `${progress}%`;
  if (status && introLoadingStatus) introLoadingStatus.textContent = status;
}

function startFinalLoading() {
  if (introFinalLoadingStarted || introFinished) return;
  introFinalLoadingStarted = true;
  introSkip.innerHTML = "ENTER NOW <span aria-hidden=\"true\">↗</span>";
  const startedAt = performance.now();
  const duration = 5000;
  const tick = (now) => {
    if (introFinished) return;
    const elapsed = Math.min(duration, now - startedAt);
    setIntroProgress(72 + (elapsed / duration) * 28, elapsed >= duration ? "ACCESS GRANTED" : "VERIFYING RESTORED DATA...");
    if (elapsed >= duration) {
      finishIntro();
      return;
    }
    introLoadingFrame = window.requestAnimationFrame(tick);
  };
  introLoadingFrame = window.requestAnimationFrame(tick);
}

function finishIntro() {
  if (introFinished) return;
  introFinished = true;
  window.clearTimeout(introTimer);
  window.cancelAnimationFrame(introLoadingFrame);
  document.body.classList.remove("is-intro");
  intro.classList.add("is-finished");
  intro.setAttribute("aria-hidden", "true");
  intro.inert = true;
  window.setTimeout(() => intro.setAttribute("hidden", ""), 900);
}

function typeIntro() {
  const skip = new URLSearchParams(window.location.search).has("skipIntro");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (skip) {
    buildIntro(true);
    setIntroProgress(100, "ACCESS GRANTED");
    finishIntro();
    return;
  }
  if (reducedMotion) {
    buildIntro(true);
    setIntroProgress(72, "VERIFYING RESTORED DATA...");
    startFinalLoading();
    return;
  }

  buildIntro();
  setIntroProgress(0, "RESTORING ARCHIVE...");
  const paragraphs = [...introCopy.querySelectorAll("p")];
  const totalCharacters = INTRO_LINES.reduce((total, line) => total + Array.from(line).length, 0);
  let typedCharacters = 0;
  let lineIndex = 0;
  let characterIndex = 0;

  function nextCharacter() {
    if (introFinished) return;
    const characters = Array.from(INTRO_LINES[lineIndex]);
    paragraphs[lineIndex].textContent += characters[characterIndex];
    characterIndex += 1;
    typedCharacters += 1;
    setIntroProgress((typedCharacters / totalCharacters) * 72, "RESTORING ARCHIVE...");
    if (characterIndex >= characters.length) {
      lineIndex += 1;
      characterIndex = 0;
      if (lineIndex >= INTRO_LINES.length) {
        setIntroProgress(72, "VERIFYING RESTORED DATA...");
        startFinalLoading();
        return;
      }
    }
    introTimer = window.setTimeout(nextCharacter, characterIndex === 0 ? 155 : 31);
  }

  nextCharacter();
}

function openPanel(name, trigger) {
  const panel = document.querySelector(`[data-info="${name}"]`);
  if (!panel) return;
  lastPanelTrigger = trigger || document.activeElement;
  document.querySelectorAll(".portal-nav [data-panel]").forEach((button) => button.classList.toggle("is-active", button.dataset.panel === name));
  document.querySelectorAll(".info-panel").forEach((entry) => entry.classList.toggle("is-active", entry === panel));
  infoLayer.classList.add("is-open");
  infoLayer.setAttribute("aria-hidden", "false");
  gameFrame.inert = true;
  window.setTimeout(() => panel.querySelector(".panel-close")?.focus(), 60);
}

function closePanel() {
  if (!infoLayer.classList.contains("is-open")) return;
  infoLayer.classList.remove("is-open");
  infoLayer.setAttribute("aria-hidden", "true");
  document.querySelectorAll(".portal-nav [data-panel]").forEach((button) => button.classList.remove("is-active"));
  document.querySelectorAll(".info-panel").forEach((entry) => entry.classList.remove("is-active"));
  gameFrame.inert = false;
  if (lastPanelTrigger instanceof HTMLElement) lastPanelTrigger.focus({ preventScroll: true });
}

introSkip.addEventListener("click", () => {
  setIntroProgress(100, "MANUAL ACCESS");
  finishIntro();
});
document.querySelectorAll(".portal-nav [data-panel]").forEach((button) => button.addEventListener("click", () => openPanel(button.dataset.panel, button)));
document.querySelectorAll(".panel-close, .info-backdrop").forEach((button) => button.addEventListener("click", closePanel));
document.addEventListener("keydown", (event) => {
  if (!introFinished && ["Escape", "Enter", " "].includes(event.key)) {
    event.preventDefault();
    finishIntro();
    return;
  }
  if (event.key === "Escape") closePanel();
});

gameFrame.addEventListener("load", () => {
  gameLoading.classList.add("is-hidden");
  window.clearInterval(gameStatusTimer);
  updateGameStatus();
  gameStatusTimer = window.setInterval(updateGameStatus, 500);
});

if (window.location.protocol === "file:") {
  localLaunchNote.hidden = false;
}

typeIntro();
loadCredits();
