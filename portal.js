"use strict";

let introLines = [
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
const panelCloseGlobal = document.getElementById("panel-close-global");
const localLaunchNote = document.getElementById("local-launch-note");
const creditList = document.getElementById("credit-list");
const characterList = document.getElementById("character-list");
const portalAudioToggle = document.getElementById("portal-audio-toggle");
const portalAudioState = document.getElementById("portal-audio-state");
const siteFavicon = document.getElementById("site-favicon");
const portalLogo = document.getElementById("portal-logo");
const cultivationDemoLabel = document.getElementById("cultivation-demo-label");
const cultivationGuideSteps = document.getElementById("cultivation-guide-steps");
const worldParagraphs = document.getElementById("world-paragraphs");
const systemFeatureList = document.getElementById("system-feature-list");
const playEventList = document.getElementById("play-event-list");
const contactChannel = document.getElementById("contact-channel");
let siteContentRows = [];
let siteContentGroups = new Map();
let introFinished = false;
let introTimer = 0;
let introLoadingFrame = 0;
let introFinalLoadingStarted = false;
let lastPanelTrigger = null;
let gameStatusTimer = 0;
let portalAudioManuallyMuted = false;
let systemVideoObserver = null;
const visibleSystemVideos = new Map();
const multilineContentFields = new Set(["text", "subtext", "body", "note", "alt"]);

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
  const headers = rows.shift().map((value, index) => (index === 0 ? value.replace(/^\uFEFF/, "") : value).trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => {
    const value = (values[index] || "").trim();
    return [header, multilineContentFields.has(header) ? value.replace(/\\n/g, "\n") : value];
  })));
}

function groupSiteContent(rows) {
  const groups = new Map();
  rows
    .filter((row) => row.section && row.key)
    .sort((left, right) => (Number(left.order) || 0) - (Number(right.order) || 0))
    .forEach((row) => {
      const id = `${row.section}.${row.key}`;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(row);
    });
  return groups;
}

function contentRows(id) {
  return siteContentGroups.get(id) || [];
}

function contentRow(id) {
  return contentRows(id)[0] || null;
}

function contentText(id, fallback = "") {
  return contentRow(id)?.text || fallback;
}

function resolveContentSource(source) {
  if (!source) return "";
  const normalizedSource = source.replace(/\\/g, "/");
  if (normalizedSource.startsWith("asset:")) {
    let path = normalizedSource.slice(6);
    if (document.documentElement.dataset.contentFlattenAssets === "true") path = path.split("/").pop();
    return `${document.documentElement.dataset.contentAssetPrefix || ""}${path}`;
  }
  if (normalizedSource.startsWith("page:")) return `${document.documentElement.dataset.contentPagePrefix || ""}${normalizedSource.slice(5)}`;
  return normalizedSource;
}

function renderGenericContent() {
  document.querySelectorAll("[data-content]").forEach((element) => {
    const row = contentRow(element.dataset.content);
    if (row) element.textContent = row.text;
  });
  document.querySelectorAll("[data-content-rich]").forEach((element) => {
    const row = contentRow(element.dataset.contentRich);
    if (!row) return;
    element.replaceChildren(document.createTextNode(row.text || ""));
    if (row.subtext) {
      const accent = document.createElement("em");
      accent.textContent = row.subtext;
      element.appendChild(accent);
    }
  });

  document.title = contentText("site.pageTitle", document.title);
  const description = contentText("site.description");
  if (description) {
    document.querySelectorAll('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]').forEach((meta) => meta.setAttribute("content", description));
  }

  const faviconRow = contentRow("site.favicon");
  if (siteFavicon && faviconRow?.src) siteFavicon.href = resolveContentSource(faviconRow.src);
  const logoRow = contentRow("header.logo");
  if (portalLogo && logoRow?.src) {
    portalLogo.src = resolveContentSource(logoRow.src);
    portalLogo.alt = logoRow.alt || "";
  }

  const frameRow = contentRow("game.frame");
  if (gameFrame && frameRow) {
    if (frameRow.text) gameFrame.title = frameRow.text;
    const nextSource = resolveContentSource(frameRow.src);
    if (nextSource && gameFrame.getAttribute("src") !== nextSource) gameFrame.src = nextSource;
  }
  if (introLoadingStatus) introLoadingStatus.textContent = contentText("intro.loadingRestore", introLoadingStatus.textContent);
  if (introSkip) {
    introSkip.replaceChildren(document.createTextNode(`${contentText("intro.skipInitial", "SKIP")} `));
    const skipArrow = document.createElement("span");
    skipArrow.setAttribute("aria-hidden", "true");
    skipArrow.textContent = "↗";
    introSkip.appendChild(skipArrow);
  }
  if (portalAudioState) portalAudioState.textContent = contentText("header.audioStart", portalAudioState.textContent);
  if (cultivationDemoLabel) cultivationDemoLabel.setAttribute("aria-label", cultivationDemoLabel.textContent);
}

function renderNavigation() {
  siteContentRows.filter((row) => row.section === "header" && row.type === "nav").forEach((row) => {
    const button = document.querySelector(`.portal-nav [data-panel="${row.meta}"]`);
    if (!button) return;
    const small = button.querySelector("small");
    const strong = button.querySelector("strong");
    if (small) small.textContent = row.subtext;
    if (strong) strong.textContent = row.text;
  });
}

function renderCultivationGuide() {
  const steps = siteContentRows.filter((row) => row.section === "game" && row.type === "guide");
  if (!cultivationGuideSteps || !steps.length) return;
  cultivationGuideSteps.replaceChildren();
  steps.forEach((row, index) => {
    if (index) cultivationGuideSteps.appendChild(document.createTextNode("　／　"));
    const label = document.createElement("span");
    label.textContent = row.text;
    cultivationGuideSteps.append(label, document.createTextNode(` ${row.body}`));
  });
}

function renderWorldParagraphs() {
  const paragraphs = siteContentRows.filter((row) => row.section === "world" && row.type === "paragraph");
  if (!worldParagraphs || !paragraphs.length) return;
  const column = document.createElement("div");
  paragraphs.forEach((row) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = row.text;
    column.appendChild(paragraph);
  });
  worldParagraphs.replaceChildren(column);
}

function splitAlbumValues(value) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .split(/\s*\|\s*|\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createFeatureAlbum(figure, row) {
  const sources = splitAlbumValues(row.src).map(resolveContentSource).filter(Boolean);
  if (!sources.length) return false;
  const altTexts = splitAlbumValues(row.alt);
  const captions = splitAlbumValues(row.note);
  figure.classList.add("has-album");
  figure.setAttribute("role", "region");
  figure.setAttribute("aria-roledescription", "画像アルバム");

  const stage = document.createElement("div");
  stage.className = "system-album-stage";
  const slides = sources.map((source, index) => {
    const image = document.createElement("img");
    image.src = source;
    image.alt = altTexts[index] || altTexts[0] || `${row.text || "登録画像"} ${index + 1}`;
    image.loading = "lazy";
    image.decoding = "async";
    image.hidden = index !== 0;
    stage.appendChild(image);
    return image;
  });

  const previous = document.createElement("button");
  previous.className = "album-arrow album-previous";
  previous.type = "button";
  previous.setAttribute("aria-label", "前の画像");
  previous.textContent = "‹";
  const next = document.createElement("button");
  next.className = "album-arrow album-next";
  next.type = "button";
  next.setAttribute("aria-label", "次の画像");
  next.textContent = "›";
  const counter = document.createElement("span");
  counter.className = "album-counter";
  counter.setAttribute("aria-live", "polite");
  const caption = document.createElement("figcaption");

  let currentIndex = 0;
  const showSlide = (nextIndex) => {
    currentIndex = (nextIndex + slides.length) % slides.length;
    slides.forEach((slide, index) => { slide.hidden = index !== currentIndex; });
    counter.textContent = `${currentIndex + 1} / ${slides.length}`;
    caption.textContent = captions[currentIndex] || captions[0] || "";
    caption.hidden = !caption.textContent;
    figure.dataset.albumIndex = String(currentIndex);
  };
  previous.addEventListener("click", () => showSlide(currentIndex - 1));
  next.addEventListener("click", () => showSlide(currentIndex + 1));
  if (slides.length < 2) {
    previous.hidden = true;
    next.hidden = true;
    counter.hidden = true;
  }
  figure.append(stage, previous, next, counter, caption);
  showSlide(0);
  return true;
}

function createFeatureMedia(row) {
  const figure = document.createElement("figure");
  figure.className = "system-feature-media";
  if (row.meta) figure.dataset.visual = row.meta;
  const mediaType = (row.mediaType || "image").toLowerCase();
  const isAlbum = mediaType === "album" && createFeatureAlbum(figure, row);
  if (!isAlbum && row.alt) figure.setAttribute("aria-label", row.alt);
  const source = isAlbum ? "" : resolveContentSource(row.src);
  if (!isAlbum && source) {
    if (mediaType === "video") {
      figure.classList.add("has-video");
      const video = document.createElement("video");
      video.dataset.src = source;
      video.controls = true;
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "none";
      if (row.alt) video.setAttribute("aria-label", row.alt);
      figure.appendChild(video);
    } else {
      const image = document.createElement("img");
      image.src = source;
      image.alt = row.alt || "";
      image.loading = "lazy";
      image.decoding = "async";
      figure.appendChild(image);
    }
  }
  if (!isAlbum && row.note) {
    const caption = document.createElement("figcaption");
    caption.textContent = row.note;
    figure.appendChild(caption);
  }
  return figure;
}

function loadDeferredSystemVideos() {
  systemFeatureList?.querySelectorAll("video[data-src]").forEach((video) => {
    video.src = video.dataset.src;
    delete video.dataset.src;
    video.preload = "metadata";
    video.load();
  });
}

function pauseSystemVideos() {
  systemFeatureList?.querySelectorAll("video").forEach((video) => video.pause());
}

function updateActiveSystemVideo() {
  const activeVideo = [...visibleSystemVideos.entries()]
    .filter(([, ratio]) => ratio >= 0.45)
    .sort((left, right) => right[1] - left[1])[0]?.[0] || null;
  systemFeatureList?.querySelectorAll("video").forEach((video) => {
    if (video === activeVideo) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  });
}

function observeSystemVideos() {
  systemVideoObserver?.disconnect();
  visibleSystemVideos.clear();
  const videos = [...(systemFeatureList?.querySelectorAll("video") || [])];
  if (!videos.length) return;
  const systemPanel = document.querySelector('[data-info="system"]');
  systemVideoObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => visibleSystemVideos.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0));
    updateActiveSystemVideo();
  }, {
    root: systemPanel,
    threshold: [0, 0.25, 0.45, 0.65, 0.85]
  });
  videos.forEach((video) => {
    visibleSystemVideos.set(video, 0);
    systemVideoObserver.observe(video);
  });
}

function stopSystemVideoObservation() {
  systemVideoObserver?.disconnect();
  systemVideoObserver = null;
  visibleSystemVideos.clear();
  pauseSystemVideos();
}

function renderSystemFeatures() {
  const features = siteContentRows.filter((row) => row.section === "system" && row.type === "feature");
  if (!systemFeatureList || !features.length) return;
  systemFeatureList.replaceChildren();
  features.forEach((row, index) => {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = row.subtext || `FEATURE ${String(index + 1).padStart(2, "0")}`;
    const heading = document.createElement("strong");
    heading.textContent = row.text;
    const body = document.createElement("p");
    body.textContent = row.body;
    item.append(label, heading, createFeatureMedia(row), body);
    systemFeatureList.appendChild(item);
  });
}

function renderCharacters() {
  if (!characterList) return;
  const profiles = siteContentRows.filter((row) => row.section === "characters" && row.type === "profile");
  if (!profiles.length) return;
  characterList.replaceChildren();
  profiles.forEach((profile, index) => {
    const card = document.createElement("article");
    card.className = `character-card character-${profile.key}`;

    const portrait = document.createElement("figure");
    portrait.className = "character-portrait";
    const image = document.createElement("img");
    image.src = resolveContentSource(profile.src);
    image.alt = profile.alt || `${profile.text}のゲーム内人物アイコン`;
    image.loading = "eager";
    image.decoding = "sync";
    portrait.appendChild(image);

    const copy = document.createElement("div");
    copy.className = "character-copy";
    const metadata = document.createElement("p");
    metadata.className = "character-signal";
    metadata.textContent = `${String(index + 1).padStart(2, "0")} // ${profile.meta || "PERSONNEL FILE"}`;
    const heading = document.createElement("h3");
    heading.textContent = profile.text;
    const role = document.createElement("p");
    role.className = "character-role";
    role.textContent = profile.subtext;
    const summary = document.createElement("p");
    summary.className = "character-summary";
    summary.textContent = profile.body;
    const note = document.createElement("p");
    note.className = "character-note";
    note.textContent = profile.note;
    copy.append(metadata, heading, role, summary, note);
    card.append(portrait, copy);
    characterList.appendChild(card);
  });
  characterList.dataset.loadedCount = String(profiles.length);
}

function renderEvents() {
  const events = siteContentRows.filter((row) => row.section === "play" && row.type === "event");
  if (!playEventList || !events.length) return;
  playEventList.replaceChildren();
  events.forEach((row) => {
    const item = document.createElement("li");
    const year = document.createElement("span");
    const name = document.createElement("strong");
    year.textContent = row.meta || "";
    name.textContent = row.text;
    item.append(year, name);
    playEventList.appendChild(item);
  });
}

function renderContactLink() {
  const row = contentRow("contact.channel");
  if (!contactChannel || !row) return;
  const label = contactChannel.querySelector("span");
  const channel = contactChannel.querySelector("strong");
  if (label) label.textContent = row.text;
  if (channel) channel.textContent = row.subtext;
  if (row.href) contactChannel.href = row.href;
}

function renderSiteContent(rows) {
  siteContentRows = rows.sort((left, right) => (Number(left.order) || 0) - (Number(right.order) || 0));
  siteContentGroups = groupSiteContent(siteContentRows);
  const configuredIntro = contentRows("intro.line").map((row) => row.text).filter(Boolean);
  if (configuredIntro.length) introLines = configuredIntro;
  renderGenericContent();
  renderNavigation();
  renderCultivationGuide();
  renderWorldParagraphs();
  renderSystemFeatures();
  renderCharacters();
  renderEvents();
  renderContactLink();
  infoLayer.dataset.contentLoadedCount = String(rows.length);
}

async function loadSiteContent() {
  const source = infoLayer?.dataset.contentSource;
  if (!source) return false;
  try {
    const response = await fetch(source, { cache: "no-store" });
    if (!response.ok) throw new Error(`site content: ${response.status}`);
    renderSiteContent(parseCsv(await response.text()));
    return true;
  } catch (error) {
    infoLayer.dataset.contentLoadedCount = "0";
    return false;
  }
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
        name.className = "credit-link";
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

function embeddedAudioApi() {
  try {
    return gameFrame.contentWindow?.OfficialDemoAudio || null;
  } catch (error) {
    return null;
  }
}

function updatePortalAudioStatus(snapshot = null) {
  if (!portalAudioToggle || !portalAudioState) return;
  let current = snapshot;
  try {
    current ||= embeddedAudioApi()?.snapshot?.() || null;
  } catch (error) {}
  const ready = Boolean(current?.ready);
  const enabled = Boolean(current?.enabled);
  portalAudioToggle.disabled = !ready;
  portalAudioToggle.classList.toggle("is-on", enabled);
  portalAudioToggle.setAttribute("aria-pressed", String(enabled));
  portalAudioToggle.setAttribute("aria-label", enabled ? contentText("header.audioStopAria", "ゲーム音を停止") : contentText("header.audioPlayAria", "ゲーム音を再生"));
  portalAudioState.textContent = ready
    ? (enabled ? contentText("header.audioOn", "ON") : contentText("header.audioOff", "OFF"))
    : contentText("header.audioWait", "WAIT");
}

function setPortalAudioEnabled(enabled, { manual = false } = {}) {
  const api = embeddedAudioApi();
  if (!api) return null;
  let snapshot = null;
  try {
    snapshot = enabled ? api.start?.() : api.stop?.();
    if (enabled) api.play?.("ui_click", 0.1);
  } catch (error) {
    return null;
  }
  if (manual) portalAudioManuallyMuted = !enabled;
  updatePortalAudioStatus(snapshot);
  return snapshot;
}

function updateGameStatus() {
  if (!portalGameDay) return;
  try {
    const snapshot = gameFrame.contentWindow?.farm3dBridge?.snapshot?.();
    if (!snapshot) return;
    const day = String(Math.max(1, Number(snapshot.day) || 1)).padStart(2, "0");
    const progress = Math.round(Math.max(0, Math.min(1, Number(snapshot.dayProgress) || 0)) * 100);
    const state = snapshot.timeRunning ? contentText("header.statusGrowing", "GROWING") : contentText("header.statusPaused", "PAUSED");
    portalGameDay.textContent = `DAY ${day} · ${String(progress).padStart(2, "0")}% · ${state}`;
    updatePortalAudioStatus();
  } catch (error) {}
}

function buildIntro(full = false) {
  introCopy.replaceChildren();
  introLines.forEach((line) => {
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
  introSkip.replaceChildren(document.createTextNode(`${contentText("intro.skipReady", "ENTER NOW")} `));
  const enterArrow = document.createElement("span");
  enterArrow.setAttribute("aria-hidden", "true");
  enterArrow.textContent = "↗";
  introSkip.appendChild(enterArrow);
  const startedAt = performance.now();
  const duration = 5000;
  const tick = (now) => {
    if (introFinished) return;
    const elapsed = Math.min(duration, now - startedAt);
    setIntroProgress(72 + (elapsed / duration) * 28, elapsed >= duration ? contentText("intro.loadingGranted", "ACCESS GRANTED") : contentText("intro.loadingVerify", "VERIFYING RESTORED DATA..."));
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
    setIntroProgress(100, contentText("intro.loadingGranted", "ACCESS GRANTED"));
    finishIntro();
    return;
  }
  if (reducedMotion) {
    buildIntro(true);
    setIntroProgress(72, contentText("intro.loadingVerify", "VERIFYING RESTORED DATA..."));
    startFinalLoading();
    return;
  }

  buildIntro();
  setIntroProgress(0, contentText("intro.loadingRestore", "RESTORING ARCHIVE..."));
  const paragraphs = [...introCopy.querySelectorAll("p")];
  const totalCharacters = introLines.reduce((total, line) => total + Array.from(line).length, 0);
  let typedCharacters = 0;
  let lineIndex = 0;
  let characterIndex = 0;

  function nextCharacter() {
    if (introFinished) return;
    const characters = Array.from(introLines[lineIndex]);
    paragraphs[lineIndex].textContent += characters[characterIndex];
    characterIndex += 1;
    typedCharacters += 1;
    setIntroProgress((typedCharacters / totalCharacters) * 72, contentText("intro.loadingRestore", "RESTORING ARCHIVE..."));
    if (characterIndex >= characters.length) {
      lineIndex += 1;
      characterIndex = 0;
      if (lineIndex >= introLines.length) {
        setIntroProgress(72, contentText("intro.loadingVerify", "VERIFYING RESTORED DATA..."));
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
  if (name === "system") {
    loadDeferredSystemVideos();
    observeSystemVideos();
  }
  gameFrame.inert = true;
  window.setTimeout(() => panelCloseGlobal?.focus(), 60);
}

function closePanel() {
  if (!infoLayer.classList.contains("is-open")) return;
  stopSystemVideoObservation();
  infoLayer.classList.remove("is-open");
  infoLayer.setAttribute("aria-hidden", "true");
  document.querySelectorAll(".portal-nav [data-panel]").forEach((button) => button.classList.remove("is-active"));
  document.querySelectorAll(".info-panel").forEach((entry) => entry.classList.remove("is-active"));
  gameFrame.inert = false;
  if (lastPanelTrigger instanceof HTMLElement) lastPanelTrigger.focus({ preventScroll: true });
}

introSkip.addEventListener("click", () => {
  setIntroProgress(100, contentText("intro.loadingManual", "MANUAL ACCESS"));
  finishIntro();
});
portalAudioToggle?.addEventListener("click", (event) => {
  event.stopPropagation();
  const enabled = portalAudioToggle.getAttribute("aria-pressed") === "true";
  setPortalAudioEnabled(!enabled, { manual: true });
});
document.addEventListener("pointerdown", (event) => {
  if (portalAudioManuallyMuted || event.target.closest("#portal-audio-toggle")) return;
  const snapshot = embeddedAudioApi()?.snapshot?.();
  if (snapshot?.ready && !snapshot.enabled) setPortalAudioEnabled(true);
}, true);
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
  updatePortalAudioStatus();
  gameStatusTimer = window.setInterval(updateGameStatus, 500);
});

if (window.location.protocol === "file:") {
  localLaunchNote.hidden = false;
}

async function initializePortal() {
  await loadSiteContent();
  typeIntro();
  loadCredits();
}

initializePortal();
