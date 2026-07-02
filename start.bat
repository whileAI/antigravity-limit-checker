@echo off
title AR Checker - Antigravity Quota Monitor
cd /d "%~dp0"

echo Checking dependencies...
if not exist "node_modules\" (
    echo node_modules folder not found. Installing dependencies...
    call npm install
)

echo Starting AR Checker...
call npm start
pause
