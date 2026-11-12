#!/usr/bin/env python3
"""构建脚本：扫描 reports/ → 转换 PDF 为页面图片 → 生成 reports.json。

- reports/ 下每个子文件夹 = 一个分类
- 每份 PDF 用 poppler(pdftoppm) 渲染为 PNG 页面图 → site_images/
  （网站只发布图片，不发布原始 PDF，浏览者拿不到源文件）
- 转换失败的 PDF 回退为直接发布原文件（site_public/），阅读页自动降级为 PDF.js
- 记录每份报告：路径、名称、分类、大小、页数、上传日期（git 最后提交时间）
"""
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "reports"
IMAGES_DIR = ROOT / "site_images"
PUBLIC_DIR = ROOT / "site_public"
OUT = ROOT / "reports.json"
DPI = 120  # 渲染精度：清晰度与体积的平衡


def git_date(path: Path) -> str | None:
    """取文件最后一次提交时间（ISO8601），没有 git 历史时返回 None。"""
    try:
        return subprocess.run(
            ["git", "log", "-1", "--format=%cI", "--", path.as_posix()],
            cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=30,
        ).stdout.strip() or None
    except Exception:
        return None


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
                    dest = PUBLIC_DIR / rel
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(p, dest)
                    entry["public_path"] = dest.relative_to(ROOT).as_posix()
                    stats["fallback"] += 1
                    print(f"WARN: pdftoppm failed for {p.name}, publishing raw file")

            reports.append(entry)

    reports.sort(key=lambda r: r.get("date") or "", reverse=True)
    categories = {}
    for r in reports:
        categories[r["category"]] = categories.get(r["category"], 0) + 1

    data = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "categories": sorted(categories),
        "reports": reports,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {len(reports)} reports ({stats['images']} as images, {stats['fallback']} fallback), "
          f"{len(categories)} categories -> {OUT.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
