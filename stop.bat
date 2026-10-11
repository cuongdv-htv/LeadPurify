@echo off
title LeadPurify - Stop Servers
echo ==============================================
echo        DONG MAY CHU LEADPURIFY
echo ==============================================
echo.

echo [1/3] Gui tin hieu dong an toan den Backend (Luu checkpoint & dong browser)...
curl -s -X POST http://localhost:3001/api/shutdown >nul 2>&1
timeout /t 2 /nobreak >nul 2>&1

echo [2/3] Kiem tra va tat Backend Server (Cong 3001)...
FOR /F "tokens=5" %%T IN ('netstat -a -n -o ^| findstr :3001 ^| find "LISTENING"') DO (
    echo Tat tien trinh Backend PID %%T...
    taskkill /F /PID %%T >nul 2>&1
)

echo [3/3] Kiem tra va tat Frontend Server (Cong 5173 & 5174)...
FOR /F "tokens=5" %%T IN ('netstat -a -n -o ^| findstr :5173 ^| find "LISTENING"') DO (
    echo Tat tien trinh Frontend PID %%T...
    taskkill /F /PID %%T >nul 2>&1
)
FOR /F "tokens=5" %%T IN ('netstat -a -n -o ^| findstr :5174 ^| find "LISTENING"') DO (
    echo Tat tien trinh Frontend PID %%T...
    taskkill /F /PID %%T >nul 2>&1
)

echo.
echo Da tat tat ca cac dich vu cua LeadPurify thanh cong va an toan!
pause

