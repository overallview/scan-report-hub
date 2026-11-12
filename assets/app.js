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
  } catch (e) {
    $("#grid").innerHTML = `<div class="empty"><div class="big">⚠️</div><p>reports.json 加载失败，请确认已通过 GitHub Actions 部署</p></div>`;
  }

  $("#search").addEventListener("input", (ev) => {
    keyword = ev.target.value.trim().toLowerCase();
    applyFilter();
  });
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

function renderGrid(list) {
  const grid = $("#grid");
  $("#empty").hidden = list.length > 0;
  grid.innerHTML = list
    .map(
      (r) => `
    <a class="card" href="report.html?f=${encodeURIComponent(r.path)}">
      <span class="cat" style="background:${catColor(r.category)}">${r.category}</span>
      <h3>${r.name}</h3>
      <div class="meta">
        <span>📅 ${fmtDate(r.date)}</span>
        ${r.size != null ? `<span>📦 ${fmtSize(r.size)}</span>` : ""}
        <span>📄 ${r.ext.toUpperCase()}</span>
      </div>
      <span class="go">在线阅读 →</span>
    </a>`
    )
    .join("");
}

init();
