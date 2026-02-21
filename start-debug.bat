@echo off
title OurFarm [DEBUG MODE]
color 0E

echo.
echo  =====================================================
echo    OurFarm - DEBUG MODE
echo  =====================================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    pause
    exit /b 1
)

:: Check node_modules
if not exist "node_modules\" (
    echo [SETUP] Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
    echo.
)

:: Create logs directory
if not exist "logs\" mkdir logs

:: Set debug environment variables
set OURFARM_DEBUG=1
set OURFARM_LOG_LEVEL=debug
set NODE_ENV=development

:: Generate session timestamp for log filenames
for /f "tokens=1-6 delims=/:. " %%a in ("%date% %time%") do (
    set SESSION_TS=%%c-%%a-%%b_%%d-%%e-%%f
)

echo  [DEBUG] Environment:
echo    OURFARM_DEBUG    = %OURFARM_DEBUG%
echo    OURFARM_LOG_LEVEL = %OURFARM_LOG_LEVEL%
echo    NODE_ENV         = %NODE_ENV%
echo.
echo  [DEBUG] Log files will be written to: logs\
echo.
echo  [DEBUG] Server logs  : logs\server-*.log
echo  [DEBUG] Action logs  : logs\actions-*.log
echo  [DEBUG] Client errors: logs\client-errors.log
echo.
echo  =====================================================
echo   ENDPOINTS FOR DEBUGGING:
echo  =====================================================
echo.
echo   Health check:     http://localhost:3000/api/health
echo   Game state:       http://localhost:3000/api/debug/state
echo   List log files:   http://localhost:3000/api/debug/logs
echo   Read server log:  http://localhost:3000/api/debug/logs/{filename}
echo.
echo   Browser console:  __ourfarmDebug.getErrors()
echo                     __ourfarmDebug.getState()
echo                     __ourfarmDebug.getHealth()
echo.
echo  =====================================================
echo   Starting server and client in DEBUG mode...
echo   Press Ctrl+C to stop both.
echo  =====================================================
echo.

:: Run both server and client with debug env vars
:: The server will pick up OURFARM_DEBUG=1 and write log files
npx concurrently --names "SERVER,CLIENT" --prefix-colors "red,blue" "node --watch server/index.js" "npx vite --open"
