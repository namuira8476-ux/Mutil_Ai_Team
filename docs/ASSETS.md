# 디자인과 자산

- 캐릭터·연필 질감 기준: `outputs/agent-workroom-plan/images/04-automation-skill-workspace.png`. 0.1.2부터는 사용자의 후속 요청에 따라 중앙에 대화, 오른쪽에 에이전트를 배치합니다. 이전 콘셉트 그림의 위치보다 새 배치가 우선합니다.
- 개념도: 같은 폴더의 `03-automation-skill-concept.png`.
- 원래 사용자가 제공한 연필 그림을 바탕으로 이 작업에서 ImageGen으로 UI 시안과 캐릭터 아틀라스를 생성했습니다.
- 런타임 자산: `public/assets/agent-atlas-side-keyboard.png`. 세 부모 책상과 세 스킬 자식을 CSS로 각각 배치합니다. 전체 UI 시안을 배경으로 덮어 씌운 화면이 아닙니다.
- 캐릭터의 공급자 이름은 연결할 CLI를 구분합니다. 공식 마스코트·공식 공급자 앱이라는 의미로 사용하지 않습니다.
- 아이콘: lucide-react. 글꼴은 OS 기본 Malgun Gothic·Segoe UI·Consolas이며 글꼴 파일을 번들하지 않습니다.
- 모션: 실제 관리형 실행 상태에서만 가벼운 움직임을 적용합니다. 움직임 줄이기와 OS reduced-motion 설정을 지원합니다.
- UI QA 이미지 중 `fixture-` 접두사는 가짜 CLI로 검사한 화면입니다. `live-` 접두사는 실제 Codex 호출 화면입니다.
- `outputs/agent-workroom-plan/images/05-folder-structure.png`는 현재 주요 폴더 구조를 설명하는 그림입니다. 정확한 텍스트 트리는 같은 기획 폴더의 `folder-structure.ko.md`에 있습니다.
- `06-guide-connect.png`, `07-guide-agents-skills.png`, `08-guide-automation-results.png`는 내장 ImageGen으로 생성한 사용 방법 그림 3장입니다. 실제 앱 스크린샷을 참고했지만 설명용으로 단순화했으며, 각 그림의 예시 작업·스킬·자료는 실제 실행 증거가 아닙니다. 생성 프롬프트는 기획 폴더의 `usage-guide.imagegen-prompts.md`에 보관했습니다.

기획 이미지와 실제 화면은 동일한 배치·색상·캐릭터 방향을 유지하지만 픽셀 단위로 같은 그림은 아닙니다. 자동 실행은 작은 자식, 직접 조작은 부모 모니터를 사용합니다. 기본 스킬 소품은 캐릭터 아틀라스를 재사용하므로 사용자 스킬마다 독립된 새 일러스트가 생성되는 기능은 아닙니다.

0.1.9는 내장 ImageGen으로 모니터를 옆으로 돌리고 키보드가 드러나는 부모·자식 그림을 생성했습니다. 원본 agent-atlas.png는 보존했습니다. 프롬프트: [side-keyboard.imagegen-prompt.md](side-keyboard.imagegen-prompt.md). 타자 동작은 새 그림의 실제 손 영역을 작게 움직이며 모니터에는 별도 손을 그리지 않습니다.

0.1.10부터 실제 작업 중 손 타자와 기존 위아래 움직임을 함께 적용합니다. 새 그림 자산은 그대로 사용합니다.
