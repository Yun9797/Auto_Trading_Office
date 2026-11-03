@echo off
chcp 65001 >nul
title Trading Office
cd /d "%~dp0"

where node >nul 2>nul || (
  echo Node.js가 설치돼 있지 않아요. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 눌러주세요.
  pause
  exit /b
)

if not exist node_modules (
  echo 처음 실행이라 필요한 파일을 설치하고 있어요. 1~2분 걸려요...
  call npm install || (
    echo 설치에 실패했어요. 인터넷 연결을 확인해 주세요.
    pause
    exit /b
  )
)

rem 이미 켜져 있으면 브라우저만 연다
curl -s -o nul -m 2 http://localhost:3000 && (
  start "" http://localhost:3000
  exit /b
)

echo.
echo  Trading Office 를 켜고 있어요. 잠시 뒤 브라우저가 자동으로 열려요.
echo  이 검은 창을 닫으면 프로그램(매매)도 꺼져요. 최소화만 해두세요.
echo.

rem 서버가 뜨면 브라우저를 연다 (최대 90초 기다림)
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 90;$i++){try{(New-Object Net.Sockets.TcpClient).Connect('localhost',3000);Start-Process 'http://localhost:3000';break}catch{Start-Sleep 1}}"

call npm run dev
pause
