@echo off
title OurFarm
echo.
echo  ============================================
echo    OurFarm - Starting Game
echo  ============================================
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

echo  Starting server and client...
echo  Server: http://localhost:3000
echo  Client: Vite dev server will open in browser
echo.
echo  Press Ctrl+C to stop both.
echo  ============================================
echo.

npm run dev
