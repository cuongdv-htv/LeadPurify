@echo off
title LeadPurify - Control Panel
echo ==============================================
echo        LEADPURIFY - FACEBOOK URL CHECKER
echo ==============================================
echo.

echo [1/2] Dang khoi dong Backend Server...
start /B cmd /c "cd backend && node server.js"

echo [2/2] Dang khoi dong Frontend Server...
start /B cmd /c "cd frontend && npm run dev -- --open"

echo.
echo ==============================================
echo [!] Ung dung dang duoc khoi dong ngam!
echo [!] Trinh duyet se tu dong mo sau vai giay.
echo [!] Khi dung xong, hay chay file "stop.bat" de tat ung dung.
echo ==============================================
echo.
pause
