@echo off
chcp 65001 >nul
setlocal
pushd "%~dp0" || exit /b 1
set "PYTHONUTF8=1"
python scraper\studio.py
set "studio_exit=%errorlevel%"
popd
if not "%studio_exit%"=="0" pause
exit /b %studio_exit%
