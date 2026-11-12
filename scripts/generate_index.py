#!/usr/bin/env python3
"""扫描 reports/ 目录，生成 reports.json（首页数据源）。

- reports/ 下的每个子文件夹 = 一个分类
- 每份报告记录：路径、名称、分类、大小、上传日期（取 git 最后一次提交时间）
- GitHub Actions 每次推送后会自动运行本脚本
"""
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "reports"
OUT = ROOT / "reports.json"


def git_date(path: Path) -> str | None:
    """取文件最后一次提交时间（ISO8601），没有 git 历史时返回 None。"""
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cI", "--", path.as_posix()],
            cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
            timeout=30,
        ).stdout.strip()
        return out or None
    except Exception:
        return None


def main() -> int:
    reports = []
    if REPORTS_DIR.is_dir():
        for p in sorted(REPORTS_DIR.rglob("*")):
            if not p.is_file() or p.name.startswith("."):
                continue
            rel = p.relative_to(REPORTS_DIR)
            category = rel.parts[0] if len(rel.parts) > 1 else "未分类"
            reports.append({
                "path": p.relative_to(ROOT).as_posix(),
                "name": p.name,
                "category": category,
                "ext": p.suffix.lstrip(".").lower() or "file",
                "size": p.stat().st_size,
                "date": git_date(p),
            })

    # 按上传日期倒序（无日期的排最后）
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
    print(f"OK: {len(reports)} reports, {len(categories)} categories -> {OUT.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
