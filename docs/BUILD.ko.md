# 개발 실행과 패키징

## 환경

Windows x64, Node.js 24.x, npm, Git를 사용합니다. 이번 개발 호스트는 Node 24.19.0 / npm 11.17.0이며 Electron 44.3.0, electron-builder 26.15.3, TypeScript 6.0.3을 고정했습니다. 모든 직접 의존성 버전과 전이 의존성은 package.json·package-lock.json에 고정되어 있습니다.

```powershell
npm ci
npm run dev
```

PowerShell이 npm.ps1 실행을 막으면 실행 정책을 바꾸는 대신 `npm.cmd`로 같은 명령을 실행하세요. dev 명령은 로컬 Vite와 Electron을 함께 실행합니다. dev 실행 중 Electron 메인 코드를 수정했다면 앱을 재시작합니다. React·CSS 변경은 Vite가 반영합니다.

```powershell
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm start
npm run dist:win
```

E2E 테스트는 격리된 `.runtime-test` 폴더, 테스트용 CLI 자식 프로세스와 SQLite를 사용합니다. 정상 앱 설정·실제 프로젝트·공급자 로그인을 변경하지 않습니다. 실제 모델 호출이 포함된 검사는 별도입니다:

```powershell
npm run build
npm run test:live
npm run test:team
```

Wiki 파일 생성까지 실제로 검사하려면 `node scripts/live-files.mjs`를 실행합니다. 테스트 전용 폴더에 원문과 결과를 생성하고 실제 모델 사용량을 사용합니다.

패키지 검사는 `WORKROOM_PACKAGED_EXE` 환경 변수에 배포 또는 설치된 실행파일의 절대 경로를 지정한 뒤 `npx playwright test`로 실행할 수 있습니다. 이 경우에도 테스트 설정·프로젝트는 `.runtime-test`에 격리됩니다. `node scripts/preview.mjs`는 실제 앱 스크린샷을 기록하며 `WORKROOM_SCALE`에 1, 1.25, 1.5 등을 지정할 수 있습니다.

두 live 검사는 기존 Codex 로그인과 실제 사용량을 사용합니다. `test:team`은 Codex 총괄 → 공용 스킬의 Codex 자식 → 결과 회수를 검사합니다. Claude·Gemini 실계정 시험은 각 CLI 연결 후 별도로 수행해야 합니다.

## 구조

| 경로 | 역할 |
| --- | --- |
| src | 작업실·프로젝트·Wiki·사용량·스킬·자동화 React UI |
| electron/main.ts | 앱 창·파일 대화상자·검증된 IPC·트레이 |
| electron/preload.ts | contextIsolation 경계의 메시지 API |
| electron/runtime.ts | 프로세스·대기열·스킬·예약·파일 감시·내부 MCP |
| electron/providers.ts | CLI 탐색·Windows 래퍼·스트림 파싱·Codex 한도 조회 |
| electron/store.ts | sql.js 기반 SQLite 로컬 저장 |
| electron/domain.ts | 프로젝트 경로·시간대·사용량·순환 검사 |
| public/assets | 실제 UI 캐릭터 자산 |
| outputs/agent-workroom-plan | 원본 기획·마스터 프롬프트·이미지 |

SQLite는 네이티브 ABI 의존성을 줄이기 위해 WASM sql.js를 사용합니다. 빌드가 WASM 파일을 resources로 복사합니다. node-pty는 Windows x64 N-API 사전 빌드 파일을 사용하고 asar 밖에 포함합니다. 검증된 사전 빌드 파일을 유지하기 위해 electron-builder의 npmRebuild를 false로 설정했습니다. 다른 OS·아키텍처에는 이 설정을 그대로 가정하지 말고 실제 로딩을 검사하세요.

설치 결과는 release 폴더에 생성됩니다. unpacked 실행 파일은 설치 동작과 별개로 패키지 내용 확인에 사용합니다. 업데이트·제거 과정에서 선택한 프로젝트 폴더를 삭제하지 않도록 구성했습니다.

## 다른 OS 지원 확장

macOS·Linux·Windows ARM64는 이번 릴리스의 검증 대상이 아닙니다. 해당 OS에서 소스를 받고 Node 24 및 CLI를 설치한 뒤 의존성을 설치하고 테스트하세요. node-pty 빌드 도구, 권한, 코드 서명, 설치 형식, 키보드 입력, 트레이, 경로 대소문자와 심볼릭 링크를 플랫폼별로 확인해야 합니다.

공개 배포와 자동 업데이트 서버는 포함하지 않았습니다. 서명 키·인증서 구매나 파일 업로드는 별도 배포 작업입니다.
