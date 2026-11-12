# ===== 一键上传扫描报告 =====
# 用法：  .\upload.ps1 <分类名> <文件1> [文件2] ...
# 示例：  .\upload.ps1 web安全 D:\报告\某站点漏扫.pdf
# 分类不存在会自动创建（新建文件夹即新建分类）
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Category,
    [Parameter(Mandatory = $true, Position = 1, ValueFromRemainingArguments = $true)]
    [string[]]$Files
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetDir = Join-Path $repoRoot "reports\$Category"

if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir | Out-Null
    Write-Host "✔ 新建分类文件夹：reports\$Category" -ForegroundColor Cyan
}

foreach ($f in $Files) {
    if (-not (Test-Path $f)) { Write-Host "✘ 找不到文件：$f" -ForegroundColor Red; continue }
    Copy-Item $f $targetDir -Force
    Write-Host "✔ 已加入：$Category\$(Split-Path $f -Leaf)" -ForegroundColor Green
}

Set-Location $repoRoot
git add reports
if (-not (git diff --cached --quiet)) {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    git commit -m "上传报告 [$Category] $stamp"
    git push
    Write-Host "🚀 已推送，GitHub Actions 正在自动部署，约 1-2 分钟后可在网站上看到。" -ForegroundColor Yellow
} else {
    Write-Host "没有新增文件需要提交。"
}
