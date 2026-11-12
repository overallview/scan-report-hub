// ===== 报告阅读页 =====
// 首选模式：展示部署时渲染好的页面图片（site_images/）—— 任何浏览器都能显示
// 降级模式：图片缺失时用 PDF.js 直接渲染（site_public/ 里的回退文件）
// 通用措施：禁右键 / 禁 Ctrl+S·P / 禁打印 / 每页水印（防君子不防小人，详见 README）
const $ = (s, el = document) => el.querySelector(s);

/* ---------- 1. 解析并校验参数（防止路径穿越） ---------- */
const params = new URLSearchParams(location.search);
let file = (params.get("f") || "").replace(/\\/g, "/").replace(/^\/+/, "");
if (!/^reports\/[^/].*/.test(file) || file.includes("..")) {
  location.replace("index.html");
  throw new Error("bad file param");
}

/* ---------- 2. 全局防下载措施 ---------- */
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && ["p", "s"].includes(e.key.toLowerCase())) e.preventDefault();
});

// 水印背景（SVG 平铺）
const WM_TEXT = `${SITE.owner} · 仅供在线浏览`;
const wmSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="150">
  <text x="14" y="80" transform="rotate(-24 130 75)" font-size="15"
        font-family="sans-serif" fill="#64748b">${WM_TEXT}</text></svg>`;
const wmUrl = `url("data:image/svg+xml,${encodeURIComponent(wmSvg)}")`;
function makeWatermark(w) {
  const div = document.createElement("div");
  div.className = "wm";
  div.style.backgroundImage = wmUrl;
  div.style.backgroundSize = `${Math.max(180, w * 0.28)}px auto`;
  return div;
}

/* ---------- 2b. 访问计数（Abacus；失败静默） ---------- */
const ABACUS = "https://abacus.jasoncameron.dev";
function repKey(p) {
  let h = 5381;
  for (const ch of p) h = ((((h * 33) & 0xffffffff) ^ ch.codePointAt(0)) >>> 0);
  return "r" + h.toString(16);
}
function countVisit() {
  // 本报告阅读人次（首页列表显示的数字在下次构建时同步）
  fetch(`${ABACUS}/hit/${COUNTER.namespace}/${repKey(file)}`)
    .then((r) => r.json())
    .then((d) => {
      if (typeof d.value !== "number") return;
      const el = document.getElementById("view-count");
      if (el) el.textContent = `👁 ${d.value}`;
    })
    .catch(() => {});
}
countVisit();

/* ---------- 3. 元数据与模式分发 ---------- */
const pagesBox = $("#pages");
const viewer = $("#viewer");
const pageInd = $("#page-ind");
let META = null;
let zoom = 1;
let mode = null;          // "images" | "pdf" | "image" | "link"
let pdfDoc = null;        // pdf 模式专用
let pageW = 612, pageH = 792;
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);

fetch("reports.json", { cache: "no-store" })
  .then((r) => r.json())
  .then((d) => { META = (d.reports || []).find((x) => x.path === file) || null; boot(); })
  .catch(() => boot());

function boot() {
  updateTitle();
  const ext = META ? META.ext : (file.match(/\.([^.]+)$/)?.[1] || "").toLowerCase();
  if (META && META.pages > 0) {
    mode = "images";
    renderImages();
  } else if (ext === "pdf") {
    mode = "pdf";
    renderWithPdfJs();
  } else if (IMAGE_EXTS.has(ext)) {
    mode = "image";
    renderSingleImage();
  } else {
    mode = "link";
    renderLinkCard();
  }
}

function updateTitle() {
  const name = META ? META.name : decodeURIComponent(file.split("/").pop());
  const cat = META ? `【${META.category}】` : "";
  document.title = `${cat}${name} · ${SITE.title}`;
  $("#r-title").textContent = `${cat}${name}`;
}

/* ---------- 4. 页码指示器（滚动事件驱动，不依赖 IntersectionObserver） ---------- */
function setupScrollIndicator() {
  let ticking = false;
  function update() {
    ticking = false;
    const sheets = pagesBox.children;
    if (!sheets.length) return;
    const mid = window.innerHeight / 2;
    let current = 1;
    for (let i = 0; i < sheets.length; i++) {
      const r = sheets[i].getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) { current = i + 1; break; }
      if (r.top > mid) { current = Math.max(1, i); break; }
      current = i + 1;
    }
    pageInd.textContent = `${current} / ${sheets.length}`;
  }
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; setTimeout(update, 120); }
  }, { passive: true });
  update();
}

function setZoom(v) {
  zoom = Math.min(3, Math.max(0.5, v));
  if (mode === "images") {
    pagesBox.style.width = zoom * 100 + "%";
  } else if (mode === "pdf") {
    clearTimeout(setZoom._t);
    setZoom._t = setTimeout(layoutPdf, 120);
  }
}
$("#zoom-in").addEventListener("click", () => setZoom(zoom + 0.2));
$("#zoom-out").addEventListener("click", () => setZoom(zoom - 0.2));
$("#zoom-fit").addEventListener("click", () => setZoom(1));

/* ---------- 5. 模式一：页面图片（部署时已由 poppler 渲染） ---------- */
function renderImages() {
  const loading = $("#loading");
  if (loading) loading.remove();

  const dir = "site_images/" + META.path.replace(/^reports\//, "").replace(/\.pdf$/i, "");
  for (let i = 1; i <= META.pages; i++) {
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.dataset.page = i;
    const img = document.createElement("img");
    img.src = `${encodeURI(dir)}/page-${i}.png`;   // 直接加载（兼容性优先）
    img.draggable = false;
    img.alt = `第 ${i} 页`;
    img.onerror = () => { sheet.innerHTML = `<div class="img-err">⚠️ 第 ${i} 页图片缺失</div>`; };
    sheet.append(img, makeWatermark(viewer.clientWidth));
    pagesBox.append(sheet);
  }
  setupScrollIndicator();
}

/* ---------- 5b. 模式三：单张图片（jpg/png 等原样发布、内嵌展示） ---------- */
function renderSingleImage() {
  const loading = $("#loading");
  if (loading) loading.remove();
  const src = (META && META.public_path) || file;
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.dataset.page = 1;
  const img = document.createElement("img");
  img.src = encodeURI(src);
  img.draggable = false;
  img.alt = "图片预览";
  img.onerror = () => { sheet.innerHTML = `<div class="img-err">⚠️ 图片加载失败</div>`; };
  sheet.append(img, makeWatermark(viewer.clientWidth));
  pagesBox.append(sheet);
  setupScrollIndicator();
}

/* ---------- 6. 模式二：PDF.js 回退（仅转换失败的报告会走到这里） ---------- */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.7.570/pdf.worker.min.js";

function baseScale() {
  return (viewer.clientWidth - 32) / pageW;
}

async function renderPdfPage(n, holder, vw, dpr) {
  const page = await pdfDoc.getPage(n);
  const viewport = page.getViewport({ scale: vw });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(vw * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = "100%";
  holder.style.height = viewport.height + "px";
  const opts = { canvasContext: canvas.getContext("2d"), viewport };
  if (dpr !== 1) opts.transform = [dpr, 0, 0, dpr, 0, 0];
  await page.render(opts).promise;
  holder.replaceChildren(canvas, makeWatermark(vw));
}

function layoutPdf() {
  const vw = baseScale() * zoom;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  pagesBox.replaceChildren();
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const holder = document.createElement("div");
    holder.className = "sheet";
    holder.dataset.page = i;
    holder.style.height = Math.round(vw * pageH / pageW) + "px";
    pagesBox.append(holder);
    renderPdfPage(i, holder, vw, dpr).catch((e) => {
      holder.innerHTML = `<div class="img-err">⚠️ 第 ${i} 页渲染失败：${e.message || e}</div>`;
    });
  }
  setupScrollIndicator();
}

function renderWithPdfJs() {
  const pdfPath = (META && META.public_path) || file;
  pdfjsLib.getDocument({ url: encodeURI(pdfPath) }).promise.then(async (doc) => {
    pdfDoc = doc;
    const p1 = await pdfDoc.getPage(1);
    const vp1 = p1.getViewport({ scale: 1 });
    pageW = vp1.width;
    pageH = vp1.height;
    const loading = $("#loading");
    if (loading) loading.remove();
    layoutPdf();
  }).catch((err) => {
    let box = document.getElementById("loading") || document.getElementById("load-error");
    if (!box) {
      box = document.createElement("div");
      viewer.append(box);
    }
    box.id = "load-error";
    box.innerHTML = `⚠️ 报告加载失败（${err.message || err}）<br><a href="index.html">返回首页</a>`;
  });
}

/* ---------- 7. 非 PDF 文件：提供在线打开入口 ---------- */
function renderLinkCard() {
  const loading = $("#loading");
  if (loading) loading.remove();
  const src = (META && META.public_path) || file;
  pagesBox.innerHTML = `
    <div class="sheet" style="padding:40px;text-align:center;">
      <div style="font-size:40px;">📎</div>
      <p>该文件类型（${(META && META.ext) || "file"}）不支持内嵌阅读</p>
      <p><a href="${encodeURI(src)}" target="_blank" rel="noopener">在新标签页打开</a></p>
    </div>`;
}

/* ---------- 8. giscus 评论（GitHub Discussions） ---------- */
(function mountGiscus() {
  if (!GISCUS.repoId || GISCUS.repoId.startsWith("__")) return;
  const s = document.createElement("script");
  s.src = "https://giscus.app/client.js";
  s.setAttribute("data-repo", GISCUS.repo);
  s.setAttribute("data-repo-id", GISCUS.repoId);
  s.setAttribute("data-category", GISCUS.category);
  s.setAttribute("data-category-id", GISCUS.categoryId);
  s.setAttribute("data-mapping", "specific");   // 每份报告一个独立讨论帖
  s.setAttribute("data-term", file);
  s.setAttribute("data-strict", "1");
  s.setAttribute("data-reactions-enabled", "1");
  s.setAttribute("data-emit-metadata", "0");
  s.setAttribute("data-input-position", "top");
  s.setAttribute("data-theme", "light");
  s.setAttribute("data-lang", "zh-CN");
  s.setAttribute("data-loading", "lazy");
  s.crossOrigin = "anonymous";
  s.async = true;
  $("#giscus").append(s);
})();
