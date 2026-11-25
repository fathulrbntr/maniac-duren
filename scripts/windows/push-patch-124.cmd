@echo off
setlocal
pushd "%~dp0..\.." || exit /b 1
git status --short || exit /b 1
call npm.cmd run verify || exit /b 1
call npm.cmd run test:browser || exit /b 1
set "patchFiles=docs/STRUKTUR-PROYEK.md pos/app.js pos/cashier.css pos/customer-display.css pos/customer-display.html pos/index.html pos/manifest.webmanifest pos/pos-menu.css pos/pos-menu.mjs pos/ui-system.css pos/ui-tokens.css pos/workspace-ui.css tests/ui-audit-browser.mjs pos/assets/fonts/dm-sans/OFL.txt pos/assets/fonts/dm-sans/dm-sans-latin-wght-normal.woff2 pos/assets/fonts/manrope/OFL.txt pos/assets/fonts/manrope/manrope-latin-wght-normal.woff2 scripts/windows/push-patch-124.cmd"
git add -- %patchFiles% || exit /b 1
git diff --cached --stat -- %patchFiles% || exit /b 1
git diff --cached --check -- %patchFiles% || exit /b 1
git diff --cached --quiet -- %patchFiles%
if errorlevel 2 exit /b 1
if not errorlevel 1 goto send
git commit --only -m "Align POS interface with the Maniac Duren menu" -- %patchFiles% || exit /b 1
:send
git push || exit /b 1
popd
