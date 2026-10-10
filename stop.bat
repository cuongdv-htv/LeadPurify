@echo off
title LeadPurify - Stop Servers
echo ==============================================
echo        DONG MAY CHU LEADPURIFY
echo ==============================================
echo.

echo Dang tim va tat Backend Server (Cong 3001)...
FOR /F "tokens=5" %%T IN ('netstat -a -n -o ^| findstr :3001 ^| find "LISTENING"') DO (
    echo Tat tien trinh PID %%T...
    taskkill /F /PID %%T >nul 2>&1
)

echo Dang tim va tat Frontend Server (Cong 5173)...
FOR /F "tokens=5" %%T IN ('netstat -a -n -o ^| findstr :5173 ^| find "LISTENING"') DO (
    echo Tat tien trinh PID %%T...
    taskkill /F /PID %%T >nul 2>&1
)

echo.
echo Da tat tat ca cac dich vu cua LeadPurify thanh cong!
pause
