/* UNDER GREEN — official site
   Content comes from site-content.csv / credits.csv (see PUBLICATION_README.md). */
(() => {
  "use strict";

  const doc = document.documentElement;
  const SCRIPT_URL = document.currentScript?.src || location.href;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  const mqReduce = matchMedia("(prefers-reduced-motion: reduce)");
  const mqFine = matchMedia("(hover: hover) and (pointer: fine)");
  const mqDesktop = matchMedia("(min-width: 1024px)");
  const params = new URLSearchParams(location.search);
  const reduced = () => mqReduce.matches;

  const safeStorage = (kind) => ({
    get(key) { try { return window[kind].getItem(key); } catch (error) { return null; } },
    set(key, value) { try { window[kind].setItem(key, value); } catch (error) { /* storage unavailable */ } }
  });
  const local = safeStorage("localStorage");
  const session = safeStorage("sessionStorage");

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---------------------------------------------------------------
     CSV content
     --------------------------------------------------------------- */
  const MULTILINE_FIELDS = new Set(["text", "subtext", "body", "note", "alt"]);

  function parseCsv(text) {
    const records = [];
    let record = [];
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
        record.push(field);
        field = "";
      } else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        record.push(field);
        if (record.some((value) => value.trim())) records.push(record);
        record = [];
        field = "";
      } else {
        field += character;
      }
    }
    record.push(field);
    if (record.some((value) => value.trim())) records.push(record);
    if (!records.length) return [];
    const headers = records.shift().map((value, index) => (index === 0 ? value.replace(/^﻿/, "") : value).trim());
    return records.map((values) => Object.fromEntries(headers.map((header, index) => {
      const value = (values[index] || "").trim();
      return [header, MULTILINE_FIELDS.has(header) ? value.replace(/\\n/g, "\n") : value];
    })));
  }

  let contentRows = [];
  const contentGroups = new Map();

  function setContentRows(list) {
    contentRows = list
      .filter((entry) => entry.section && entry.key)
      .sort((left, right) => (Number(left.order) || 0) - (Number(right.order) || 0));
    contentGroups.clear();
    contentRows.forEach((entry) => {
      const id = `${entry.section}.${entry.key}`;
      if (!contentGroups.has(id)) contentGroups.set(id, []);
      contentGroups.get(id).push(entry);
    });
  }
  const rowsOf = (id) => contentGroups.get(id) || [];
  const row = (id) => rowsOf(id)[0] || null;
  const text = (id, fallback = "") => row(id)?.text || fallback;
  const typed = (section, type) => contentRows.filter((entry) => entry.section === section && entry.type === type);

  function resolveSource(source) {
    if (!source) return "";
    const normalized = source.replace(/\\/g, "/");
    if (normalized.startsWith("asset:")) {
      let path = normalized.slice(6);
      if (doc.dataset.contentFlattenAssets === "true") path = path.split("/").pop();
      return `${doc.dataset.contentAssetPrefix || ""}${path}`;
    }
    if (normalized.startsWith("page:")) return `${doc.dataset.contentPagePrefix || ""}${normalized.slice(5)}`;
    return normalized;
  }
  const splitList = (value) => String(value || "")
    .replace(/\\n/g, "\n")
    .split(/\s*\|\s*|\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const isVideo = (url) => /\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(url);
  const posterFor = (url) => url.replace(/\.(mp4|webm|mov|m4v)((?:[?#].*)?)$/i, ".jpg$2");
  const cleanLabel = (value) => String(value || "").replace(/\s*\/\/\s*$/, "").trim();

  async function fetchCsv(path) {
    const response = await fetch(path, { cache: "no-cache" });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return parseCsv(await response.text());
  }

  /* ---------------------------------------------------------------
     Rendering
     --------------------------------------------------------------- */
  function renderGeneric() {
    $$("[data-content]").forEach((node) => {
      const entry = row(node.dataset.content);
      if (entry && entry.text) node.textContent = cleanLabel(entry.text);
    });
    $$("[data-content-sub]").forEach((node) => {
      const entry = row(node.dataset.contentSub);
      if (entry && entry.subtext) node.textContent = entry.subtext;
    });
    $$("[data-content-rich]").forEach((node) => {
      const entry = row(node.dataset.contentRich);
      if (!entry) return;
      node.replaceChildren(document.createTextNode(entry.text || ""));
      if (entry.subtext) node.appendChild(el("em", "", entry.subtext));
    });

    document.title = text("site.pageTitle", document.title);
    const description = text("site.description");
    if (description) {
      $$('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]')
        .forEach((meta) => meta.setAttribute("content", description));
    }
    const favicon = row("site.favicon");
    if (favicon?.src) $("#site-favicon").href = resolveSource(favicon.src);
    const logo = row("header.logo");
    if (logo?.src) $("#portal-logo").src = resolveSource(logo.src);

    const channel = row("contact.channel");
    if (channel?.href) {
      $$("[data-x-link]").forEach((link) => { link.href = channel.href; });
      const handle = channel.href.replace(/\/+$/, "").split("/").pop();
      if (handle) {
        $("#contact-handle").textContent = `@${handle}`;
        const menuLink = $(".menu__foot [data-x-link]");
        if (menuLink) menuLink.textContent = `${channel.text || "X"} / @${handle} ↗`;
      }
      $("#contact-label").textContent = [channel.text, channel.subtext].filter(Boolean).join(" / ");
    }
    const creditsImage = row("credits.image");
    if (creditsImage?.src) $("#credits-image").src = resolveSource(creditsImage.src);
  }

  function renderNavigation() {
    const items = typed("header", "nav").filter((entry) => entry.meta && document.getElementById(entry.meta));
    if (!items.length) return;
    const desktop = $("#hdr-nav");
    const mobile = $("#menu-nav");
    desktop.replaceChildren();
    mobile.replaceChildren();
    items.forEach((entry, index) => {
      const number = pad(index + 1);
      const link = el("a");
      link.href = `#${entry.meta}`;
      link.dataset.nav = entry.meta;
      const roll = el("span", "roll");
      roll.append(el("span", "", entry.text), el("span", "", entry.subtext || entry.text));
      link.append(el("sup", "", number), roll);
      desktop.appendChild(link);

      const big = el("a");
      big.href = `#${entry.meta}`;
      big.dataset.nav = entry.meta;
      big.append(el("small", "", number), document.createTextNode(entry.text), el("span", "", entry.subtext || ""));
      big.style.transitionDelay = `${0.12 + index * 0.05}s`;
      mobile.appendChild(big);
      const sectionNumber = $(".sec-head__meta b", document.getElementById(entry.meta));
      if (sectionNumber) sectionNumber.textContent = number;
    });
  }

  function renderPrologue() {
    const lines = rowsOf("intro.line").map((entry) => entry.text).filter(Boolean);
    if (!lines.length) return;
    $("#prologue-lines").replaceChildren(...lines.map((line) => el("p", "", line)));
  }

  function renderSystemLead() {
    const lead = row("system.lead");
    if (!lead?.text) return;
    const rawLines = lead.text.split(/\r?\n/).filter((line) => line.trim());
    const container = $("#system-lead");
    container.replaceChildren(...rawLines.map((line, index) => {
      const paragraph = el("p", /^\s/.test(line) ? "sys__lead-last" : "", line.trim());
      paragraph.dataset.rv = "";
      paragraph.style.setProperty("--d", `${Math.min(index, 8) * 0.06}s`);
      return paragraph;
    }));
  }

  /* media items: images, videos, or a "|"-separated album of both */
  function buildMediaItems(container, entry) {
    const sources = splitList(entry.src).map(resolveSource);
    const alts = splitList(entry.alt);
    const declaredType = (entry.mediaType || "").toLowerCase();
    // legacy "video|poster" pair
    if (declaredType === "video" && sources.length === 2 && isVideo(sources[0]) && !isVideo(sources[1])) {
      sources.length = 1;
    }
    return sources.map((source, index) => {
      const item = el("div", "screen__item");
      const alt = alts[index] || alts[0] || entry.text || "";
      if (isVideo(source)) {
        const poster = el("img");
        poster.src = posterFor(source);
        poster.alt = "";
        poster.loading = "lazy";
        poster.decoding = "async";
        poster.addEventListener("error", () => poster.remove(), { once: true });
        const video = el("video");
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.preload = "none";
        video.dataset.src = source;
        video.setAttribute("aria-label", alt);
        item.append(poster, video);
        item.video = video;
      } else {
        const image = el("img");
        image.src = source;
        image.alt = alt;
        image.loading = "lazy";
        image.decoding = "async";
        item.appendChild(image);
      }
      container.appendChild(item);
      return item;
    });
  }

  const featureLayers = [];
  const Features = { active: -1, list: [], visible: false };

  function renderFeatures() {
    const features = typed("system", "feature");
    if (!features.length) return;
    const layersRoot = $("#feat-layers");
    const tabs = $("#feat-tabs");
    layersRoot.replaceChildren();
    tabs.replaceChildren();
    featureLayers.length = 0;
    Features.list = features;
    features.forEach((entry, index) => {
      const captions = splitList(entry.note).filter((caption) => !/PLACEHOLDER/i.test(caption));
      const camera = (entry.meta || entry.subtext || `FEATURE ${pad(index + 1)}`).toUpperCase();
      const node = el("div", "screen__layer");
      layersRoot.appendChild(node);
      featureLayers.push({ node, items: buildMediaItems(node, entry), captions, camera, index: 0 });

      const tab = el("button", "feats__tab");
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", "false");
      tab.setAttribute("aria-controls", "feat-detail");
      tab.tabIndex = -1;
      tab.dataset.cursor = "VIEW";
      tab.append(el("span", "mono", pad(index + 1)), el("b", "", entry.text));
      tab.addEventListener("click", () => activateFeature(index));
      tabs.appendChild(tab);
    });
    tabs.onkeydown = (event) => {
      const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (!(event.key in keys)) return;
      event.preventDefault();
      const next = (Features.active + keys[event.key] + featureLayers.length) % featureLayers.length;
      activateFeature(next);
      tabs.children[next]?.focus();
    };
    Features.active = -1;
    activateFeature(0, { silent: true });
  }

  function renderWorld() {
    const prologueLines = new Set(rowsOf("intro.line").map((entry) => entry.text.trim()));
    const paragraphs = typed("world", "paragraph")
      .flatMap((entry) => entry.text.split(/\r?\n/))
      .map((line) => line.trim())
      .filter((line) => line && !prologueLines.has(line));
    if (paragraphs.length) {
      $("#world-paragraphs").replaceChildren(...paragraphs.map((line, index) => {
        const paragraph = el("p", "", line);
        paragraph.dataset.rv = "";
        paragraph.style.setProperty("--d", `${Math.min(index, 6) * 0.05}s`);
        return paragraph;
      }));
    }
    const facts = typed("world", "fact");
    const factList = $("#world-facts");
    factList.replaceChildren(...facts.map((entry, index) => {
      const item = el("li");
      item.dataset.rv = "";
      item.style.setProperty("--d", `${index * 0.1}s`);
      item.append(el("b", "", entry.text), el("span", "", entry.subtext || entry.body || ""));
      return item;
    }));
    factList.hidden = !facts.length;
    const background = row("world.background");
    const video = $("#world-bg");
    if (background?.src) {
      const source = resolveSource(background.src);
      video.dataset.src = source;
      video.dataset.poster = posterFor(source);
    }
  }

  const characterTones = {
    operator: "138 255 182",
    mara: "255 96 84",
    support_robot: "96 220 255",
    yun: "255 170 92",
    io: "160 200 255",
    sera: "206 128 255",
    nagi: "255 84 128",
    kido: "196 214 112",
    recruiter: "255 140 64"
  };
  const characters = { list: [], active: -1, hoverTimer: 0 };

  function renderCharacters() {
    const profiles = typed("characters", "profile");
    if (!profiles.length) return;
    const portraits = $("#dossier-portraits");
    const index = $("#dossier-index");
    portraits.replaceChildren();
    index.replaceChildren();
    characters.list = profiles.map((profile, position) => {
      const image = el("img", "dossier__portrait");
      image.src = resolveSource(profile.src);
      image.alt = profile.alt || `${profile.text}の立ち絵`;
      image.loading = "lazy";
      image.decoding = "async";
      if (/robot/i.test(profile.key) || /robot/i.test(profile.src)) image.classList.add("is-robot");
      portraits.appendChild(image);

      const tab = el("button", "dossier__tab");
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", "false");
      tab.setAttribute("aria-controls", "dossier-info");
      tab.tabIndex = -1;
      tab.dataset.cursor = "VIEW";
      tab.append(el("span", "", pad(position + 1)), el("b", "", profile.text), el("small", "", profile.subtext || ""));
      tab.addEventListener("click", () => selectCharacter(position));
      tab.addEventListener("pointerenter", (event) => {
        if (event.pointerType !== "mouse") return;
        clearTimeout(characters.hoverTimer);
        characters.hoverTimer = setTimeout(() => selectCharacter(position), 140);
      });
      tab.addEventListener("pointerleave", () => clearTimeout(characters.hoverTimer));
      index.appendChild(tab);
      return { profile, image, tab };
    });
    index.addEventListener("keydown", (event) => {
      const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (event.key in keys) {
        event.preventDefault();
        const next = (characters.active + keys[event.key] + characters.list.length) % characters.list.length;
        selectCharacter(next);
        characters.list[next].tab.focus();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : characters.list.length - 1;
        selectCharacter(next);
        characters.list[next].tab.focus();
      }
    });
    const stage = $("#dossier-stage");
    if (!$(".scanbar", stage)) stage.appendChild(el("span", "scanbar"));
    if (mqFine.matches && !reduced() && !stage.dataset.parallax) {
      stage.dataset.parallax = "true";
      stage.addEventListener("pointermove", (event) => {
        const box = stage.getBoundingClientRect();
        stage.style.setProperty("--px", (((event.clientX - box.left) / box.width) * 2 - 1).toFixed(3));
        stage.style.setProperty("--py", (((event.clientY - box.top) / box.height) * 2 - 1).toFixed(3));
      });
      stage.addEventListener("pointerleave", () => {
        stage.style.setProperty("--px", "0");
        stage.style.setProperty("--py", "0");
      });
    }
    characters.active = -1;
    selectCharacter(0, { instant: true });
  }

  function fillCharacterInfo(profile, position) {
    const info = $("#dossier-info");
    const quote = el("blockquote", "dossier__quote", profile.note || "");
    info.replaceChildren(
      el("p", "dossier__signal mono", `${pad(position + 1)} // ${profile.meta || "PERSONNEL FILE"}`),
      el("h3", `dossier__name${Array.from(profile.text || "").length > 5 ? " is-long" : ""}`, profile.text),
      el("p", "dossier__role", profile.subtext || ""),
      el("p", "dossier__summary", profile.body || ""),
      quote
    );
    quote.hidden = !profile.note;
    $("#dossier-bigname").textContent = profile.key.replace(/_/g, " ");
    $("#dossier-file").textContent = `FILE ${pad(position + 1)} / ${pad(characters.list.length)}`;
    $("#dossier-stage").style.setProperty("--tone", characterTones[profile.key] || "138 255 182");
  }

  function selectCharacter(position, { instant = false } = {}) {
    if (position === characters.active || !characters.list[position]) return;
    const previous = characters.list[characters.active];
    const current = characters.list[position];
    characters.active = position;
    characters.list.forEach((entry, index) => {
      const selected = index === position;
      entry.tab.setAttribute("aria-selected", String(selected));
      entry.tab.tabIndex = selected ? 0 : -1;
    });
    if (previous) previous.image.classList.remove("is-active");
    current.image.classList.add("is-active");
    const stage = $("#dossier-stage");
    stage.classList.remove("is-switching");
    void stage.offsetWidth;
    if (!instant) stage.classList.add("is-switching");
    const info = $("#dossier-info");
    if (instant || reduced()) {
      fillCharacterInfo(current.profile, position);
      return;
    }
    Sound.play("tick", 0.5);
    info.classList.add("is-out");
    clearTimeout(info.swapTimer);
    info.swapTimer = setTimeout(() => {
      fillCharacterInfo(current.profile, position);
      requestAnimationFrame(() => info.classList.remove("is-out"));
    }, 260);
  }

  function renderEvents() {
    const events = typed("play", "event");
    if (!events.length) return;
    let year = "";
    $("#play-event-list").replaceChildren(...events.map((entry) => {
      year = entry.meta || year;
      const item = el("li");
      item.append(el("span", "", year), el("b", "", entry.text), el("i", "", "EXHIBITED"));
      return item;
    }));
  }

  function renderPlayLinks() {
    const links = typed("play", "link");
    const list = $("#play-links");
    list.replaceChildren(...links.map((entry) => {
      const item = el("li");
      const card = entry.href ? el("a", "playlink") : el("div", "playlink");
      if (entry.href) {
        card.href = entry.href;
        card.target = "_blank";
        card.rel = "noopener noreferrer";
        card.dataset.cursor = "OPEN";
      }
      card.append(
        el("span", "playlink__tag mono", [entry.meta, entry.subtext].filter(Boolean).join(" · ")),
        el("b", "", entry.text),
        el("span", "playlink__cta mono", entry.href ? "OPEN ↗" : (entry.note || "COMING SOON")),
        el("p", "", entry.body || "")
      );
      item.appendChild(card);
      return item;
    }));
    list.closest("section").hidden = !links.length;
  }

  function renderGuide() {
    const steps = typed("game", "guide");
    if (!steps.length) return;
    $("#cultivation-guide-steps").replaceChildren(...steps.map((entry) => {
      const item = el("li");
      item.append(el("b", "", entry.text), document.createTextNode(entry.body || ""));
      return item;
    }));
  }

  function renderTrailer() {
    const entry = row("trailer.video");
    const section = $("#trailer");
    if (!entry || !entry.src) {
      section.hidden = true;
      $$('a[href="#trailer"]').forEach((link) => { link.hidden = true; });
      return;
    }
    const [videoSource, posterSource] = splitList(entry.src).map(resolveSource);
    const video = $("#trailer-video");
    const source = $("source", video);
    if (source.getAttribute("src") !== videoSource) {
      source.src = videoSource;
      video.load();
    }
    video.poster = posterSource || posterFor(videoSource);
    if (entry.alt) video.setAttribute("aria-label", entry.alt);
  }

  function renderCredits(list) {
    const root = $("#credit-list");
    const ordered = list
      .filter((credit) => credit.sectionLabel && credit.name)
      .sort((left, right) => (Number(left.order) || 0) - (Number(right.order) || 0));
    const groups = new Map();
    ordered.forEach((credit) => {
      if (!groups.has(credit.sectionLabel)) groups.set(credit.sectionLabel, []);
      groups.get(credit.sectionLabel).push(credit);
    });
    root.replaceChildren();
    groups.forEach((credits, label) => {
      const group = el("div");
      group.dataset.rv = "";
      const details = el("dd");
      credits.forEach((credit) => {
        const person = el("span", "credit-person");
        const name = credit.url ? el("a", "", credit.name) : el("b", "", credit.name);
        if (credit.url) {
          name.href = credit.url;
          name.target = "_blank";
          name.rel = "noopener noreferrer";
        }
        person.appendChild(name);
        const metadata = [credit.role, ...(credit.note || "").split("|")].map((value) => value.trim()).filter(Boolean);
        if (metadata.length) person.appendChild(el("small", "", metadata.join(" / ")));
        details.appendChild(person);
      });
      group.append(el("dt", "", label), details);
      root.appendChild(group);
    });
    observeReveals(root);
  }

  async function loadContent() {
    try {
      setContentRows(await fetchCsv($("#main").dataset.contentSource));
    } catch (error) {
      return false;
    }
    renderGeneric();
    renderNavigation();
    renderPrologue();
    renderSystemLead();
    renderFeatures();
    renderWorld();
    renderCharacters();
    renderEvents();
    renderPlayLinks();
    renderGuide();
    renderTrailer();
    return true;
  }

  async function loadCredits() {
    const root = $("#credit-list");
    try {
      renderCredits(await fetchCsv(root.dataset.creditSource));
    } catch (error) {
      root.replaceChildren();
      const group = el("div");
      group.append(el("dt", "", "CREDITS"), el("dd", "", "クレジットを読み込めませんでした。"));
      root.appendChild(group);
    }
  }

  /* ---------------------------------------------------------------
     Split text + reveals
     --------------------------------------------------------------- */
  /* Japanese-aware phrase grouping so lines never break inside a word */
  const CLOSING = /^[、。，．・：；？！」』）〕］｝〉》】ー…‥～,.!?:;)\]\s]+$/;
  const OPENING = /[「『（〔［｛〈《【(\[]$/;
  const HIRAGANA = /^[\u3041-\u309F]+$/;
  const segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("ja", { granularity: "word" }) : null;

  function phrases(value) {
    if (!segmenter) return value.split(/(?<=[、。！？\s])/);
    const out = [];
    for (const { segment } of segmenter.segment(value)) {
      const last = out[out.length - 1];
      const attach = last && (
        CLOSING.test(segment)
        || OPENING.test(last)
        || (HIRAGANA.test(segment) && Array.from(last).length + Array.from(segment).length <= 9)
      );
      if (attach) out[out.length - 1] = last + segment;
      else out.push(segment);
    }
    return out;
  }

  function splitText(node) {
    if (node.dataset.splitDone === "true") return;
    node.dataset.splitDone = "true";
    if (!node.getAttribute("aria-label")) node.setAttribute("aria-label", node.textContent.trim());
    let counter = 0;
    const walk = (parent) => {
      Array.from(parent.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const fragment = document.createDocumentFragment();
          phrases(child.textContent).forEach((phrase) => {
            const word = el("span", "split-w");
            word.setAttribute("aria-hidden", "true");
            Array.from(phrase).forEach((character) => {
              const span = el("span", "split-c", character);
              span.style.setProperty("--i", String(counter));
              counter += 1;
              word.appendChild(span);
            });
            fragment.appendChild(word);
          });
          child.replaceWith(fragment);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          walk(child);
        }
      });
    };
    walk(node);
  }

  const SCRAMBLE_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#%&*+=<>";
  function scramble(node) {
    if (reduced() || node.dataset.scrambled) return;
    node.dataset.scrambled = "true";
    const targets = $$("span", node).filter((span) => !span.children.length);
    targets.forEach((span) => {
      const final = span.textContent;
      const characters = Array.from(final);
      const started = performance.now();
      const duration = 600 + characters.length * 18;
      const step = (now) => {
        const progress = clamp((now - started) / duration, 0, 1);
        const settled = Math.floor(progress * characters.length);
        span.textContent = characters.map((character, index) => {
          if (index < settled || character === " " || character === "/") return character;
          return SCRAMBLE_GLYPHS[(Math.random() * SCRAMBLE_GLYPHS.length) | 0];
        }).join("");
        if (progress < 1) requestAnimationFrame(step);
        else span.textContent = final;
      };
      requestAnimationFrame(step);
    });
  }

  const revealObserver = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const node = entry.target;
      node.classList.add("is-in");
      if (node.hasAttribute("data-scramble")) scramble(node);
      revealObserver.unobserve(node);
    });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.01 }) : null;

  function observeReveals(root = document) {
    const targets = $$("[data-rv], [data-split], [data-scramble], .trailer__player", root);
    if (root !== document && root.matches?.("[data-rv]")) targets.push(root);
    targets.forEach((node) => {
      if (node.hasAttribute("data-split")) splitText(node);
      if (!revealObserver || reduced()) node.classList.add("is-in");
      else revealObserver.observe(node);
    });
  }

  /* ---------------------------------------------------------------
     Sound (site ambience; the demo keeps its own audio)
     --------------------------------------------------------------- */
  const Sound = {
    context: null,
    master: null,
    buffers: {},
    loopsStarted: false,
    loading: null,
    on: false,
    files: { hum: "site/audio/hum.wav", pump: "site/audio/pump.wav", tick: "site/audio/tick.wav", select: "site/audio/select.wav", boot: "site/audio/boot.wav" },
    ensure() {
      if (this.loading) return this.loading;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return Promise.resolve(false);
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.context.destination);
      this.loading = Promise.all(Object.entries(this.files).map(async ([name, path]) => {
        try {
          const response = await fetch(path);
          const data = await response.arrayBuffer();
          this.buffers[name] = await new Promise((resolve, reject) => this.context.decodeAudioData(data, resolve, reject));
        } catch (error) { /* missing sound is fine */ }
      })).then(() => true);
      return this.loading;
    },
    startLoops() {
      if (this.loopsStarted || !this.context) return;
      this.loopsStarted = true;
      [["hum", 0.55], ["pump", 0.16]].forEach(([name, volume]) => {
        const buffer = this.buffers[name];
        if (!buffer) return;
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const gain = this.context.createGain();
        gain.gain.value = volume;
        source.connect(gain).connect(this.master);
        source.start();
      });
    },
    ambient(level) {
      if (!this.context) return;
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(level, now, level > 0 ? 0.6 : 0.25);
    },
    play(name, volume = 1) {
      if (!this.on || !this.context || !this.buffers[name]) return;
      const source = this.context.createBufferSource();
      source.buffer = this.buffers[name];
      const gain = this.context.createGain();
      gain.gain.value = volume * 0.5;
      source.connect(gain).connect(this.context.destination);
      source.start();
    }
  };

  const state = { playing: false, trailerPlaying: false, ready: false };

  function demoAudio() {
    try {
      return Demo.frame?.contentWindow?.OfficialDemoAudio || null;
    } catch (error) {
      return null;
    }
  }

  function syncDemoAudio() {
    const api = demoAudio();
    if (!api) return;
    try {
      if (Sound.on && state.playing) api.start();
      else api.stop();
    } catch (error) { /* demo not ready */ }
  }

  function syncAudio() {
    const wantAmbient = Sound.on && !state.playing && !state.trailerPlaying && !document.hidden;
    if (wantAmbient) {
      Sound.ensure().then(() => {
        if (!Sound.context) return;
        Sound.context.resume?.();
        Sound.startLoops();
        Sound.ambient(Sound.on && !state.playing && !state.trailerPlaying && !document.hidden ? 0.9 : 0);
      });
    } else {
      Sound.ambient(0);
    }
    syncDemoAudio();
  }

  function setSound(on, { save = true } = {}) {
    Sound.on = Boolean(on);
    if (save) local.set("ug-sound", Sound.on ? "on" : "off");
    const toggle = $("#sound-toggle");
    toggle.setAttribute("aria-pressed", String(Sound.on));
    toggle.setAttribute("aria-label", Sound.on ? text("header.audioStopAria", "サイトの音を停止") : text("header.audioPlayAria", "サイトの音を再生"));
    $("#sound-state").textContent = Sound.on ? text("header.audioOn", "ON") : text("header.audioOff", "OFF");
    if (Sound.on) Sound.ensure();
    syncAudio();
  }

  /* ---------------------------------------------------------------
     Live demo (hero) + play mode
     --------------------------------------------------------------- */
  const DEFAULT_DEMO = "official-demo.html?officialdemo=1&build=20261013godot2";
  const EMBED_STYLE = `
    html.ug-attract .facility-clean-tools,
    html.ug-attract .facility-grid-toolbar,
    html.ug-attract .selected-unit-panel,
    html.ug-attract .tool-storage-ring,
    html.ug-attract .facility-camera-transition,
    html.ug-attract .farm3d-hud,
    html.ug-attract .farm3d-hover-label { opacity: 0 !important; visibility: hidden !important; }
    .facility-clean-tools, .facility-grid-toolbar, .farm3d-hud { transition: opacity .8s ease .5s, visibility 0s; }
    html.ug-attract .facility-grid-shell { border-color: transparent !important; box-shadow: none !important; outline: 0 !important; }
    html.ug-attract body { cursor: default; }
  `;
  const Demo = { frame: null, loaded: false, statusTimer: 0, loadPromise: null };

  /* Pause the demo's drawing while the hero is off screen (its clock keeps running). */
  function installFramePause(win) {
    if (!win || win.__ugPause) return;
    const original = win.requestAnimationFrame.bind(win);
    const queue = [];
    const control = {
      paused: false,
      resume() {
        control.paused = false;
        queue.splice(0).forEach((callback) => original(callback));
      }
    };
    win.requestAnimationFrame = (callback) => {
      if (control.paused) {
        queue.push(callback);
        return 0;
      }
      return original(callback);
    };
    win.__ugPause = control;
  }

  function setDemoDrawing(on) {
    try {
      const control = Demo.frame?.contentWindow?.__ugPause;
      if (!control) return;
      if (on) control.resume();
      else control.paused = true;
    } catch (error) { /* not ready */ }
  }

  function observeHero() {
    if (!("IntersectionObserver" in window)) return;
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        Demo.heroVisible = entry.isIntersecting;
        setDemoDrawing(entry.isIntersecting || state.playing);
      });
    }, { threshold: 0 }).observe($("#top"));
  }

  function demoSource() {
    const entry = row("game.frame");
    return resolveSource(entry?.src) || DEFAULT_DEMO;
  }

  function setAttract(on) {
    try {
      Demo.frame?.contentDocument?.documentElement.classList.toggle("ug-attract", on);
    } catch (error) { /* cross-origin or not ready */ }
  }

  function createDemo() {
    if (Demo.frame) return Demo.loadPromise;
    if (location.protocol === "file:") {
      $("#local-launch-note").hidden = false;
      $("#game-loading").classList.add("is-hidden");
      Demo.loadPromise = Promise.resolve(false);
      return Demo.loadPromise;
    }
    const frame = el("iframe");
    frame.title = text("game.frame", "UNDER GREEN ゲーム体験版");
    frame.allow = "autoplay; fullscreen";
    frame.setAttribute("tabindex", "-1");
    frame.inert = true;
    Demo.frame = frame;
    Demo.loadPromise = new Promise((resolve) => {
      frame.addEventListener("load", () => {
        Demo.loaded = true;
        try {
          const frameDocument = frame.contentDocument;
          const style = frameDocument.createElement("style");
          style.textContent = EMBED_STYLE;
          frameDocument.head.appendChild(style);
          frameDocument.documentElement.classList.toggle("ug-attract", !state.playing);
          installFramePause(frame.contentWindow);
          setDemoDrawing(Demo.heroVisible !== false || state.playing);
          const resync = () => setTimeout(syncDemoAudio, 0);
          frameDocument.addEventListener("pointerdown", resync, true);
          frameDocument.addEventListener("keydown", (event) => {
            resync();
            if (event.key === "Escape" && state.playing && event.target === frameDocument.body) exitPlay();
          }, true);
        } catch (error) { /* ignore */ }
        setTimeout(() => $("#game-loading").classList.add("is-hidden"), 500);
        syncDemoAudio();
        clearInterval(Demo.statusTimer);
        Demo.statusTimer = setInterval(updateDemoStatus, 700);
        resolve(true);
      }, { once: true });
    });
    frame.src = demoSource();
    $("#stage-frame-wrap").appendChild(frame);
    return Demo.loadPromise;
  }

  function updateDemoStatus() {
    if (document.hidden) return;
    try {
      const snapshot = Demo.frame?.contentWindow?.farm3dBridge?.snapshot?.();
      if (!snapshot) return;
      const day = pad(Math.max(1, Number(snapshot.day) || 1));
      const progress = pad(Math.round(clamp(Number(snapshot.dayProgress) || 0, 0, 1) * 100));
      const status = snapshot.timeRunning ? text("header.statusGrowing", "GROWING") : text("header.statusPaused", "PAUSED");
      $("#hero-day").textContent = `DAY ${day} · ${progress}% · ${status}`;
    } catch (error) { /* ignore */ }
  }

  function enterPlay() {
    if (state.playing) return;
    closeMenu();
    const start = () => {
      state.playing = true;
      doc.classList.add("is-playing");
      $("#play-ui").setAttribute("aria-hidden", "false");
      lenis?.stop();
      if (!lenis) doc.style.overflow = "hidden";
      createDemo();
      if (Demo.frame) {
        Demo.frame.inert = false;
        Demo.frame.removeAttribute("tabindex");
      }
      setAttract(false);
      setDemoDrawing(true);
      Cursor.suspend(true);
      if (local.get("ug-sound") !== "off") setSound(true, { save: false });
      Sound.play("boot", 0.6);
      const sweep = $("#boot-sweep");
      sweep.classList.remove("is-on");
      void sweep.offsetWidth;
      if (!reduced()) sweep.classList.add("is-on");
      syncAudio();
      if (location.hash !== "#play") history.replaceState(null, "", "#play");
      setTimeout(() => Demo.frame?.focus(), 900);
    };
    if (window.scrollY > 4) {
      scrollToTarget(0, { duration: Math.min(2.2, 0.8 + window.scrollY / 4000), onComplete: start });
    } else {
      start();
    }
  }

  function exitPlay({ scroll = true } = {}) {
    if (!state.playing) return;
    state.playing = false;
    doc.classList.remove("is-playing");
    $("#play-ui").setAttribute("aria-hidden", "true");
    if (Demo.frame) {
      Demo.frame.inert = true;
      Demo.frame.setAttribute("tabindex", "-1");
    }
    setAttract(true);
    lenis?.start();
    doc.style.overflow = "";
    Cursor.suspend(false);
    syncAudio();
    if (location.hash === "#play") history.replaceState(null, "", location.pathname + location.search);
    if (scroll) setTimeout(() => scrollToTarget($("#prologue")), 350);
  }

  /* ---------------------------------------------------------------
     Smooth scroll
     --------------------------------------------------------------- */
  let lenis = null;
  function initScroll() {
    if (!window.Lenis || reduced()) return;
    lenis = new window.Lenis({ lerp: 0.11, smoothWheel: true, wheelMultiplier: 0.95, touchMultiplier: 1.4 });
  }

  function scrollToTarget(target, { duration = 1.6, onComplete } = {}) {
    if (lenis) {
      lenis.scrollTo(target, { duration, easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), onComplete, force: true });
      return;
    }
    const top = typeof target === "number" ? target : target.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top, behavior: reduced() ? "auto" : "smooth" });
    if (onComplete) setTimeout(onComplete, reduced() ? 0 : 900);
  }

  /* ---------------------------------------------------------------
     Loader
     --------------------------------------------------------------- */
  const Loader = { shown: 0, target: 0, done: false, started: performance.now(), min: 1800, tasks: 0, finished: 0 };

  function track(promise) {
    Loader.tasks += 1;
    const advance = () => {
      Loader.finished += 1;
      Loader.target = Loader.finished / Loader.tasks;
    };
    Promise.resolve(promise).then(advance, advance);
    return promise;
  }

  function finishLoader(manual = false) {
    if (Loader.done) return;
    Loader.done = true;
    $("#loader-num").textContent = "100";
    $("#loader-bar").style.width = "100%";
    $("#loader-status").textContent = manual ? text("intro.loadingManual", "MANUAL ACCESS") : text("intro.loadingGranted", "ACCESS GRANTED");
    session.set("ug-visited", "1");
    setTimeout(() => {
      $("#loader").classList.add("is-done");
      document.body.classList.remove("is-loading");
      doc.classList.add("is-ready");
      state.ready = true;
      lenis?.start();
      if (location.hash === "#play" || params.has("play")) {
        setTimeout(enterPlay, 900);
      } else if (location.hash.length > 1) {
        const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (target) setTimeout(() => scrollToTarget(target, { duration: 1.2 }), 300);
      }
    }, manual ? 60 : 380);
    setTimeout(() => { $("#loader").hidden = true; }, 1600);
  }

  function tickLoader(now) {
    if (Loader.done) return;
    const timeShare = clamp((now - Loader.started) / Loader.min, 0, 1);
    const goal = Math.min(Loader.target, timeShare);
    Loader.shown += (goal - Loader.shown) * 0.12;
    if (goal >= 1 && Loader.shown > 0.995) Loader.shown = 1;
    const percent = Math.round(Loader.shown * 100);
    $("#loader-num").textContent = pad(percent, 3);
    $("#loader-bar").style.width = `${percent}%`;
    const seed = $("#loader-seed");
    seed.style.transform = `scale(${0.35 + Loader.shown * 0.65}) rotate(${(1 - Loader.shown) * -12}deg)`;
    seed.style.opacity = String(0.15 + Loader.shown * 0.85);
    if (Loader.shown > 0.72) $("#loader-status").textContent = text("intro.loadingVerify", "VERIFYING RESTORED DATA...");
    if (Loader.shown >= 1) finishLoader();
  }

  /* ---------------------------------------------------------------
     Scroll-driven pieces
     --------------------------------------------------------------- */
  const layout = { sections: [], viewport: 0 };

  function measure() {
    layout.viewport = window.innerHeight;
    layout.sections = $$("[data-depth]").map((node) => ({ node, label: node.dataset.depth, id: node.id }));
  }

  const Prologue = { characters: [], total: 0, revealed: -1, decoding: [], lastGlyph: 0 };
  const DECODE_GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノ01#%█▓▒░";

  function buildPrologue() {
    const container = $("#prologue-lines");
    Prologue.characters = [];
    $$("p", container).forEach((paragraph) => {
      const content = paragraph.textContent;
      paragraph.setAttribute("aria-label", content);
      paragraph.replaceChildren(...phrases(content).map((phrase) => {
        const group = el("span", "pw");
        group.setAttribute("aria-hidden", "true");
        Array.from(phrase).forEach((character) => {
          const span = el("span", "pc", character);
          Prologue.characters.push({ span, character });
          group.appendChild(span);
        });
        return group;
      }));
    });
    Prologue.total = Prologue.characters.length;
    Prologue.revealed = -1;
    if (reduced()) Prologue.characters.forEach((entry) => entry.span.classList.add("on"));
  }

  function updatePrologue() {
    const section = $("#prologue");
    if (!Prologue.total || reduced()) return;
    const rect = section.getBoundingClientRect();
    const range = section.offsetHeight - layout.viewport;
    const progress = clamp(-rect.top / range, 0, 1);
    const target = Math.round(clamp((progress - 0.03) / 0.84, 0, 1) * Prologue.total);
    if (target === Prologue.revealed) return;
    const from = Math.max(0, Math.min(target, Prologue.revealed) - 4);
    const to = Math.min(Prologue.total, Math.max(target, Prologue.revealed) + 5);
    Prologue.revealed = target;
    Prologue.decoding = [];
    for (let index = from; index < to; index += 1) {
      const entry = Prologue.characters[index];
      const on = index < target;
      const cursor = index === target && target < Prologue.total;
      const decoding = index > target && index <= target + 3 && target > 0 && target < Prologue.total;
      entry.span.classList.toggle("on", on);
      entry.span.classList.toggle("cur", cursor);
      entry.span.classList.toggle("dc", decoding);
      if (decoding) Prologue.decoding.push(entry);
      else entry.span.textContent = entry.character;
    }
    $("#prologue-pct").textContent = `RESTORED ${pad(Math.round((target / Prologue.total) * 100), 3)}%`;
    section.classList.toggle("is-complete", target >= Prologue.total);
  }

  function animatePrologueGlyphs(now) {
    if (!Prologue.decoding.length || now - Prologue.lastGlyph < 70) return;
    Prologue.lastGlyph = now;
    Prologue.decoding.forEach((entry) => {
      if (/\s/.test(entry.character)) return;
      entry.span.textContent = DECODE_GLYPHS[(Math.random() * DECODE_GLYPHS.length) | 0];
    });
  }

  function updateParallax() {
    const story = $("#world .story__bg video");
    if (story) {
      const rect = story.parentElement.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < layout.viewport) {
        const shift = (rect.top + rect.height / 2 - layout.viewport / 2) * -0.12;
        story.style.transform = `translate3d(0, ${shift}px, 0)`;
      }
    }
    const art = $("#credits-image");
    if (art) {
      const rect = art.parentElement.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < layout.viewport) {
        const shift = (rect.top + rect.height / 2 - layout.viewport / 2) * -0.14 - rect.height * 0.08;
        art.style.transform = `translate3d(0, ${shift}px, 0)`;
      }
    }
  }

  const Header = { lastY: 0, current: "" };
  function updateChrome(y) {
    const header = $("#hdr");
    doc.classList.toggle("at-top", y < 10);
    header.classList.toggle("is-solid", y > 40);
    const delta = y - Header.lastY;
    if (Math.abs(delta) > 6) {
      header.classList.toggle("is-hidden", delta > 0 && y > layout.viewport * 0.7 && !$("#menu").classList.contains("is-open"));
      Header.lastY = y;
    }

    const maxScroll = Math.max(1, doc.scrollHeight - layout.viewport);
    const progress = clamp(y / maxScroll, 0, 1);
    $("#depth-value").textContent = pad(Math.round(progress * 1284), 4);
    $("#depth-fill").style.transform = `scaleY(${progress})`;

    let current = layout.sections[0];
    const probe = layout.viewport * 0.45;
    layout.sections.forEach((section) => {
      if (section.node.getBoundingClientRect().top <= probe) current = section;
    });
    if (current && current.label !== Header.current) {
      Header.current = current.label;
      $("#depth-label").textContent = current.label;
    }
    const inView = new Map();
    $$("#hdr-nav a, #menu-nav a").forEach((link) => {
      const id = link.dataset.nav;
      if (!inView.has(id)) {
        const target = document.getElementById(id);
        const rect = target?.getBoundingClientRect();
        inView.set(id, Boolean(rect && rect.top <= probe && rect.bottom > probe));
      }
      link.classList.toggle("is-current", inView.get(id));
    });
  }

  /* ---------------------------------------------------------------
     Feature stage (desktop sticky screen / mobile inline media)
     --------------------------------------------------------------- */
  const FEATURE_IMAGE_TIME = 4800;

  function loadVideo(video) {
    if (video.dataset.src) {
      video.src = video.dataset.src;
      delete video.dataset.src;
      video.preload = "auto";
    }
  }

  function stopLayer(layer) {
    if (!layer) return;
    clearTimeout(layer.timer);
    layer.items.forEach((item) => {
      if (item.video) {
        item.video.pause();
        item.video.onended = null;
      }
    });
  }

  /* album controls: arrows, counter, thumbnails (desktop) or dots (mobile) */
  function thumbFor(item) {
    if (item.video) return posterFor(item.video.dataset.src || item.video.currentSrc || "");
    return $("img", item)?.getAttribute("src") || "";
  }

  function albumArrow(direction) {
    const button = el("button", `album__arrow album__arrow--${direction}`);
    button.type = "button";
    button.setAttribute("aria-label", direction === "prev" ? "前の画像" : "次の画像");
    button.dataset.cursor = direction === "prev" ? "PREV" : "NEXT";
    button.innerHTML = direction === "prev"
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
    return button;
  }

  function buildAlbum(layer, root, { thumbs }) {
    root.replaceChildren();
    layer.ui = null;
    const count = layer.items.length;
    root.hidden = count < 2;
    if (count < 2) return;
    const go = (step) => {
      showLayerItem(layer, (layer.index + step + count) % count);
      Sound.play("tick", 0.5);
    };
    const previous = albumArrow("prev");
    const next = albumArrow("next");
    previous.addEventListener("click", (event) => { event.stopPropagation(); go(-1); });
    next.addEventListener("click", (event) => { event.stopPropagation(); go(1); });
    const counter = el("span", "album__count mono");
    const list = el("div", thumbs ? "album__thumbs" : "album__dots");
    const marks = layer.items.map((item, index) => {
      const mark = el("button", thumbs ? "album__thumb" : "album__dot");
      mark.type = "button";
      mark.setAttribute("aria-label", `${index + 1}枚目を表示${layer.captions[index] ? `：${layer.captions[index]}` : ""}`);
      if (thumbs) {
        const image = el("img");
        image.src = thumbFor(item);
        image.alt = "";
        image.loading = "lazy";
        mark.append(image, el("i"));
        if (item.video) mark.appendChild(el("span", "album__badge", "▶"));
      }
      mark.addEventListener("click", (event) => {
        event.stopPropagation();
        if (index === layer.index) return;
        showLayerItem(layer, index);
        Sound.play("tick", 0.5);
      });
      list.appendChild(mark);
      return mark;
    });
    if (thumbs) root.append(el("span", "album__label mono", `ALBUM · ${count}`), previous, list, next, counter);
    else root.append(previous, next, counter, list);
    layer.ui = {
      select(index) {
        counter.textContent = `${pad(index + 1)} / ${pad(count)}`;
        marks.forEach((mark, position) => {
          mark.classList.toggle("is-active", position === index);
          mark.style.setProperty("--p", position < index ? "1" : "0");
          mark.setAttribute("aria-current", String(position === index));
        });
      },
      progress(value) {
        marks[layer.index]?.style.setProperty("--p", value.toFixed(3));
      }
    };
  }

  function showLayerItem(layer, index) {
    stopLayer(layer);
    layer.index = index;
    layer.started = performance.now();
    layer.items.forEach((item, position) => item.classList.toggle("is-on", position === index));
    layer.ui?.select(index);
    if (layer.caption) layer.caption.textContent = layer.captions[index] || layer.captions[0] || "";
    const item = layer.items[index];
    const advance = () => {
      if (layer.items.length > 1) showLayerItem(layer, (index + 1) % layer.items.length);
    };
    if (item?.video) {
      const video = item.video;
      loadVideo(video);
      video.loop = layer.items.length === 1;
      try { video.currentTime = 0; } catch (error) { /* metadata not ready */ }
      video.onended = advance;
      const attempt = video.play();
      if (attempt?.catch) attempt.catch(() => { layer.timer = setTimeout(advance, FEATURE_IMAGE_TIME); });
    } else if (layer.items.length > 1) {
      layer.timer = setTimeout(advance, FEATURE_IMAGE_TIME);
    }
  }

  function fillFeatureDetail(index) {
    const entry = Features.list[index];
    if (!entry) return;
    const number = el("span", "feats__num", pad(index + 1));
    number.setAttribute("aria-hidden", "true");
    $("#feat-detail").replaceChildren(
      number,
      el("p", "feats__label mono", entry.subtext || `FEATURE ${pad(index + 1)}`),
      el("h3", "feats__title", entry.text),
      el("p", "feats__body", entry.body || "")
    );
  }

  function activateFeature(index, { silent = false } = {}) {
    if (index === Features.active || !featureLayers[index]) return;
    const previous = featureLayers[Features.active];
    if (previous) {
      previous.node.classList.remove("is-active");
      previous.node.classList.add("is-leaving");
      previous.ui = null;
      stopLayer(previous);
      setTimeout(() => previous.node.classList.remove("is-leaving"), 1000);
    }
    Features.active = index;
    const layer = featureLayers[index];
    layer.node.classList.add("is-active");
    layer.caption = $("#feat-caption");
    $("#feat-cam").textContent = `CAM // ${layer.camera}`;
    $("#feat-count").textContent = `FEATURE ${pad(index + 1)} / ${pad(featureLayers.length)}`;
    buildAlbum(layer, $("#feat-album"), { thumbs: true });
    const screen = $("#feat-screen");
    screen.classList.toggle("is-album", layer.items.length > 1);
    if (layer.items.length > 1) screen.dataset.cursor = "NEXT";
    else delete screen.dataset.cursor;
    $$("#feat-tabs .feats__tab").forEach((tab, position) => {
      tab.setAttribute("aria-selected", String(position === index));
      tab.tabIndex = position === index ? 0 : -1;
    });
    if (Features.visible) {
      showLayerItem(layer, 0);
    } else {
      layer.index = 0;
      layer.items.forEach((item, position) => item.classList.toggle("is-on", position === 0));
      layer.ui?.select(0);
      layer.caption.textContent = layer.captions[0] || "";
    }
    const detail = $("#feat-detail");
    if (silent || reduced()) {
      fillFeatureDetail(index);
      return;
    }
    Sound.play("tick", 0.5);
    detail.classList.add("is-out");
    clearTimeout(detail.swapTimer);
    detail.swapTimer = setTimeout(() => {
      fillFeatureDetail(index);
      requestAnimationFrame(() => detail.classList.remove("is-out"));
    }, 220);
  }

  function updateFeatureBars() {
    const layer = featureLayers[Features.active];
    if (!layer?.ui) return;
    const item = layer.items[layer.index];
    let progress = 0;
    if (item?.video) progress = item.video.duration ? item.video.currentTime / item.video.duration : 0;
    else progress = (performance.now() - layer.started) / FEATURE_IMAGE_TIME;
    layer.ui.progress(clamp(progress, 0, 1));
  }

  function observeFeatures() {
    $("#feat-screen").addEventListener("click", () => {
      const layer = featureLayers[Features.active];
      if (!layer || layer.items.length < 2) return;
      showLayerItem(layer, (layer.index + 1) % layer.items.length);
      Sound.play("tick", 0.5);
    });
    if (!("IntersectionObserver" in window)) {
      Features.visible = true;
      return;
    }
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        Features.visible = entry.isIntersecting;
        const layer = featureLayers[Features.active];
        if (!layer) return;
        if (entry.isIntersecting) showLayerItem(layer, layer.index || 0);
        else stopLayer(layer);
      });
    }, { threshold: 0.15 }).observe($("#feats"));
  }

  function observeAmbientVideos() {
    const video = $("#world-bg");
    if (!video || !("IntersectionObserver" in window)) return;
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && video.dataset.poster) {
          video.poster = video.dataset.poster;
          delete video.dataset.poster;
        }
        if (entry.isIntersecting && !reduced()) {
          loadVideo(video);
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    }, { rootMargin: "40% 0px" }).observe(video.parentElement);
  }

  /* ---------------------------------------------------------------
     Live robot (Godot model, loaded when the finale approaches)
     --------------------------------------------------------------- */
  /* Visitor counter: the robot greets "あなたは N 人目の訪問者です".
     Every page view is counted and shows its own number. The count lives in the Cloudflare Worker
     set in site-content.csv (contact.visitorCounter: href = its /hit URL, meta = counter name). */
  const Visitors = { number: 0, shown: false, counted: false };

  async function countVisitor() {
    const config = row("contact.visitorCounter");
    if (!config?.href) return 0;
    // ?counter=test で確認用のカウンターを使う（本番の数を増やさない）
    const name = params.get("counter") === "test" ? "test" : (config.meta || "visitors");
    // 開くたびに 1 つ増やし、そのときの番号を出す（番号はブラウザに残さない）
    try {
      const endpoint = new URL(config.href);
      endpoint.searchParams.set("name", name);
      const response = await fetch(endpoint, { method: "POST", cache: "no-store" });
      if (!response.ok) return 0;
      return Math.floor(Number((await response.json()).value) || 0);
    } catch (error) {
      return 0;
    }
  }

  function visitorLine(number) {
    const template = text("contact.visitorLine", "あなたは {n} 人目の訪問者です。");
    const [before, after = ""] = template.split("{n}");
    const count = el("b", "robot__count", "0");
    count.dataset.value = String(number);
    const fragment = document.createDocumentFragment();
    fragment.append(document.createTextNode(before), count, document.createTextNode(after));
    return fragment;
  }

  function animateCount(node) {
    const target = Number(node.dataset.value) || 0;
    const format = (value) => value.toLocaleString("ja-JP");
    if (reduced() || target < 2) {
      node.textContent = format(target);
      return;
    }
    const started = performance.now();
    const duration = Math.min(1800, 600 + String(target).length * 220);
    const step = (now) => {
      const progress = clamp((now - started) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      node.textContent = format(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function showVisitorLine() {
    const line = $("#robot-line");
    if (!line || !Visitors.number) return;
    line.replaceChildren(visitorLine(Visitors.number));
    line.dataset.mode = "visitor";
    const count = $(".robot__count", line);
    if (Visitors.shown) count.textContent = Visitors.number.toLocaleString("ja-JP");
    else animateCount(count);
    Visitors.shown = true;
  }

  function initRobot() {
    const stage = $("#robot-stage");
    if (!stage || !("IntersectionObserver" in window)) return;
    const quote = (row("characters.support_robot")?.note || "").replace(/^「|」$/g, "");
    if (quote) $("#robot-line").textContent = quote;
    // count once the page has settled, so the request never slows the first view
    setTimeout(() => {
      countVisitor().then((number) => {
        Visitors.number = number;
        Visitors.counted = true;
        if (number && Visitors.visibleOnce) showVisitorLine();
      });
    }, 1500);
    let robot = null;
    let visible = false;
    const preload = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      preload.disconnect();
      import(new URL("robot.js", SCRIPT_URL).href)
        .then((module) => module.mountRobot(stage, { url: new URL("models/support-robot.glb", SCRIPT_URL).href, reduced: reduced() }))
        .then((instance) => {
          robot = instance;
          stage.classList.add("is-ready");
          robot.setVisible(visible);
        })
        .catch(() => { /* the static illustration stays */ });
    }, { rootMargin: "0px 0px 90% 0px" });
    preload.observe(stage);
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        visible = entry.isIntersecting;
        robot?.setVisible(visible);
        if (visible && !Visitors.visibleOnce) {
          Visitors.visibleOnce = true;
          if (Visitors.number) showVisitorLine();
        }
      });
    }, { threshold: 0.08 }).observe(stage);
    stage.addEventListener("click", () => {
      Sound.play("select", 0.7);
      const line = $("#robot-line");
      // クリックで「訪問者の番号」と「いつものひとこと」を切り替える
      if (Visitors.number) {
        if (line.dataset.mode === "visitor" && quote) {
          line.textContent = quote;
          line.dataset.mode = "quote";
        } else {
          showVisitorLine();
        }
      }
      line.classList.remove("is-pop");
      void line.offsetWidth;
      line.classList.add("is-pop");
    });
  }

  /* ---------------------------------------------------------------
     Trailer
     --------------------------------------------------------------- */
  function initTrailer() {
    const slot = $("#trailer-slot");
    const player = $("#trailer-player");
    const video = $("#trailer-video");
    const backdrop = $("#theater-backdrop");
    let theater = false;
    let returnFocus = null;

    const centred = () => {
      const width = Math.min(window.innerWidth * 0.92, 1280, (window.innerHeight - 120) * 16 / 9);
      const height = width * 9 / 16;
      return { left: (window.innerWidth - width) / 2, top: (window.innerHeight - height) / 2 + 12, width, height };
    };
    const place = (rect) => {
      player.style.left = `${rect.left}px`;
      player.style.top = `${rect.top}px`;
      player.style.width = `${rect.width}px`;
      player.style.height = `${rect.height}px`;
    };
    const clearPlacement = () => {
      player.classList.remove("is-theater");
      ["left", "top", "width", "height", "transition"].forEach((key) => { player.style[key] = ""; });
    };
    // 再生中は画面の真ん中へ。いまの位置から中央へ移り、閉じると元の場所へ戻る
    const openTheater = () => {
      if (theater) return;
      theater = true;
      returnFocus = document.activeElement;
      const from = slot.getBoundingClientRect();
      player.style.transition = "none";
      player.classList.add("is-theater");
      place(from);
      void player.offsetWidth;
      player.style.transition = "";
      requestAnimationFrame(() => place(centred()));
      backdrop.classList.add("is-on");
      lenis?.stop();
      Cursor.suspend(true);
    };
    const closeTheater = ({ pause = true } = {}) => {
      if (!theater) return;
      theater = false;
      if (pause && !video.paused) video.pause();
      place(slot.getBoundingClientRect());
      backdrop.classList.remove("is-on");
      lenis?.start();
      Cursor.suspend(false);
      setTimeout(() => {
        if (!theater) clearPlacement();
      }, 720);
      if (returnFocus instanceof HTMLElement) returnFocus.focus({ preventScroll: true });
    };

    const start = () => {
      video.controls = true;
      video.muted = false;
      openTheater();
      const attempt = video.play();
      if (attempt?.catch) attempt.catch(() => {});
    };
    $("#trailer-play").addEventListener("click", (event) => {
      event.stopPropagation();
      start();
    });
    player.addEventListener("click", (event) => {
      if (!player.classList.contains("is-playing") && event.target === video) start();
    });
    $("#trailer-close").addEventListener("click", (event) => {
      event.stopPropagation();
      closeTheater();
    });
    backdrop.addEventListener("click", () => closeTheater());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && theater) closeTheater();
    });
    window.addEventListener("resize", () => {
      if (theater) place(centred());
    });
    video.addEventListener("play", () => {
      player.classList.add("is-playing");
      state.trailerPlaying = true;
      openTheater();
      syncAudio();
    });
    const stop = () => {
      state.trailerPlaying = false;
      syncAudio();
    };
    video.addEventListener("pause", stop);
    video.addEventListener("ended", () => {
      player.classList.remove("is-playing");
      video.controls = false;
      stop();
      closeTheater({ pause: false });
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting && !video.paused && !theater) video.pause();
        });
      }, { threshold: 0.15 }).observe(slot);
    }
  }


  /* ---------------------------------------------------------------
     Marquee
     --------------------------------------------------------------- */
  const Marquee = { x: 0, direction: -1, width: 0 };
  function updateMarquee(delta, velocity) {
    const track = $("#marquee-track");
    if (!track || reduced()) return;
    if (!Marquee.width) Marquee.width = track.scrollWidth / 2;
    if (Math.abs(velocity) > 0.1) Marquee.direction = velocity > 0 ? -1 : 1;
    const speed = 60 + Math.min(900, Math.abs(velocity) * 22);
    Marquee.x += Marquee.direction * speed * delta;
    if (Marquee.x <= -Marquee.width) Marquee.x += Marquee.width;
    if (Marquee.x > 0) Marquee.x -= Marquee.width;
    track.style.transform = `translate3d(${Marquee.x}px, 0, 0)`;
  }

  /* ---------------------------------------------------------------
     Cursor
     --------------------------------------------------------------- */
  // ポインターについてくるドット絵のサポートロボット。表情：0 目を光らせる / 1 きらっ / 2 にっこり（ふだん）/ 3 びっくり / 4 居眠り
  const BOT_FACES = { normal: 0, glint: 1, happy: 2, surprised: 3, sleepy: 4 };
  const Cursor = {
    node: $(".cursor"),
    x: -100, y: -100, bx: -100, by: -100,
    enabled: false,
    hover: false,
    label: "",
    face: -1,
    flip: 1,
    lastMove: 0,
    downUntil: 0,
    init() {
      if (!mqFine.matches || reduced()) return;
      this.enabled = true;
      doc.classList.add("has-cursor");
      this.dot = $(".cursor__dot", this.node);
      this.bot = $(".cursor__bot", this.node);
      this.sprite = $(".cursor__sprite", this.node);
      this.tag = $(".cursor__label", this.node);
      window.addEventListener("pointermove", (event) => {
        if (event.pointerType !== "mouse") return;
        if (this.x < -50) {
          this.bx = event.clientX + 18;
          this.by = event.clientY + 16;
        }
        this.x = event.clientX;
        this.y = event.clientY;
        this.lastMove = performance.now();
        this.node.classList.remove("is-hidden");
      }, { passive: true });
      window.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse") this.pressed = true;
      }, { passive: true });
      window.addEventListener("pointerup", (event) => {
        if (event.pointerType !== "mouse") return;
        this.pressed = false;
        this.downUntil = performance.now() + 350;
      }, { passive: true });
      document.addEventListener("pointerover", (event) => {
        const target = event.target.closest?.("[data-cursor], a, button, [role='tab']");
        this.label = target?.dataset?.cursor || "";
        this.hover = Boolean(target);
        this.node.classList.toggle("is-hover", this.hover && !this.label);
        if (target && !this.label && target.closest(".hdr, .dossier__index, .menu")) Sound.play("tick", 0.18);
      });
      document.addEventListener("pointerleave", () => this.node.classList.add("is-hidden"));
    },
    suspend(on) {
      if (!this.enabled) return;
      doc.classList.toggle("has-cursor", !on);
      this.node.classList.toggle("is-hidden", on);
    },
    setFace(face) {
      if (face === this.face) return;
      this.face = face;
      this.sprite.style.backgroundPosition = `${-63 * face}px 0`;
    },
    update() {
      if (!this.enabled) return;
      const now = performance.now();
      this.dot.style.transform = `translate3d(${this.x}px, ${this.y}px, 0)`;
      // ポインターの右下を少し遅れて追いかけ、進む向きへ体を傾ける
      const targetX = this.x + 18;
      const targetY = this.y + 16;
      this.bx += (targetX - this.bx) * 0.13;
      this.by += (targetY - this.by) * 0.13;
      const lagX = targetX - this.bx;
      const idle = now - this.lastMove;
      const tilt = clamp(lagX * 0.35, -16, 16);
      const bob = idle > 600 ? Math.sin(now / 420) * 2 : 0;
      this.bot.style.transform = `translate3d(${this.bx}px, ${this.by + bob}px, 0) rotate(${tilt}deg)`;
      // ポインターのいる側を向く（もとの絵は左向き）
      const flip = this.bx + 20 < this.x ? -1 : 1;
      if (flip !== this.flip) {
        this.flip = flip;
        this.sprite.style.setProperty("--flip", String(flip));
      }
      // ふだんはにっこり。リンクやボタンの上では目を光らせる（ときどききらっ）
      let face = BOT_FACES.happy;
      let tag = this.label;
      if (this.pressed || now < this.downUntil) face = BOT_FACES.surprised;
      else if (idle > 6000) {
        face = BOT_FACES.sleepy;
        if (!tag) tag = "Zz";
      } else if (this.hover) face = now % 1600 < 160 ? BOT_FACES.glint : BOT_FACES.normal;
      this.setFace(face);
      if (tag !== this.shownTag) {
        this.shownTag = tag;
        if (tag) this.tag.textContent = tag;
        this.node.classList.toggle("is-label", Boolean(tag));
      }
    }
  };

  /* ---------------------------------------------------------------
     Menu
     --------------------------------------------------------------- */
  function closeMenu() {
    const menu = $("#menu");
    if (!menu.classList.contains("is-open")) return;
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    $("#menu-toggle").setAttribute("aria-expanded", "false");
    lenis?.start();
  }
  function toggleMenu() {
    const menu = $("#menu");
    const open = !menu.classList.contains("is-open");
    menu.classList.toggle("is-open", open);
    menu.setAttribute("aria-hidden", String(!open));
    $("#menu-toggle").setAttribute("aria-expanded", String(open));
    if (open) lenis?.stop();
    else lenis?.start();
  }

  /* ---------------------------------------------------------------
     Main loop
     --------------------------------------------------------------- */
  let lastFrame = performance.now();
  let lastScrollY = -1;
  let scrollVelocity = 0;

  function frame(now) {
    const delta = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    lenis?.raf(now);
    tickLoader(now);
    const y = window.scrollY;
    if (y !== lastScrollY) {
      scrollVelocity = lenis ? lenis.velocity : (y - lastScrollY);
      lastScrollY = y;
      updateChrome(y);
      updatePrologue();
      updateParallax();
    } else {
      scrollVelocity *= 0.9;
    }
    updateMarquee(delta, scrollVelocity);
    animatePrologueGlyphs(now);
    updateFeatureBars();
    Cursor.update();
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------
     Events
     --------------------------------------------------------------- */
  function bindEvents() {
    $$("[data-play-open]").forEach((button) => button.addEventListener("click", enterPlay));
    // clicking the live farm starts play mode (mouse only, so a tap while scrolling on phones doesn't)
    $("#stage").addEventListener("click", () => { if (!state.playing && state.ready && mqFine.matches) enterPlay(); });
    $("#play-exit").addEventListener("click", () => exitPlay());
    $("#loader-skip").addEventListener("click", () => finishLoader(true));
    $("#sound-toggle").addEventListener("click", () => {
      setSound(!Sound.on);
      if (Sound.on) Sound.play("tick", 0.6);
    });
    $("#menu-toggle").addEventListener("click", toggleMenu);

    document.addEventListener("click", (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const hash = link.getAttribute("href");
      if (hash === "#main") return;
      const target = hash === "#top" ? 0 : document.getElementById(hash.slice(1));
      if (target === null || target === undefined) return;
      event.preventDefault();
      closeMenu();
      if (state.playing) exitPlay({ scroll: false });
      scrollToTarget(target, { duration: 1.4 });
    });

    document.addEventListener("keydown", (event) => {
      if (!Loader.done && ["Escape", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        finishLoader(true);
        return;
      }
      if (event.key === "Escape") {
        if (state.playing) exitPlay();
        else closeMenu();
      }
    });

    document.addEventListener("visibilitychange", syncAudio);
    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        Marquee.width = 0;
        measure();
        lastScrollY = -1;
      }, 120);
    });
    mqDesktop.addEventListener?.("change", measure);
    window.addEventListener("load", () => { measure(); lastScrollY = -1; });
  }

  /* ---------------------------------------------------------------
     Boot
     --------------------------------------------------------------- */
  async function init() {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    if (location.hash !== "#play" && !location.hash) window.scrollTo(0, 0);

    const returning = session.get("ug-visited") === "1";
    Loader.min = params.has("skipIntro") ? 0 : (returning ? 700 : 2000);
    if (params.has("skipIntro")) $("#loader").classList.add("is-done");

    initScroll();
    lenis?.stop();
    if (params.has("debug")) window.__ug = { get lenis() { return lenis; }, scrollToTarget, enterPlay, exitPlay, state };
    Cursor.init();
    bindEvents();
    requestAnimationFrame(frame);

    const fontsReady = document.fonts?.ready || Promise.resolve();
    const logoReady = new Promise((resolve) => {
      const image = new Image();
      image.onload = image.onerror = resolve;
      image.src = "site/img/logo.webp";
    });
    const contentReady = loadContent();
    track(fontsReady);
    track(logoReady);
    track(contentReady);
    // the live farm gets a few seconds head start, but never blocks entry
    track(Promise.race([contentReady.then(() => createDemo()), new Promise((resolve) => setTimeout(resolve, returning ? 1500 : 4200))]));

    await contentReady;
    buildPrologue();
    observeReveals();
    observeFeatures();
    observeAmbientVideos();
    observeHero();
    initTrailer();
    initRobot();
    loadCredits();
    measure();
    // audio may only start after a gesture: restore a saved "on" at the first interaction
    if (local.get("ug-sound") === "on") {
      const resume = (event) => {
        if (!Sound.on && !event.target.closest?.("#sound-toggle")) setSound(true, { save: false });
        window.removeEventListener("pointerdown", resume, true);
        window.removeEventListener("keydown", resume, true);
      };
      window.addEventListener("pointerdown", resume, true);
      window.addEventListener("keydown", resume, true);
    }
    lastScrollY = -1;
  }

  init();
})();
