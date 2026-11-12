// ===== 首页逻辑：拉取 reports.json，按分类渲染报告卡片 =====
const $ = (s, el = document) => el.querySelector(s);

let ALL = [];            // 全部报告
let activeCat = "全部";   // 当前选中的分类
let keyword = "";        // 搜索关键词

// 分类徽章配色（按分类名哈希取色，稳定且好看）
const CAT_COLORS = ["#2563eb", "#7c3aed", "#0d9488", "#d97706", "#dc2626", "#0284c7", "#4f46e5", "#059669"];
function catColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return CAT_COLORS[h % CAT_COLORS.length];
}

function fmtSize(b) {
  if (b == null) return "";
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / 1024 / 1024).toFixed(1) + " MB";
}
function fmtDate(iso) {
  return iso ? iso.slice(0, 10) : "—";
}

async function init() {
  document.title = SITE.title;
  $("#site-title").textContent = SITE.title;
  $("#site-sub").textContent = SITE.subtitle;
  $("#site-desc").textContent = SITE.description || "";

  try {
    const res = await fetch("reports.json", { cache: "no-store" });
    const data = await res.json();
    ALL = data.reports || [];
    renderStats(data);
    renderChips(data);
    applyFilter();
    renderFeedback(data);
  } catch (e) {
    $("#grid").innerHTML = `<div class="empty"><div class="big">⚠️</div><p>reports.json 加载失败，请确认已通过 GitHub Actions 部署</p></div>`;
  }

  $("#search").addEventListener("input", (ev) => {
    keyword = ev.target.value.trim().toLowerCase();
    applyFilter();
  });

  countSiteVisit();
  mountGiscusHome();
}

/* ===== 访问计数（Abacus 公共计数服务；失败时自动隐藏，不影响页面） ===== */
const ABACUS = "https://abacus.jasoncameron.dev";
function repKey(p) {
  let h = 5381;
  for (const ch of p) h = ((((h * 33) & 0xffffffff) ^ ch.codePointAt(0)) >>> 0);
  return "r" + h.toString(16);
}
function countSiteVisit() {
  fetch(`${ABACUS}/hit/${COUNTER.namespace}/site-total`)
    .then((r) => r.json())
    .then((d) => {
      if (typeof d.value !== "number") return;
      const el = $("#stat-views");
      el.hidden = false;
      el.querySelector("b").textContent = d.value.toLocaleString();
    })
    .catch(() => { /* 计数服务不可用就静默隐藏 */ });
}

/* ===== 首页反馈区：各报告反馈一览 + 总体反馈评论 ===== */
function renderFeedback(data) {
  const box = $("#disc-index");
  const discs = data.discussions || [];
  if (!discs.length) {
    box.innerHTML = `<p class="no-disc">各报告收到的点评会在这里列出（当前还没有反馈记录）。</p>`;
  } else {
    const nameOf = Object.fromEntries(ALL.map((r) => [r.path, r.name]));
    box.innerHTML = discs
      .map(
        (d) => `
      <div class="disc-row">
        <span class="disc-name">📄 ${nameOf[d.path] || d.path}</span>
        <span class="disc-count">${d.count} 条</span>
        <a href="${d.url}" target="_blank" rel="noopener">查看反馈 →</a>
      </div>`
      )
      .join("");
  }
  const link = $("#gh-disc-link");
  link.href = `https://github.com/${SITE.owner}/${SITE.repo}/discussions`;
}

function mountGiscusHome() {
  if (!GISCUS.repoId || GISCUS.repoId.startsWith("__")) return;
  const s = document.createElement("script");
  s.src = "https://giscus.app/client.js";
  s.setAttribute("data-repo", GISCUS.repo);
  s.setAttribute("data-repo-id", GISCUS.repoId);
  s.setAttribute("data-category", GISCUS.category);
  s.setAttribute("data-category-id", GISCUS.categoryId);
  s.setAttribute("data-mapping", "specific");
  s.setAttribute("data-term", "网站整体反馈");   // 首页总体反馈的固定讨论帖
  s.setAttribute("data-strict", "1");
  s.setAttribute("data-reactions-enabled", "1");
  s.setAttribute("data-emit-metadata", "0");
  s.setAttribute("data-input-position", "top");
  s.setAttribute("data-theme", "light");
  s.setAttribute("data-lang", "zh-CN");
  s.setAttribute("data-loading", "lazy");
  s.crossOrigin = "anonymous";
  s.async = true;
  $("#giscus-home").append(s);
}

function renderStats(data) {
  const cats = (data.categories || []).length;
  const latest = ALL.reduce((m, r) => (r.date && r.date > m ? r.date : m), "") || "";
  $("#stats").innerHTML = `
    <span class="stat"><b>${ALL.length}</b>份报告</span>
    <span class="stat"><b>${cats}</b>个分类</span>
    ${latest ? `<span class="stat">最近更新 <b>${fmtDate(latest)}</b></span>` : ""}
  `;
}

function renderChips(data) {
  const counts = {};
  for (const r of ALL) counts[r.category] = (counts[r.category] || 0) + 1;
  const chips = ["全部", ...Object.keys(counts)];
  $("#chips").innerHTML = chips
    .map((c) => `<button class="chip${c === activeCat ? " active" : ""}" data-cat="${c}">${c}<span class="n">${c === "全部" ? ALL.length : counts[c]}</span></button>`)
    .join("");
  $("#chips").querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCat = btn.dataset.cat;
      $("#chips").querySelectorAll(".chip").forEach((b) => b.classList.toggle("active", b === btn));
      applyFilter();
    });
  });
}

function applyFilter() {
  const list = ALL.filter((r) => {
    const okCat = activeCat === "全部" || r.category === activeCat;
    const okKey = !keyword || r.name.toLowerCase().includes(keyword) || r.category.toLowerCase().includes(keyword);
    return okCat && okKey;
  });
  renderGrid(list);
}

/* ===== 分类 / 报告顺序（可在 config.js 的 DISPLAY 里自定义） ===== */
function orderedCategories() {
  const present = [...new Set(ALL.map((r) => r.category))];
  const pinned = DISPLAY.categoryOrder.filter((c) => present.includes(c));
  const rest = present
    .filter((c) => !DISPLAY.categoryOrder.includes(c))
    .sort();   // 默认按编码排序（与后端一致），精确顺序请在 categoryOrder 里指定
  return [...pinned, ...rest];
}

function orderedReports(cat, list) {
  const order = (DISPLAY.reportOrder && DISPLAY.reportOrder[cat]) || [];
  const pinned = [];
  const seen = new Set();
  for (const name of order) {
    const hit = list.find((r) => r.name === name);
    if (hit && !seen.has(hit)) { pinned.push(hit); seen.add(hit); }
  }
  const rest = list.filter((r) => !seen.has(r));   // json 内已按日期新→旧
  return [...pinned, ...rest];
}

/* ===== 列表模式：按分类分组，每份报告一行 ===== */
function renderGrid(list) {
  const grid = $("#grid");
  $("#empty").hidden = list.length > 0;
  grid.innerHTML = orderedCategories()
    .map((cat) => {
      const items = orderedReports(cat, list.filter((r) => r.category === cat));
      if (!items.length) return "";
      return `
      <section class="cat-group">
        <h2 class="cat-head">${cat}<span class="cat-n">${items.length} 份报告</span></h2>
        <ul class="rep-list">
          ${items
            .map(
              (r) => `
          <li class="rep-row">
            <a class="rep-name" href="report.html?f=${encodeURIComponent(r.path)}" title="${r.name}">📄 ${r.name}</a>
            <span class="rep-meta">
              <span>📅 ${fmtDate(r.date)}</span>
              ${r.size != null ? `<span>📦 ${fmtSize(r.size)}</span>` : ""}
              ${r.views != null ? `<span title="截至上次构建的阅读人次">👁 ${r.views}</span>` : ""}
            </span>
            <a class="rep-go" href="report.html?f=${encodeURIComponent(r.path)}">阅读 →</a>
          </li>`
            )
            .join("")}
        </ul>
      </section>`;
    })
    .join("");
}

init();
