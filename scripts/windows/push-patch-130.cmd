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
set "patchFiles=api/pos-employee.js database/petty-cash-130.sql docs/STRUKTUR-PROYEK.md pos/app.js pos/cash-deposits-ui.mjs pos/cash-flow.mjs pos/crm-ui.mjs pos/crm.mjs pos/dashboard-data.mjs pos/data/mutations.mjs pos/documents-ui.mjs pos/employees-ui.mjs pos/petty-cash-ui.mjs pos/reports-admin.css pos/reports-ui.mjs pos/retry.mjs pos/stock-demo.mjs pos/store-expenses-ui.mjs pos/warehouse-ui.mjs pos/workspaces.mjs scripts/check-project.mjs scripts/windows/push-patch-130.cmd supabase/migrations/20261126233000_petty_cash_130.sql tests/petty-cash-db.test.mjs tests/petty-cash-ui.test.mjs tests/warehouse-workflow-db.test.mjs"
git add -- %patchFiles% || exit /b 1
git diff --cached --stat -- %patchFiles% || exit /b 1
git diff --cached --check -- %patchFiles% || exit /b 1
git diff --cached --quiet -- %patchFiles%
if errorlevel 2 exit /b 1
if not errorlevel 1 goto send
git commit --only -m "Separate petty cash from sales and centralize POS administration" -- %patchFiles% || exit /b 1
:send
git push || exit /b 1
popd
