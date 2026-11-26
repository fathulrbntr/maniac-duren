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
set "patchFiles=database/README.md database/outbound-units-131.sql docs/STRUKTUR-PROYEK.md pos/outbound-ui.mjs pos/warehouse-flow.mjs pos/warehouse-ui.mjs pos/warehouse-workflow.mjs scripts/check-project.mjs scripts/windows/push-patch-131.cmd supabase/migrations/20261126234500_outbound_units_131.sql tests/outbound-units-db.test.mjs tests/warehouse-workflow-db.test.mjs tests/warehouse-workflow-ui.test.mjs"
git add -- %patchFiles% || exit /b 1
git diff --cached --stat -- %patchFiles% || exit /b 1
git diff --cached --check -- %patchFiles% || exit /b 1
git diff --cached --quiet -- %patchFiles%
if errorlevel 2 exit /b 1
if not errorlevel 1 goto send
git commit --only -m "Support non-fruit warehouse batches in store transfers" -- %patchFiles% || exit /b 1
:send
git push || exit /b 1
popd
