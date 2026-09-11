# AI에게 설치를 맡기는 방법

다른 AI에게 아래 한 줄을 전달하세요.

> https://github.com/namuira8476-ux/Mutil_Ai_Team 의 docs/AI-INSTALL.md를 읽고 내 Windows PC에 Agent Studio를 설치해줘. 기존 프로젝트와 로그인 정보는 보존해줘.

## 설치 작업 지침

1. Windows x64인지 확인합니다. macOS, Linux, Windows ARM은 아직 지원하지 않습니다.
2. 기존 Agent Studio가 실행 중이면 작업을 마친 뒤 사용자가 종료하게 합니다. 실행 중인 작업을 강제로 종료하지 않습니다.
3. 이 저장소의 `install.ps1`을 읽고 실행합니다. 최신 GitHub Release의 설치 파일과 SHA-256을 받아 검증하고 사용자 영역에 설치합니다. Git·Node.js·API 키는 앱 설치에 필요하지 않습니다.
4. 설치 후 Agent Studio 창이 열리는지 확인합니다. 기존 데이터 폴더 `%APPDATA%\agent-workroom`을 삭제하거나 초기화하지 않습니다.
5. 앱의 **설정 → 경로 자동 연결**로 기존 Codex·Claude·Gemini(agy)를 찾습니다. 없는 CLI는 **공식 설치 실행 / 설치 터미널 열기**로 설치합니다. 로그인·MFA·계정 권한 확인은 사용자에게 맡깁니다. 유료 API 키 구매나 계정 로그인 없이 모델 작업이 된다고 보고하지 않습니다.
6. 사용자가 선택한 로컬 폴더를 프로젝트로 연결하고, 연결된 CLI로 짧은 응답을 확인합니다. 앱 설치 성공과 모델 로그인/응답 성공을 구분해 보고합니다.

PowerShell 한 줄:

```powershell
irm https://raw.githubusercontent.com/namuira8476-ux/Mutil_Ai_Team/main/install.ps1 | iex
```

설치파일 다운로드·검증만 할 때는 스크립트를 파일로 저장한 뒤 `-DownloadOnly`로 실행합니다. 특정 버전은 `-Version 0.1.15`, 설치 위치는 `-InstallDir 'C:\Apps\Agent Studio'`, 자동 실행 생략은 `-NoLaunch`로 지정합니다.

이 미리보기 설치파일에는 코드서명 인증서가 없습니다. Windows 경고가 나타나면 사용자에게 출처와 체크섬을 안내하고 보안 설정을 변경하거나 우회하지 않습니다.
