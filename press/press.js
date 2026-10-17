/* UNDER GREEN — press kit
   Text comes from ../site-content.csv (press / hero / system / characters / play rows) and ../credits.csv;
   the asset list (sizes, files) from assets.json, written by press-kit/build_press.py. */
(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

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
    return records.map((values) => Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").replace(/\r\n?/g, "\n").trim()])));
  }

  async function load(url, as) {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(url + " " + response.status);
    return as === "json" ? response.json() : response.text();
  }

  let rows = [];
  const row = (id) => {
    const [section, key] = id.split(".");
    return rows.find((entry) => entry.section === section && entry.key === key);
  };
  const text = (id, fallback = "") => row(id)?.text || fallback;
  const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0);
  const list = (section, key) => rows.filter((entry) => entry.section === section && (!key || entry.key === key)).sort(byOrder);

  function formatBytes(bytes) {
    if (!bytes) return "";
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(bytes >= 1e7 ? 0 : 1) + "MB";
    return Math.max(1, Math.round(bytes / 1e3)) + "KB";
  }
  const fileType = (href) => (href.split(".").pop() || "").toUpperCase();
  const dims = (item) => (item.w ? `${item.w} × ${item.h}` : "");
  const meta = (item, ...extra) => [dims(item), ...extra, formatBytes(item.bytes), fileType(item.href)].filter(Boolean).join(" / ");

  function paragraphs(target, value) {
    target.textContent = "";
    value.split(/\n+/).filter(Boolean).forEach((line) => target.append(el("p", "", line)));
  }

  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("is-on");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("is-on"), 2200);
  }

  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      const area = el("textarea");
      area.value = value;
      area.style.cssText = "position:fixed;opacity:0";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    toast("コピーしました");
  }

  function saveLink(item, label = "保存") {
    const link = el("a", "save mono", label);
    link.href = item.href;
    link.setAttribute("download", "");
    link.setAttribute("aria-label", `${item.title || ""} を保存（${meta(item)}）`);
    return link;
  }

  /* ---------- text ---------- */
  function fillText() {
    $$("[data-text]").forEach((node) => {
      const value = text(node.dataset.text);
      if (!value) {
        if (!node.textContent.trim()) node.hidden = true;
        return;
      }
      if (node.hasAttribute("data-paragraphs")) paragraphs(node, value);
      else node.textContent = value;
      node.hidden = false;
    });
    $$("[data-count]").forEach((node) => {
      const value = text(node.dataset.count);
      node.textContent = value ? `${value.replace(/\s/g, "").length}字` : "";
    });
    $$("[data-copy]").forEach((button) => button.addEventListener("click", () => copy(text(button.dataset.copy))));
    const title = text("press.pageTitle");
    if (title) document.title = title;
  }

  function buildFacts() {
    const target = $("#fact-list");
    list("press", "fact").forEach((fact) => {
      const term = el("dt", "", fact.text);
      const value = el("dd");
      if (fact.href) {
        const link = el("a", "", fact.subtext);
        link.href = fact.href;
        if (/^https?:/.test(fact.href) && !fact.href.includes("UnderGreenOfficial")) {
          link.target = "_blank";
          link.rel = "noopener";
        }
        value.append(link);
      } else {
        value.textContent = fact.subtext;
      }
      target.append(term, value);
    });
    const contact = row("press.contact");
    if (contact?.href) {
      const button = $("#contact-x");
      button.href = contact.href;
      button.firstChild.textContent = contact.text + " ";
      $("small", button).textContent = contact.subtext;
    }
    const email = row("press.email");
    if (email?.href) {
      const link = el("a", "btn btn--block", email.text || "メールで問い合わせる");
      link.href = email.href;
      link.append(" ", el("small", "mono", email.href.replace(/^mailto:/, "")));
      $("#contact-x").after(link);
    }
    $("#print-facts").addEventListener("click", () => window.print());
  }

  function buildFeatures() {
    const target = $("#feature-list");
    list("system").filter((entry) => entry.type === "feature").forEach((feature, index) => {
      const item = el("li");
      item.append(el("span", "features__no mono", String(index + 1).padStart(2, "0")), el("h4", "", feature.text), el("p", "", feature.body));
      target.append(item);
    });
  }

  /* ---------- media ---------- */
  function videoPlayer(item, { controls = true, loop = false } = {}) {
    const video = el("video");
    video.src = item.href;
    video.poster = item.poster;
    video.playsInline = true;
    video.controls = controls;
    video.loop = loop;
    video.muted = loop;
    video.autoplay = true;
    return video;
  }

  function buildTrailer(trailer) {
    if (!trailer) return;
    const target = $("#trailer");
    const frame = el("button", "trailer__frame");
    frame.type = "button";
    frame.setAttribute("aria-label", `${trailer.title} を再生`);
    const poster = el("img");
    poster.src = trailer.poster;
    poster.alt = "";
    poster.loading = "lazy";
    frame.append(poster, el("span", "play", "▶"));
    frame.addEventListener("click", () => {
      const holder = el("div", "trailer__frame");
      holder.append(videoPlayer(trailer));
      frame.replaceWith(holder);
    }, { once: true });
    const info = el("div", "trailer__info");
    info.append(el("h3", "", trailer.title), el("p", "mono", meta(trailer, trailer.duration)));
    const note = text("trailer.note");
    if (note) info.append(el("p", "trailer__note", note));
    info.append(saveLink(trailer, "MP4を保存"));
    target.append(frame, info);
  }

  function buildClips(clips) {
    const target = $("#clip-list");
    clips.forEach((clip) => {
      const card = el("li", "card");
      const frame = el("button", "card__media card__media--video");
      frame.type = "button";
      frame.setAttribute("aria-label", `${clip.title} を再生`);
      const poster = el("img");
      poster.src = clip.poster;
      poster.alt = "";
      poster.loading = "lazy";
      frame.append(poster, el("span", "play play--small", "▶"));
      frame.addEventListener("click", () => {
        const holder = el("div", "card__media");
        holder.append(videoPlayer(clip, { controls: false, loop: true }));
        frame.replaceWith(holder);
      }, { once: true });
      const body = el("div", "card__body");
      body.append(el("h3", "", clip.title), el("p", "mono", meta(clip, clip.duration)), saveLink(clip));
      card.append(frame, body);
      target.append(card);
    });
  }

  const viewer = { items: [], index: 0 };

  function openViewer(items, index) {
    viewer.items = items;
    showViewer(index);
    const dialog = $("#viewer");
    if (!dialog.open) dialog.showModal();
  }

  function showViewer(index) {
    const count = viewer.items.length;
    viewer.index = (index + count) % count;
    const item = viewer.items[viewer.index];
    const image = $("#viewer-img");
    image.src = item.thumb;
    image.alt = item.title;
    const full = new Image();
    full.onload = () => { if (viewer.items[viewer.index] === item) image.src = item.href; };
    full.src = item.href;
    $("#viewer-title").textContent = item.title + (item.caption ? ` — ${item.caption}` : "");
    $("#viewer-meta").textContent = `${viewer.index + 1} / ${count}　${meta(item)}`;
    $("#viewer-save").href = item.href;
  }

  function initViewer() {
    const dialog = $("#viewer");
    $("#viewer-close").addEventListener("click", () => dialog.close());
    $("#viewer-prev").addEventListener("click", () => showViewer(viewer.index - 1));
    $("#viewer-next").addEventListener("click", () => showViewer(viewer.index + 1));
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") showViewer(viewer.index - 1);
      if (event.key === "ArrowRight") showViewer(viewer.index + 1);
    });
  }

  function imageCard(item, items, index, { kind = "", label = "" } = {}) {
    const card = el("li", "card" + (kind ? ` card--${kind}` : ""));
    const frame = el("button", "card__media");
    frame.type = "button";
    frame.setAttribute("aria-label", `${item.title} を拡大表示`);
    const image = el("img");
    image.src = item.thumb;
    image.alt = item.title;
    image.loading = "lazy";
    image.decoding = "async";
    frame.append(image);
    frame.addEventListener("click", () => openViewer(items, index));
    const body = el("div", "card__body");
    const heading = el("h3", "", item.title);
    if (label) heading.append(el("small", "", label));
    body.append(heading);
    if (item.caption) body.append(el("p", "card__caption", item.caption));
    body.append(el("p", "mono", meta(item)), saveLink(item));
    card.append(frame, body);
    return card;
  }

  function buildImages(assets) {
    const shots = assets.screenshots || [];
    shots.forEach((item, index) => $("#shot-list").append(imageCard(item, shots, index)));
    const brand = assets.brand || [];
    brand.forEach((item, index) => $("#brand-list").append(imageCard(item, brand, index, { kind: item.href.endsWith(".png") ? "alpha" : "" })));
    const people = (assets.characters || []).map((item) => {
      const profile = row(`characters.${item.id}`);
      return { ...item, title: profile?.text || item.id, caption: profile?.subtext || "", variant: item.variant };
    });
    people.forEach((item, index) => $("#chara-list").append(imageCard(item, people, index, { kind: "chara", label: item.variant })));
    if (assets.zip) {
      $$("[data-zip-size]").forEach((node) => { node.textContent = formatBytes(assets.zip.bytes); });
      ["#zip-hero", "#zip-contact"].forEach((id) => { $(id).href = assets.zip.href; });
    }
  }

  /* ---------- developer ---------- */
  function buildDeveloper(credits) {
    const coverage = list("press", "coverage");
    if (coverage.length) {
      coverage.forEach((entry) => {
        const item = el("li");
        item.append(el("b", "", entry.text), el("span", "", [entry.subtext, entry.body].filter(Boolean).join(" ")));
        $("#coverage-list").append(item);
      });
      $("#coverage-block").hidden = false;
    }
    const events = list("play", "event");
    if (events.length) {
      events.forEach((entry) => {
        const item = el("li");
        item.append(el("b", "", entry.text), el("span", "mono", entry.subtext || ""));
        $("#event-list").append(item);
      });
      $("#event-block").hidden = false;
    }
    const target = $("#credit-list");
    credits.sort(byOrder).forEach((credit) => {
      const value = el("dd");
      const name = credit.url ? el("a", "", credit.name) : el("span", "", credit.name);
      if (credit.url) {
        name.href = credit.url;
        name.target = "_blank";
        name.rel = "noopener";
      }
      value.append(name);
      if (credit.note) value.append(el("small", "", credit.note.replace(/\|/g, " / ")));
      target.append(el("dt", "", credit.sectionLabel), value);
    });
  }

  async function init() {
    initViewer();
    const [content, credits, assets] = await Promise.all([
      load("../site-content.csv").then(parseCsv),
      load("../credits.csv").then(parseCsv).catch(() => []),
      load("assets.json", "json").catch(() => ({}))
    ]);
    rows = content;
    fillText();
    buildFacts();
    buildFeatures();
    buildTrailer(assets.trailer);
    buildClips(assets.clips || []);
    buildImages(assets);
    buildDeveloper(credits);
    document.documentElement.classList.add("is-ready");
    if (location.hash) $(location.hash)?.scrollIntoView();
  }

  init().catch((error) => {
    console.error(error);
    document.documentElement.classList.add("is-ready");
  });
})();
