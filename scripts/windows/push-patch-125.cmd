@echo off
setlocal
pushd "%~dp0..\.." || exit /b 1
git status --short || exit /b 1
call npm.cmd run verify || exit /b 1
call npm.cmd run test:browser || exit /b 1
set "patchFiles=docs/ALUR-PENGGUNA.md pos/system-dock.mjs pos/warehouse-ui.mjs pos/workspaces.mjs tests/warehouse-browser.mjs tests/warehouse-flow-db.test.mjs tests/warehouse-flow-ui.test.mjs scripts/windows/push-patch-125.cmd"
git add -- %patchFiles% || exit /b 1
git diff --cached --stat -- %patchFiles% || exit /b 1
git diff --cached --check -- %patchFiles% || exit /b 1
git diff --cached --quiet -- %patchFiles%
if errorlevel 2 exit /b 1
if not errorlevel 1 goto send
git commit --only -m "Organize store receiving, sales and post-receipt reject flow" -- %patchFiles% || exit /b 1
:send
git push || exit /b 1
popd
