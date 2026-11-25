@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "dist\index.html" (
  echo [Perlica] 首次运行，正在构建前端界面...
  call npm run build
)
set NODE_ENV=production
set PORT=3000
echo [Perlica] 正在启动服务...
npx tsx server/index.ts
pause
