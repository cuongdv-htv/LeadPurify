@echo off
title LeadPurify - Control Panel
echo ==============================================
echo        LEADPURIFY - FACEBOOK URL CHECKER
echo ==============================================
echo.

echo [1/3] Dang khoi dong Backend Server...
start "LeadPurify Backend" cmd /k "cd backend && node server.js"

echo [2/3] Dang khoi dong Frontend Server...
start "LeadPurify Frontend" cmd /k "cd frontend && npm run dev -- --open"

echo [3/3] Dang doi may chu hoat dong... (5 giay)
timeout /t 5 /nobreak >nul

echo Hoan tat! Dang mo trinh duyet...
start http://localhost:5173

echo.
echo De dong ung dung, ban chi can dong cac cua so mau den (cmd) nay lai.
pause
