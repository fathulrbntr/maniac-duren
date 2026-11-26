@echo off
setlocal
pushd "%~dp0..\.." || exit /b 1
git status --short || exit /b 1
call npm.cmd run verify || exit /b 1
call npm.cmd run test:browser || exit /b 1
set "patchFiles=database/cash-flow-127.sql database/README.md docs/STRUKTUR-PROYEK.md pos/app.js pos/cash-deposits-ui.mjs pos/cash-flow.mjs pos/data/mutations.mjs pos/reports-admin.css pos/reports-ui.mjs pos/retry.mjs scripts/check-project.mjs scripts/windows/push-patch-127.cmd supabase/migrations/20261126220000_cash_flow_127.sql tests/cash-flow-db.test.mjs tests/cash-flow-ui.test.mjs"
git add -- %patchFiles% || exit /b 1
git diff --cached --stat -- %patchFiles% || exit /b 1
git diff --cached --check -- %patchFiles% || exit /b 1
git diff --cached --quiet -- %patchFiles%
if errorlevel 2 exit /b 1
if not errorlevel 1 goto send
git commit --only -m "Track cash flow across stores, retail and distribution" -- %patchFiles% || exit /b 1
:send
git push || exit /b 1
popd
