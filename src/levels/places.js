import { search_places } from '../integrations/naver-local.js';

export async function getPlaces(req, res) {
  try {
    const places = await search_places(req.query.region, req.query.keyword);
    return res.json({ places });
  } catch (error) {
    if (error.code === 'INVALID_QUERY') {
      return res.status(400).json({ error: '여행 지역과 검색어를 확인해 주세요.' });
    }
    if (error.code === 'NAVER_CONFIG' || [401, 403].includes(error.status)) {
      return res.status(503).json({ error: '서버의 NAVER API HUB 인증 정보와 검색 API 권한을 확인해 주세요.' });
    }
    if (error.status === 429) {
      return res.status(503).json({ error: '장소 검색 요청 한도에 도달했습니다.' });
    }
    if (error.name === 'TimeoutError') {
      return res.status(504).json({ error: '장소 검색 응답이 늦어지고 있습니다. 다시 시도해 주세요.' });
    }
    return res.status(502).json({ error: '장소 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
  }
}
