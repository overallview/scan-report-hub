@echo off
rem 双击不好传参，请在命令行用：upload.cmd 分类名 文件路径
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0upload.ps1" %*
