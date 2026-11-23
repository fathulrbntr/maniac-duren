@echo off
setlocal
pushd "%~dp0..\.." || exit /b 1
git status --short || exit /b 1
call npm.cmd run verify || exit /b 1
call npm.cmd run test:browser || exit /b 1
set "patchFiles=pos/app.js pos/branch-prices.mjs pos/branch-prices-ui.mjs pos/warehouse-flow.mjs pos/warehouse-ui.mjs pos/operations-ui.mjs pos/cashier.mjs pos/inventory-ui.mjs pos/barcode-scanner.mjs pos/fruit-sale-dialog.mjs database/branch-sale-prices-123.sql supabase/migrations/20261123190000_branch_sale_prices_123.sql database/README.md scripts/check-project.mjs tests/branch-sale-prices-db.test.mjs tests/branch-sale-prices-ui.test.mjs scripts/windows/push-patch-123.cmd tests/warehouse-workflow-browser.mjs"
git add -- %patchFiles% || exit /b 1
git diff --cached --stat -- %patchFiles% || exit /b 1
git diff --cached --check -- %patchFiles% || exit /b 1
git diff --cached --quiet -- %patchFiles%
if errorlevel 2 exit /b 1
if not errorlevel 1 goto send
git commit --only -m "Configure and enforce retail sale prices per store branch" -- %patchFiles% || exit /b 1
:send
git push || exit /b 1
popd
