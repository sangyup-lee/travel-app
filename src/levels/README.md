# 단계별 여행 기능

1. Level 1: OpenAI Responses API로 여행 일정 초안을 생성합니다.
2. Level 2: NAVER API HUB 지역 검색으로 장소를 확인하고 결과를 일정에 연결합니다.
3. Level 3: NAVER Cloud Platform 신규 Maps로 지도와 자동차 경로를 표시합니다.

각 단계의 요청 처리와 여행 계획 로직을 이 폴더에 추가합니다. 외부 API 호출은 ../integrations에 두고, HTTP 라우트는 ../app.js에서 등록합니다.
