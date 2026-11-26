@echo off
setlocal
pushd "%~dp0..\.." || exit /b 1
git status --short || exit /b 1
call npm.cmd run verify || exit /b 1
call npm.cmd run test:browser || exit /b 1
set "patchFiles=database/README.md database/outbound-batches-126.sql docs/STRUKTUR-PROYEK.md pos/outbound-ui.mjs pos/warehouse-workflow.mjs pos/warehouse.css scripts/check-project.mjs scripts/windows/push-patch-126.cmd supabase/migrations/20261126160000_outbound_batches_126.sql tests/warehouse-workflow-browser.mjs tests/warehouse-workflow-db.test.mjs tests/warehouse-workflow-ui.test.mjs"
git add -- %patchFiles% || exit /b 1
git diff --cached --stat -- %patchFiles% || exit /b 1
git diff --cached --check -- %patchFiles% || exit /b 1
git diff --cached --quiet -- %patchFiles%
if errorlevel 2 exit /b 1
if not errorlevel 1 goto send
git commit --only -m "Select warehouse batches and validate outbound prices and barcodes" -- %patchFiles% || exit /b 1
:send
git push || exit /b 1
popd
