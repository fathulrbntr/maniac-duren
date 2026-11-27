@echo off
setlocal
if exist "%~dp0..\..\scripts\check-project.mjs" (
  pushd "%~dp0..\.." || exit /b 1
) else (
  if not exist "scripts\check-project.mjs" (
    echo Jalankan dari folder proyek Maniac Duren.
    exit /b 1
  )
  pushd "." || exit /b 1
)
git status --short || exit /b 1
call npm.cmd run verify || exit /b 1
call npm.cmd run test:browser || exit /b 1
set "patchFiles=database/README.md database/branch-stock-132.sql docs/PATCH-132-ALUR-CABANG.md docs/STRUKTUR-PROYEK.md pos/app.js pos/cash-flow.mjs pos/inventory-ui.mjs pos/outbound-ui.mjs pos/receiving-session-ui.mjs pos/reports-ui.mjs pos/warehouse-flow.mjs pos/warehouse-ui.mjs pos/workspaces.mjs scripts/check-project.mjs scripts/windows/push-patch-132.cmd supabase/migrations/20261127090000_branch_stock_132.sql tests/branch-stock-db.test.mjs tests/branch-stock-ui.test.mjs"
git add -- %patchFiles% || exit /b 1
git diff --cached --stat -- %patchFiles% || exit /b 1
git diff --cached --check -- %patchFiles% || exit /b 1
git diff --cached --quiet -- %patchFiles%
if errorlevel 2 exit /b 1
if not errorlevel 1 goto send
git commit --only -m "Receive supplier stock directly at branches and transfer it by delivery note" -- %patchFiles% || exit /b 1
:send
git push || exit /b 1
popd
