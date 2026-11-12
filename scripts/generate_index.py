#!/usr/bin/env python3
"""构建脚本：扫描 reports/ → 转换 PDF 为页面图片 → 生成 reports.json。

- reports/ 下每个子文件夹 = 一个分类
- 每份 PDF 用 poppler(pdftoppm) 渲染为 PNG 页面图 → site_images/
  （网站只发布图片，不发布原始 PDF，浏览者拿不到源文件）
- 转换失败的 PDF 回退为直接发布原文件（site_public/），阅读页自动降级为 PDF.js
- 记录每份报告：路径、名称、分类、大小、页数、上传日期（git 最后提交时间）
"""
import json
import os
import shutil
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "reports"
IMAGES_DIR = ROOT / "site_images"
PUBLIC_DIR = ROOT / "site_public"
OUT = ROOT / "reports.json"
DPI = 120  # 渲染精度：清晰度与体积的平衡

REPO_OWNER = "overallview"
REPO_NAME = "scan-report-hub"
GISCUS_CATEGORY_ID = "DIC_kwDOVrXu3M4DK7tc"
GENERAL_TERM = "网站整体反馈"  # 首页总体反馈对应讨论帖的标题，不出现在"各报告反馈"索引里
ABACUS = "https://abacus.jasoncameron.dev"
COUNTER_NS = "scan-report-hub"  # 与 assets/config.js 的 COUNTER.namespace 保持一致


def rep_key(path: str) -> str:
    """与 assets/viewer.js 的 repKey 完全一致的 djb2 哈希（Abacus key 仅允许 ASCII）。"""
    h = 5381
    for ch in path:
        h = (((h * 33) & 0xFFFFFFFF) ^ ord(ch)) & 0xFFFFFFFF
    return "r" + format(h, "x")


def fetch_views(paths: list) -> dict:
    """并发读取各报告的阅读人次；服务不可用时返回空 dict（页面自动隐藏数字）。"""
    try:
        from concurrent.futures import ThreadPoolExecutor

        def get_one(p: str):
            try:
                req = urllib.request.Request(
                    f"{ABACUS}/get/{COUNTER_NS}/{rep_key(p)}",
                    headers={"User-Agent": "scan-report-hub-build"},
                )
                with urllib.request.urlopen(req, timeout=8) as resp:
                    return p, json.load(resp).get("value")
            except Exception:
                return p, None

        with ThreadPoolExecutor(max_workers=8) as ex:
            return dict(ex.map(get_one, paths))
    except Exception as e:
        print(f"WARN: fetch views failed: {e}")
        return {}

# 需要 LibreOffice 先转成 PDF 的办公文档格式
OFFICE_EXTS = {"doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf"}
# 浏览器能直接展示的图片格式
IMAGE_EXTS = {"png", "jpg", "jpeg", "gif", "webp", "bmp"}


def git_date(path: Path) -> str | None:
    """取文件最后一次提交时间（ISO8601），没有 git 历史时返回 None。"""
    try:
        return subprocess.run(
            ["git", "log", "-1", "--format=%cI", "--", path.as_posix()],
            cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=30,
        ).stdout.strip() or None
    except Exception:
        return None


def publish_raw(src: Path, rel: Path) -> str:
    """原样发布文件到 site_public/，返回网站相对路径（可下载的回退方案）。"""
    dest = PUBLIC_DIR / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    return dest.relative_to(ROOT).as_posix()


def convert_office(pdf_src: Path, tmp_dir: Path) -> Path | None:
    """用 LibreOffice 把办公文档转成 PDF，返回 PDF 路径；失败返回 None。"""
    tmp_dir.mkdir(parents=True, exist_ok=True)
    try:
        r = subprocess.run(
            ["soffice", "--headless", "--convert-to", "pdf",
             "--outdir", tmp_dir.as_posix(), pdf_src.as_posix()],
            capture_output=True, text=True, timeout=300,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        print(f"WARN: soffice unavailable/timeout ({e.__class__.__name__})")
        return None
    if r.returncode != 0:
        return None
    pdf = tmp_dir / (pdf_src.stem + ".pdf")
    return pdf if pdf.exists() else None


def convert_pdf(pdf: Path, out_dir: Path) -> int:
    """把 PDF 渲染成 PNG 页面图，返回页数。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    prefix = out_dir / "page"
    try:
        r = subprocess.run(
            ["pdftoppm", "-png", "-r", str(DPI), pdf.as_posix(), prefix.as_posix()],
            capture_output=True, text=True, timeout=300,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        print(f"WARN: pdftoppm unavailable/timeout ({e.__class__.__name__})")
        shutil.rmtree(out_dir, ignore_errors=True)
        return 0
    if r.returncode != 0:
        shutil.rmtree(out_dir, ignore_errors=True)
        return 0
    # pdftoppm 会按总页数补零（如 page-01.png），统一重命名为 page-1.png 风格
    files = sorted(out_dir.glob("page-*.png"))
    for idx, f in enumerate(files, 1):
        target = out_dir / f"page-{idx}.png"
        if f.name != target.name:
            f.rename(target)
    return len(files)


def fetch_discussions() -> list:
    """查询仓库 Discussions，生成"各报告反馈"索引。

    - CI 中自动注入 GITHUB_TOKEN，本地无 token 时跳过（返回空列表）
    - giscus 的 mapping=specific 会以文件路径作为讨论帖标题，据此关联到报告
    """
    token = os.environ.get("GH_TOKEN", "")
    if not token:
        return []
    query = """
    query($owner:String!, $name:String!, $catID:ID!) {
      repository(owner:$owner, name:$name) {
        discussions(first:100, categoryId:$catID) {
          nodes { title url comments(first:1){ totalCount } }
        }
      }
    }"""
    body = {"query": query,
            "variables": {"owner": REPO_OWNER, "name": REPO_NAME, "catID": GISCUS_CATEGORY_ID}}
    req = urllib.request.Request(
        "https://api.github.com/graphql",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"bearer {token}",
                 "Content-Type": "application/json",
                 "User-Agent": "scan-report-hub-build"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.load(resp)
        nodes = ((payload.get("data") or {}).get("repository") or {}
                 ).get("discussions", {}).get("nodes") or []
    except Exception as e:
        print(f"WARN: fetch discussions failed: {e}")
        return []
    out = []
    for n in nodes:
        title = n.get("title", "")
        if title == GENERAL_TERM:
            continue  # 总体反馈帖单独由首页嵌入展示，不进索引
        try:
            out.append({"path": title,
                        "url": n.get("url", ""),
                        "count": n["comments"]["totalCount"]})
        except (KeyError, TypeError):
            continue
    return out


def main() -> int:
    reports = []
    stats = {"images": 0, "fallback": 0}

    if REPORTS_DIR.is_dir():
        if IMAGES_DIR.exists():
            shutil.rmtree(IMAGES_DIR)
        if PUBLIC_DIR.exists():
            shutil.rmtree(PUBLIC_DIR)

        for p in sorted(REPORTS_DIR.rglob("*")):
            if not p.is_file() or p.name.startswith("."):
                continue
            rel = p.relative_to(REPORTS_DIR)
            category = rel.parts[0] if len(rel.parts) > 1 else "未分类"
            entry = {
                "path": p.relative_to(ROOT).as_posix(),
                "name": p.name,
                "category": category,
                "ext": p.suffix.lstrip(".").lower() or "file",
                "size": p.stat().st_size,
                "date": git_date(p),
                "pages": 0,
            }

            if entry["ext"] == "pdf":
                image_dir = IMAGES_DIR / rel.with_suffix("")
                pages = convert_pdf(p, image_dir)
                if pages > 0:
                    entry["pages"] = pages
                    stats["images"] += 1
                else:  # 转换失败 → 原样发布，阅读页降级用 PDF.js 打开
                    entry["public_path"] = publish_raw(p, rel)
                    stats["fallback"] += 1
                    print(f"WARN: pdftoppm failed for {p.name}, publishing raw file")
            elif entry["ext"] in OFFICE_EXTS:
                # 办公文档：LibreOffice 转 PDF → 再转逐页图片
                image_dir = IMAGES_DIR / rel.with_suffix("")
                tmp_dir = ROOT / ".office_tmp" / rel.with_suffix("").as_posix().replace("/", "_")
                pdf_tmp = convert_office(p, tmp_dir)
                if pdf_tmp:
                    pages = convert_pdf(pdf_tmp, image_dir)
                    if pages > 0:
                        entry["pages"] = pages
                        stats["images"] += 1
                shutil.rmtree(tmp_dir.parent if tmp_dir.parent.name == ".office_tmp" else tmp_dir, ignore_errors=True)
                if not entry["pages"]:
                    entry["public_path"] = publish_raw(p, rel)
                    stats["fallback"] += 1
                    print(f"WARN: office conversion failed for {p.name}, publishing raw file")
            else:
                # 图片 / 文本 / 其他格式：原样发布（图片在阅读页内嵌展示，其余新标签页打开）
                entry["public_path"] = publish_raw(p, rel)
                if entry["ext"] in IMAGE_EXTS:
                    stats["images"] += 1

            reports.append(entry)

    reports.sort(key=lambda r: r.get("date") or "", reverse=True)
    categories = {}
    for r in reports:
        categories[r["category"]] = categories.get(r["category"], 0) + 1

    # 各报告的反馈索引（只保留仍存在的报告对应的讨论帖）
    known_paths = {r["path"] for r in reports}
    discussions = [d for d in fetch_discussions() if d["path"] in known_paths]

    # 各报告的阅读人次（首页列表展示，构建时快照）
    views = fetch_views(sorted(known_paths))
    for r in reports:
        if views.get(r["path"]) is not None:
            r["views"] = views[r["path"]]

    data = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "categories": sorted(categories),
        "discussions": discussions,
        "reports": reports,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {len(reports)} reports ({stats['images']} as images, {stats['fallback']} fallback), "
          f"{len(categories)} categories -> {OUT.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
