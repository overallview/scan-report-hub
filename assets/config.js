// ===== 站点配置：想改名、改简介，改这里即可 =====
const SITE = {
  title: "安全扫描报告库",
  subtitle: "Scan Report Hub",
  description: "在线浏览安全扫描报告 · 按分类管理 · 支持点评与反馈",
  owner: "overallview",
  repo: "scan-report-hub",
};

// ===== giscus 评论系统（基于 GitHub Discussions）=====
// repoId / categoryId 由部署脚本自动填入，请勿手改
const GISCUS = {
  repo: "overallview/scan-report-hub",
  repoId: "__REPO_ID__",
  category: "Announcements",
  categoryId: "__CATEGORY_ID__",
};
