# 安全扫描报告库 · Scan Report Hub

一个纯 GitHub 方案的报告展示站：**按分类展示扫描报告 + 在线浏览（防下载）+ 基于 GitHub Discussions 的点评反馈**。

**在线地址**：https://overallview.github.io/scan-report-hub/

---

## 功能一览

| 功能 | 实现方式 |
|---|---|
| 📂 按分类展示 | `reports/` 下每个文件夹 = 一个分类，推送后自动生成索引、自动部署 |
| 📄 在线浏览 | 部署时自动把 PDF 逐页渲染成图片，网页只展示图片（任何浏览器可看）；禁右键、禁 Ctrl+S/P、禁打印、每页水印 |
| 💬 点评反馈 | giscus（GitHub Discussions），每份报告一个独立讨论帖，站长可直接回复 |
| 🔍 搜索/筛选 | 首页支持按名称搜索、按分类筛选 |

## 如何上传报告（三种方式任选）

### 方式一：网页拖拽（零工具，随时随地）
1. 打开本仓库的 GitHub 页面 → 进入 `reports/<分类>/` 文件夹（没有该分类就先随便进一个目录，在文件名框里手输 `reports/新分类/文件名.pdf`）
2. 点 **Add file → Upload files**，把 PDF 拖进去 → Commit
3. 约 1-2 分钟后网站自动更新

### 方式二：本地一键脚本（推荐，最快）
```powershell
# 在本仓库目录下
.\upload.ps1 web安全 D:\报告\某站点漏扫.pdf
.\upload.ps1 主机渗透 D:\logs\a.pdf D:\logs\b.pdf   # 可一次传多个
```
分类不存在会自动创建。配套的 `upload.cmd` 供 cmd 环境调用。

### 方式三：交给 AI 助手
在 ZCode 里说"把 xx 报告传到 xx 分类"，助手直接帮你推送。

## 如何点评与互动

- 评论由 [giscus](https://giscus.app/zh) 驱动，数据存在本仓库的 **Discussions** 里
- **站长回复**：打开仓库的 Discussions 标签页，找到对应报告的帖子直接回复即可（评论会实时出现在网站对应报告下方）
- 首次使用需在浏览器里给仓库安装 giscus App：https://github.com/apps/giscus （装一次即可）

## 关于"防下载"的诚实说明

已做到：**原始 PDF 不发布到网站**——部署时自动转成逐页图片，网站上不存在可下载的 PDF 文件；同时禁右键、禁 Ctrl+S/Ctrl+P、拦截打印、全页水印、阅读页禁止搜索引擎收录。

**但请注意**：访客仍可截图或保存页面图片。"完全禁止复制内容"在公开网站上技术上不可能实现。如某份报告确需保密，请勿上传到本仓库（可以放私有仓库或改用带登录的平台）。

## 自定义

- 改站名/简介：编辑 `assets/config.js`
- 新增分类：建一个文件夹（或直接 `.\upload.ps1 新分类 文件`），自动生效
- 改样式：`assets/style.css`

## 技术结构

```
├── index.html            首页（分类 + 搜索 + 卡片）
├── report.html           阅读页（页面图片 / PDF.js 回退 + 水印 + giscus）
├── assets/               样式与脚本（config.js 为站点配置）
├── reports/              报告库：子文件夹 = 分类（原始 PDF，仅存仓库不发布）
├── scripts/generate_index.py   PDF 转图片 + 生成 reports.json
├── upload.ps1 / upload.cmd    本地一键上传
└── .github/workflows/deploy.yml  推送后自动构建（poppler 渲染）并部署 Pages
```
