@echo off
setlocal
pushd "%~dp0..\.." || exit /b 1
git status --short || exit /b 1
call npm.cmd run verify || exit /b 1
call npm.cmd run test:browser || exit /b 1
set "patchFiles=database/cashier-expenses-128.sql database/README.md docs/STRUKTUR-PROYEK.md pos/app.js pos/cashier-shifts-ui.mjs pos/data/mutations.mjs pos/navigation.mjs pos/reports-ui.mjs pos/retry.mjs pos/stock-demo.mjs pos/store-expenses-ui.mjs pos/workspaces.mjs scripts/check-project.mjs scripts/windows/push-patch-128.cmd supabase/migrations/20261126230000_cashier_expenses_128.sql tests/cashier-expenses-db.test.mjs tests/cashier-expenses-ui.test.mjs"
git add -- %patchFiles% || exit /b 1
git diff --cached --stat -- %patchFiles% || exit /b 1
git diff --cached --check -- %patchFiles% || exit /b 1
git diff --cached --quiet -- %patchFiles%
if errorlevel 2 exit /b 1
if not errorlevel 1 goto send
git commit --only -m "Record store expenses from the cashier workspace" -- %patchFiles% || exit /b 1
:send
git push || exit /b 1
popd
