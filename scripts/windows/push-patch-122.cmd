@echo off
setlocal
pushd "%~dp0..\.." || exit /b 1
git status --short || exit /b 1
call npm.cmd run verify || exit /b 1
call npm.cmd run test:browser || exit /b 1
set "patchFiles=pos/app.js pos/inventory-ui.mjs pos/product-dialog.mjs pos/production-ui.mjs pos/receiving-session-ui.mjs pos/supplier-notes-ui.mjs pos/supply-session-ui.mjs pos/variant-editor.mjs pos/warehouse-ui.mjs pos/warehouse-workflow.mjs database/README.md database/supplier-stock-122.sql supabase/migrations/20261123180000_supplier_stock_122.sql scripts/check-project.mjs tests/supplier-stock-db.test.mjs tests/supplier-stock-ui.test.mjs scripts/windows/push-patch-122.cmd pos/dashboard-data.mjs pos/warehouse.css tests/location-fruit-stock.test.mjs tests/warehouse-workflow-browser.mjs tests/warehouse-workflow-ui.test.mjs tests/warehouse-workflow-db.test.mjs"
git add -- %patchFiles% || exit /b 1
git diff --cached --stat -- %patchFiles% || exit /b 1
git diff --cached --check -- %patchFiles% || exit /b 1
git diff --cached --quiet -- %patchFiles%
if errorlevel 2 exit /b 1
if not errorlevel 1 goto send
git commit --only -m "Receive all purchased stock against supplier invoices with batch costing" -- %patchFiles% || exit /b 1
:send
git push || exit /b 1
popd
