// ===== 报告阅读页：PDF.js 在线渲染 + 防下载措施 + giscus 评论 =====
const $ = (s, el = document) => el.querySelector(s);

/* ---------- 1. 解析并校验参数（防止路径穿越） ---------- */
const params = new URLSearchParams(location.search);
let file = (params.get("f") || "").replace(/\\/g, "/").replace(/^\/+/, "");
if (!/^reports\/[^/].*/.test(file) || file.includes("..")) {
  location.replace("index.html");
  throw new Error("bad file param");
}

/* ---------- 2. 防下载措施（防君子不防小人，详见 README） ---------- */
document.addEventListener("contextmenu", (e) => e.preventDefault());          // 屏蔽右键
document.addEventListener("keydown", (e) => {                                  // 屏蔽 Ctrl+P / Ctrl+S / F12 常用导出
  if ((e.ctrlKey || e.metaKey) && ["p", "s"].includes(e.key.toLowerCase())) e.preventDefault();
});

// 水印背景（SVG 平铺）：标注来源，震慑截图外传
const WM_TEXT = `${SITE.owner} · 仅供在线浏览`;
const wmSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="150">
  <text x="14" y="80" transform="rotate(-24 130 75)" font-size="15"
        font-family="sans-serif" fill="#64748b">${WM_TEXT}</text></svg>`;
const wmUrl = `url("data:image/svg+xml,${encodeURIComponent(wmSvg)}")`;

/* ---------- 3. 拉取元数据（标题 / 分类 / 日期） ---------- */
let META = null;
fetch("reports.json", { cache: "no-store" })
  .then((r) => r.json())
  .then((d) => { META = (d.reports || []).find((x) => x.path === file) || null; updateTitle(); })
  .catch(() => updateTitle());

function updateTitle() {
  const name = META ? META.name : decodeURIComponent(file.split("/").pop());
  const cat = META ? `【${META.category}】` : "";
  document.title = `${cat}${name} · ${SITE.title}`;
  $("#r-title").textContent = `${cat}${name}`;
}

/* ---------- 4. PDF.js 渲染 ---------- */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const pagesBox = $("#pages");
const viewer = $("#viewer");
let pdfDoc = null;
let zoom = 1;                 // 相对"适应宽度"的倍率
let pageW = 612, pageH = 792; // 第 1 页实际尺寸（加载后更新，用于占位与适配）
const rendered = new Map();   // pageNo -> canvas

function baseScale() {
  return (viewer.clientWidth - 32) / pageW;
}

function makeWatermark(w) {
  const div = document.createElement("div");
  div.className = "wm";
  div.style.backgroundImage = wmUrl;
  div.style.backgroundSize = `${Math.max(180, w * 0.28)}px auto`;
  return div;
}

async function renderPage(n, holder, vw, dpr) {
  const page = await pdfDoc.getPage(n);
  const viewport = page.getViewport({ scale: vw });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(vw * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = "100%";
  holder.style.height = viewport.height + "px";
  await page.render({ canvasContext: canvas.getContext("2d"), viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
  holder.replaceChildren(canvas, makeWatermark(vw));
  rendered.set(n, holder);
}

function layout() {
  const vw = baseScale() * zoom;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  pagesBox.replaceChildren();
  rendered.clear();
  const io = new IntersectionObserver(
    (ents) => ents.forEach((en) => {
      const n = +en.target.dataset.page;
      if (en.isIntersecting) {
        if (!rendered.has(n)) renderPage(n, en.target, vw, dpr);
        if (en.intersectionRatio > 0.5) {
          $("#page-ind").textContent = `${n} / ${pdfDoc.numPages}`;
        }
      }
    }),
    { root: null, rootMargin: "600px 0px", threshold: [0, 0.5] }
  );
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const holder = document.createElement("div");
    holder.className = "sheet";
    holder.dataset.page = i;
    holder.style.height = Math.round(vw * pageH / pageW) + "px"; // 按第 1 页比例占位
    pagesBox.append(holder);
    io.observe(holder);
  }
}

pdfjsLib
  .getDocument({ url: encodeURI(file) })
  .promise.then(async (doc) => {
    pdfDoc = doc;
    const p1 = await pdfDoc.getPage(1);
    const vp1 = p1.getViewport({ scale: 1 });
    pageW = vp1.width;
    pageH = vp1.height;
    $("#loading").remove();
    layout();
  })
  .catch((err) => {
    let box = document.getElementById("loading") || document.getElementById("load-error");
    if (!box) {
      box = document.createElement("div");
      viewer.append(box);
    }
    box.id = "load-error";
    box.innerHTML = `⚠️ 报告加载失败（${err.message || err}）<br><a href="index.html">返回首页</a>`;
  });

/* 缩放按钮：重排全部页面（懒渲染会自动补） */
let zoomTimer = null;
function setZoom(v) {
  zoom = Math.min(3, Math.max(0.5, v));
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(layout, 120);
}
$("#zoom-in").addEventListener("click", () => setZoom(zoom + 0.2));
$("#zoom-out").addEventListener("click", () => setZoom(zoom - 0.2));
$("#zoom-fit").addEventListener("click", () => setZoom(1));

let rsTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(rsTimer);
  rsTimer = setTimeout(layout, 200);
});

/* ---------- 5. giscus 评论（GitHub Discussions） ---------- */
function mountGiscus() {
  if (!GISCUS.repoId || GISCUS.repoId.startsWith("__")) return; // 未配置时跳过
  const s = document.createElement("script");
  s.src = "https://giscus.app/client.js";
  s.setAttribute("data-repo", GISCUS.repo);
  s.setAttribute("data-repo-id", GISCUS.repoId);
  s.setAttribute("data-category", GISCUS.category);
  s.setAttribute("data-category-id", GISCUS.categoryId);
  s.setAttribute("data-mapping", "specific");   // 每份报告一个独立讨论帖（按路径定位）
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
}
mountGiscus();
