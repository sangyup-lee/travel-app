# 국내 여행 AI Agent

HTML/CSS/JavaScript와 Node.js/Express로 구성한 로컬 개발 프로젝트입니다. 여행 조건을 입력하면 OpenAI Responses API가 날짜별 일정과 예상 비용을 생성합니다. 지도 영역은 방문 순서를 보여주는 개략도입니다.

## 실행

Node.js 22.16 이상과 npm이 필요합니다. PowerShell에서 프로젝트 폴더를 열고 실행하세요.

```powershell
npm.cmd ci
npm.cmd run dev
```

http://127.0.0.1:3000 에 접속합니다. 자동 재시작 없이 실행하려면 npm.cmd start를 사용하세요.

## 환경 변수

.env가 없는 새 작업 폴더에서는 Copy-Item .env.example .env 로 복사한 뒤 사용할 서비스의 값만 입력하세요. 일정을 생성하려면 OPENAI_API_KEY와 Structured Outputs를 지원하는 OPENAI_MODEL을 설정한 뒤 서버를 시작하세요. PORT는 생략 시 3000입니다.

| 서비스 | 변수 | 발급처 및 용도 |
| --- | --- | --- |
| OpenAI | OPENAI_API_KEY, OPENAI_MODEL | [OpenAI API](https://developers.openai.com/api/docs/quickstart)의 API 키와 사용할 모델 ID |
| NAVER API HUB | NAVER_API_HUB_CLIENT_ID, NAVER_API_HUB_CLIENT_SECRET | [NAVER API HUB](https://developers.naver.com/notice/article/32530)에서 발급받은 지역 검색용 인증 정보 |
| NAVER Maps | NAVER_MAPS_CLIENT_ID, NAVER_MAPS_CLIENT_SECRET | [NAVER Cloud Platform 신규 Maps Application](https://guide.ncloud-docs.com/docs/maps-app)의 Client ID와 Client Secret |

실제 인증 정보는 .env에만 두세요. Git에는 빈 템플릿인 .env.example만 추가합니다. public/은 브라우저에 제공되므로 비밀값을 저장하지 마세요. Level 3에서 Web SDK를 도입할 때는 허용할 Web 서비스 URL을 등록하고, SDK에 필요한 Client ID만 전달하세요. Client Secret은 경로 호출을 처리하는 서버에 둡니다.

## 개발 순서

- [Level 1 → 2 → 3](src/levels/README.md): 일정 초안 → 장소 검색 연동 → 지도와 경로 표시.
- [서비스 연동](src/integrations/README.md): 외부 API 클라이언트를 기능 로직과 분리합니다.
- public/: 브라우저 화면. src/app.js: Express 앱과 라우트. src/server.js: 로컬 서버 실행.


## NAVER 지도

NAVER Cloud Maps Application에서 Web Dynamic Map을 활성화하고 앱을 열 때 사용하는 주소(예: http://127.0.0.1)를 Web 서비스 URL로 등록하세요. 브라우저는 지도 로드에 필요한 Client ID만 받습니다. Directions 5 호출의 Client Secret은 서버에서 사용합니다.

## Level 2 날씨 설정

공공데이터포털의 기상청 단기예보 조회서비스를 신청한 뒤 .env에 KMA_SERVICE_KEY=일반인증키(Decoding)를 추가하고 서버를 재시작하세요. 날짜 탭에는 선택한 지역의 시청 인근 격자 기준 활동 시간대 예보를 표시합니다. 예보 범위를 벗어나거나 조회에 실패하면 미확인으로 표시합니다.

## GitHub 및 Vercel 배포

1. PowerShell에서 git --version으로 Git을 확인합니다. 설치가 필요하면 https://git-scm.com/install/windows 에서 Git for Windows를 설치하거나 winget install --id Git.Git -e를 실행한 뒤 PowerShell을 다시 엽니다.
2. GitHub에서 빈 저장소를 만든 뒤 아래 명령을 실행합니다. 이 프로젝트는 npm ci로 의존성을 복원합니다. .env.example에는 빈 변수만 포함합니다.

```powershell
git status --short
git check-ignore .env
git add .
git diff --cached --stat
git commit -m "Prepare travel planner for deployment"
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

3. Vercel에서 Add New → Project로 GitHub 저장소를 가져옵니다. 저장소 루트를 선택하고 Express 프리셋과 Node.js 22.x를 사용합니다. vercel.json의 설치 명령은 npm ci입니다. Fluid Compute를 켜 두세요. Agent가 최대 120초 동안 동작하므로 함수 실행 한도는 150초 이상으로 설정하세요.
4. Vercel Marketplace에서 Upstash Redis를 연결하고, 아래 변수를 Project → Settings → Environment Variables에 추가합니다. Production에 등록하고 Preview에서 테스트할 경우 Preview에도 등록합니다. 값을 추가하거나 변경한 뒤 해당 환경을 다시 배포합니다. PORT는 로컬에서만 사용합니다.

| 환경변수 | 용도 |
| --- | --- |
| OPENAI_API_KEY, OPENAI_MODEL | Responses API 인증키와 도구 호출을 지원하는 모델 ID |
| NAVER_API_HUB_CLIENT_ID, NAVER_API_HUB_CLIENT_SECRET | NAVER 지역 검색 인증 |
| NAVER_MAPS_CLIENT_ID, NAVER_MAPS_CLIENT_SECRET | Web Dynamic Map 및 Directions 5 인증 |
| KMA_SERVICE_KEY | 기상청 단기예보 인증. 날씨 기능을 쓸 때 필요합니다. |
| UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN | Vercel 인스턴스 간 일정 공유와 요청 한도 집계. 읽기·쓰기 토큰을 사용합니다. |

NAVER Cloud Platform → Services → Application Services → Maps → Application에서 앱을 편집합니다. Web Dynamic Map과 Directions 5를 활성화하고, Web 서비스 URL에 실제 배포 주소(예: https://your-project.vercel.app)를 등록합니다. 사용자 지정 도메인이나 테스트할 고정 Preview 도메인도 각각 등록합니다. 브라우저에는 지도 표시용 Client ID만 전달합니다.

배포 후 아래 명령을 실행합니다. 실제 OpenAI, NAVER API HUB, Directions 5를 호출하고, 이전 요청의 일정 ID로 별도 요청에서 수정이 되는지 확인합니다. 브라우저에서 부산 자동차 일정을 생성해 지도 타일, 마커, 자동차 경로도 확인합니다.

```powershell
node scripts/smoke-deployment.js https://your-project.vercel.app
```

Vercel에서는 일정 생성·수정·숙소 조회·복원을 합쳐 환경별 분당 12회, 장소 검색은 분당 60회로 제한합니다. 이 한도는 모든 사용자가 공유합니다. 429이면 Retry-After 이후에 다시 시도합니다. 503은 키, 서비스 이용 권한, 제공자 한도 또는 Redis 연결을 확인합니다. 504는 상위 API 지연이나 Agent 시간 초과를 확인합니다. Vercel Runtime Logs에서 상태 코드를 확인하고 인증값이나 원본 상위 API 응답은 공유하지 마세요. Redis 일정 기록은 1시간 후 만료되고, 브라우저에 저장한 계획은 다시 불러와 복원할 수 있습니다.

- [Express 배포](https://vercel.com/docs/frameworks/backend/express)
- [Vercel 환경변수](https://vercel.com/docs/environment-variables)
- [NAVER Maps Application 설정](https://guide.ncloud-docs.com/docs/maps-app)
