"use strict";

const DATA_PATHS = {
  site: "data/site.csv",
  sections: "data/sections.csv",
  cards: "data/cards.csv"
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }
  row.push(value);
  rows.push(row);
  const [headers, ...body] = rows.filter((entry) => entry.some((cell) => cell.trim() !== ""));
  if (!headers) return [];
  return body.map((entry) => Object.fromEntries(headers.map((header, index) => [header.trim(), (entry[index] || "").trim()])));
}

async function loadCsv(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return parseCsv(await response.text());
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isEnabled(entry) {
  return String(entry.enabled || "true").toLowerCase() !== "false";
}

function byOrder(a, b) {
  return (Number(a.order) || 0) - (Number(b.order) || 0);
}

function paragraphMarkup(body = "") {
  return String(body)
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => `<p>${escapeHtml(entry)}</p>`)
    .join("");
}

function hasMedia(entry) {
  return Boolean((entry.mediaType || "").trim() && (entry.mediaSrc || "").trim());
}

function mediaMarkup(entry, className = "") {
  const type = (entry.mediaType || "").toLowerCase();
  const src = entry.mediaSrc || "";
  if (!type || !src) return "";
  const alt = escapeHtml(entry.mediaAlt || entry.title || "");
  const recommended = entry.mediaRecommendedSize ? ` data-recommended-size="${escapeHtml(entry.mediaRecommendedSize)}"` : "";
  if (type === "video") {
    const poster = entry.posterSrc ? ` poster="${escapeHtml(entry.posterSrc)}"` : "";
    return `<figure class="${className || "wide-media video-frame"}"${recommended}><video muted loop playsinline preload="metadata" data-autoplay-video${poster}><source src="${escapeHtml(src)}" type="video/mp4"></video></figure>`;
  }
  return `<figure class="${className || "media-frame"}"${recommended}><img src="${escapeHtml(src)}" alt="${alt}"></figure>`;
}

function heroMedia(section) {
  const type = (section.mediaType || "").toLowerCase();
  const src = section.mediaSrc || "";
  if (type === "video" && src) {
    const poster = section.posterSrc ? ` poster="${escapeHtml(section.posterSrc)}"` : "";
    return `<video class="hero-bg" autoplay muted loop playsinline${poster}><source src="${escapeHtml(src)}" type="video/mp4"></video>`;
  }
  return `<img class="hero-bg" src="${escapeHtml(src || "media/プレイ画面（栽培初期）.jpg")}" alt="${escapeHtml(section.mediaAlt || section.title)}">`;
}

function headingMarkup(section) {
  return `<div class="section-heading"><p class="eyebrow">${escapeHtml(section.kicker)}</p><h2>${escapeHtml(section.title)}</h2>${section.subtitle ? `<p class="section-subtitle">${escapeHtml(section.subtitle)}</p>` : ""}</div>`;
}

function renderHero(section) {
  const actions = [
    section.primaryActionLabel && section.primaryActionHref ? `<a class="secondary" href="${escapeHtml(section.primaryActionHref)}">${escapeHtml(section.primaryActionLabel)}</a>` : "",
    section.secondaryActionLabel && section.secondaryActionHref ? `<a class="secondary" href="${escapeHtml(section.secondaryActionHref)}">${escapeHtml(section.secondaryActionLabel)}</a>` : ""
  ].join("");
  return `<section class="hero" aria-labelledby="hero-title" data-guide="${escapeHtml(section.guide || section.id)}" id="${escapeHtml(section.id)}">
    ${heroMedia(section)}
    <div class="hero-shade"></div>
    <div class="hero-content">
      <p class="eyebrow">${escapeHtml(section.kicker)}</p>
      <h1 id="hero-title">${escapeHtml(section.title)}</h1>
      ${section.subtitle ? `<p class="subtitle">${escapeHtml(section.subtitle)}</p>` : ""}
      <div class="hero-copy">${paragraphMarkup(section.body)}</div>
      ${actions ? `<div class="hero-actions">${actions}</div>` : ""}
    </div>
  </section>`;
}

function renderConcept(section) {
  const media = mediaMarkup(section, "concept-media");
  const layoutClass = media ? "has-media" : "text-only";
  return `<section id="${escapeHtml(section.id)}" class="band intro-band" data-guide="${escapeHtml(section.guide || section.id)}">
    ${headingMarkup(section)}
    <div class="intro-grid ${layoutClass}">
      <div class="copy-stack">${paragraphMarkup(section.body)}</div>
      ${media}
    </div>
  </section>`;
}

function renderLoop(section, cards) {
  const sectionMedia = mediaMarkup(section, "wide-media video-frame loop-media");
  return `<section id="${escapeHtml(section.id)}" class="band play-band" data-guide="${escapeHtml(section.guide || section.id)}">
    ${headingMarkup(section)}
    <div class="section-copy">${paragraphMarkup(section.body)}</div>
    ${sectionMedia}
    <div class="loop-list" aria-label="ゲームの基本サイクル">
      ${cards.map((card) => `<article><span>${escapeHtml(card.kicker)}</span><h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.body)}</p></article>`).join("")}
    </div>
  </section>`;
}

function renderFeature(section, cards) {
  const sectionMedia = mediaMarkup(section, "feature-main-media");
  const cardMarkup = sectionMedia || (cards.length ? `<div class="base-cards">${cards.map((card) => {
    const cardMedia = mediaMarkup(card, "card-media");
    return `<article class="${cardMedia ? "" : "text-card"}">${cardMedia}<span>${escapeHtml(card.kicker)}</span><strong>${escapeHtml(card.title)}</strong><p>${escapeHtml(card.body)}</p></article>`;
  }).join("")}</div>` : "");
  const layoutClass = sectionMedia ? "has-side-media" : cards.length ? "cards-only" : "text-only";
  return `<section id="${escapeHtml(section.id)}" class="band expansion-band" data-guide="${escapeHtml(section.guide || section.id)}">
    ${headingMarkup(section)}
    <div class="expansion-layout ${layoutClass}">
      <div class="expansion-copy">${paragraphMarkup(section.body)}</div>
      ${cardMarkup}
    </div>
  </section>`;
}

function renderMarkets(section, cards) {
  return `<section id="${escapeHtml(section.id)}" class="band world-band" data-guide="${escapeHtml(section.guide || section.id)}">
    ${headingMarkup(section)}
    <div class="section-copy">${paragraphMarkup(section.body)}</div>
    <div class="market-strip">
      ${cards.map((card) => `<article>${mediaMarkup(card, "market-media")}<h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.body)}</p></article>`).join("")}
    </div>
  </section>`;
}

function renderScreen(section, cards) {
  const copy = paragraphMarkup(section.body);
  const cardGrid = cards.length ? `<div class="screens-grid">
      ${cards.map((card) => {
        const recommended = card.mediaRecommendedSize ? ` data-recommended-size="${escapeHtml(card.mediaRecommendedSize)}"` : "";
        if (!hasMedia(card)) return `<article class="screen-text-card"${recommended}><span>${escapeHtml(card.kicker)}</span><strong>${escapeHtml(card.title)}</strong><p>${escapeHtml(card.body)}</p></article>`;
        return `<figure${recommended}><img src="${escapeHtml(card.mediaSrc)}" alt="${escapeHtml(card.mediaAlt || card.title)}"><figcaption>${escapeHtml(card.title)}</figcaption></figure>`;
      }).join("")}
    </div>` : "";
  return `<section id="${escapeHtml(section.id)}" class="band screens-band" data-guide="${escapeHtml(section.guide || section.id)}">
    ${headingMarkup(section)}
    <div class="screen-intro ${copy ? "" : "video-only"}">
      ${copy ? `<div class="section-copy">${copy}</div>` : ""}
      ${mediaMarkup(section, "wide-media video-frame")}
    </div>
    ${cardGrid}
  </section>`;
}

function renderScreenVideo(section) {
  return `<section id="${escapeHtml(section.id)}" class="band screens-band screen-video-band" data-guide="${escapeHtml(section.guide || section.id)}">
    ${headingMarkup(section)}
    ${mediaMarkup(section, "wide-media video-frame screen-only-media")}
  </section>`;
}

function renderSection(section, cards) {
  const scopedCards = cards.filter((card) => card.sectionId === section.id).sort(byOrder);
  if (section.layout === "hero") return renderHero(section);
  if (section.layout === "loop") return renderLoop(section, scopedCards);
  if (section.layout === "feature") return renderFeature(section, scopedCards);
  if (section.layout === "markets") return renderMarkets(section, scopedCards);
  if (section.layout === "screen_video") return renderScreenVideo(section);
  if (section.layout === "screen") return renderScreen(section, scopedCards);
  return renderConcept(section);
}

function setupRobotGuide(sections) {
  const guide = document.getElementById("robot-guide");
  const bubble = document.getElementById("robot-bubble");
  const observed = [...document.querySelectorAll("[data-guide]")];
  const messages = sections.reduce((acc, section) => {
    const comment = section.robotComment || "通信同期中です。";
    if (section.id) acc[section.id] = comment;
    if (section.guide) acc[section.guide] = comment;
    return acc;
  }, {});
  let current = "";
  let ticking = false;

  function setGuide(id) {
    if (!guide || !bubble || !messages[id] || id === current) return;
    current = id;
    bubble.textContent = messages[id];
    guide.style.setProperty("--robot-shift", `${((Object.keys(messages).indexOf(id) % 5) - 2) * 7}px`);
    guide.dataset.section = id;
    guide.classList.remove("is-talking");
    void guide.offsetWidth;
    guide.classList.add("is-talking");
  }

  function detectSection() {
    const focusY = Math.min(260, window.innerHeight * 0.32);
    let best = observed[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    observed.forEach((section) => {
      const rect = section.getBoundingClientRect();
      if (rect.bottom < focusY || rect.top > window.innerHeight) return;
      const distance = Math.abs(rect.top - focusY);
      if (distance < bestDistance) {
        best = section;
        bestDistance = distance;
      }
    });
    setGuide(best?.dataset.guide || sections[0]?.guide || "top");
  }

  function requestDetect() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      detectSection();
    });
  }

  window.addEventListener("scroll", requestDetect, { passive: true });
  window.addEventListener("resize", requestDetect);
  detectSection();
}

function setupFloatingXLink(link) {
  if (!link) return;
  const revealOffset = 140;

  function update() {
    const scroller = document.scrollingElement || document.documentElement;
    const remaining = scroller.scrollHeight - (window.scrollY + window.innerHeight);
    const isVisible = remaining <= revealOffset;
    link.classList.toggle("is-visible", isVisible);
    link.tabIndex = isVisible ? 0 : -1;
  }

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

function setupAutoplayVideos() {
  const videos = [...document.querySelectorAll("video[data-autoplay-video]")];
  if (!videos.length) return;

  videos.forEach((video) => {
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
  });

  if (!("IntersectionObserver" in window)) {
    videos.forEach((video) => video.play().catch(() => {}));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target;
      if (entry.isIntersecting) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, { threshold: 0.35 });

  videos.forEach((video) => observer.observe(video));
}

async function bootOfficialPage() {
  const [siteRows, sectionRows, cardRows] = await Promise.all([
    loadCsv(DATA_PATHS.site),
    loadCsv(DATA_PATHS.sections),
    loadCsv(DATA_PATHS.cards)
  ]);
  const site = Object.fromEntries(siteRows.map((row) => [row.key, row.value]));
  const sections = sectionRows.filter(isEnabled).sort(byOrder);
  const cards = cardRows.sort(byOrder);

  document.title = site.title || document.title;
  const description = document.querySelector('meta[name="description"]');
  if (description && site.description) description.setAttribute("content", site.description);
  document.getElementById("site-brand").textContent = site.brand || "UNDER GREEN";
  document.getElementById("site-brand-small").textContent = site.brandSmall || "Who Owns the Seeds?";
  document.getElementById("footer-name").textContent = site.footerName || site.brand || "UNDER GREEN";
  document.getElementById("footer-note").textContent = site.footerNote || "";
  const footerX = document.getElementById("footer-x");
  footerX.textContent = site.xLabel || "X";
  footerX.href = site.xUrl || "https://x.com/";
  footerX.setAttribute("aria-label", `${site.xLabel || "X"}へのリンク`);

  document.getElementById("site-nav").innerHTML = sections
    .filter((section) => section.navLabel)
    .map((section) => `<a href="#${escapeHtml(section.id)}">${escapeHtml(section.navLabel)}</a>`)
    .join("");

  document.getElementById("page-root").innerHTML = sections.map((section) => renderSection(section, cards)).join("");
  document.getElementById("page-loading")?.remove();
  setupFloatingXLink(footerX);
  setupAutoplayVideos();
  setupRobotGuide(sections);
  const scrollToHashTarget = () => {
    const hashId = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    const target = hashId ? document.getElementById(hashId) : null;
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.pageYOffset - 64;
    const scroller = document.scrollingElement || document.documentElement;
    scroller.scrollTop = Math.max(0, top);
    window.dispatchEvent(new Event("scroll"));
  };
  requestAnimationFrame(scrollToHashTarget);
  window.setTimeout(scrollToHashTarget, 80);
  window.addEventListener("hashchange", () => window.setTimeout(scrollToHashTarget, 0));
}

bootOfficialPage().catch((error) => {
  console.error(error);
  const loading = document.getElementById("page-loading");
  if (loading) loading.textContent = "OFFICIAL DATA LOAD FAILED";
});