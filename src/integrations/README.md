# 외부 API 연동 위치

Level 1에서 openai.js, Level 2에서 naver-local.js, Level 3에서 naver-maps.js를 추가합니다.
각 모듈은 Express 서버에서만 불러오고, 해당 서비스의 환경 변수만 읽습니다.
