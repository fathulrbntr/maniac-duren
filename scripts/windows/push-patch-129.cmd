@echo off
setlocal
pushd "%~dp0..\.." || exit /b 1
git status --short || exit /b 1
call npm.cmd run verify || exit /b 1
call npm.cmd run test:browser || exit /b 1
set "patchFiles=docs/STRUKTUR-PROYEK.md pos/app.js pos/navigation.mjs pos/operations-ui.mjs pos/session.mjs pos/sidebar.mjs pos/ui-system.css pos/workspaces.mjs scripts/windows/push-patch-129.cmd tests/cashier-expenses-ui.test.mjs tests/session.test.mjs tests/store-sidebar.test.mjs tests/warehouse-browser.mjs tests/warehouse-flow-ui.test.mjs"
git add -- %patchFiles% || exit /b 1
git diff --cached --stat -- %patchFiles% || exit /b 1
git diff --cached --check -- %patchFiles% || exit /b 1
git diff --cached --quiet -- %patchFiles%
if errorlevel 2 exit /b 1
if not errorlevel 1 goto send
git commit --only -m "Organize the store sidebar by division" -- %patchFiles% || exit /b 1
:send
git push || exit /b 1
popd
