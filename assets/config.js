// ===== 站点配置：想改名、改简介，改这里即可 =====
const SITE = {
  title: "技术扫描报告库",
  subtitle: "Tech Scan Report Hub",
  description: "在线浏览技术扫描报告 · 按分类管理 · 支持点评与反馈",
  owner: "overallview",
  repo: "scan-report-hub",
};

// ===== 显示顺序配置 =====
const DISPLAY = {
  // 分类顺序：把想排在前面的分类名按顺序写在这里；
  // 没提到的分类排在后面（按名称排序）。示例：
  // categoryOrder: ["未来AI", "web安全", "主机渗透"],
  categoryOrder: [],

  // 每个分类内的报告顺序：分类名 -> 报告文件名数组；
  // 没提到的报告排在后面（按上传日期新→旧）。示例：
  // reportOrder: { "web安全": ["b报告.pdf", "a报告.pdf"] },
  reportOrder: {},
};

// ===== 访问计数（Abacus 免费公共计数服务，无需注册）=====
const COUNTER = {
  namespace: "scan-report-hub",   // 计数命名空间，改名后计数会重新从 0 开始
};

// ===== giscus 评论系统（基于 GitHub Discussions）=====
// repoId / categoryId 由部署脚本自动填入，请勿手改
const GISCUS = {
  repo: "overallview/scan-report-hub",
  repoId: "R_kgDOVrXu3A",
  category: "Announcements",
  categoryId: "DIC_kwDOVrXu3M4DK7tc",
};
