import OpenAI from 'openai';
import { search_places } from '../integrations/naver-local.js';
import { get_routes } from '../integrations/naver-maps.js';

const located = (place) => Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude);
const lodgingCategory = /숙박|호텔|모텔|펜션|리조트|게스트하우스|민박|여관|호스텔/;

export async function recommendLodging(trip, plan) {
  const keywords = trip.budget <= 150_000 * Math.max(1, trip.days - 1)
    ? ['게스트하우스', '비즈니스호텔'] : ['호텔', '게스트하우스'];
  const results = await Promise.allSettled(keywords.map((keyword) => search_places(trip.region, keyword)));
  if (results.every((result) => result.status === 'rejected')) throw new Error('Lodging search failed');

  const unique = new Map();
  for (const result of results) {
    for (const place of result.value ?? []) {
      if (place.name && place.address && lodgingCategory.test(place.category ?? '')) {
        unique.set(place.name + ':' + place.address, place);
      }
    }
  }

  const visits = await Promise.all(plan.days.map(async (day) => {
    const known = day.stops.find((stop) => located(stop.place))?.place;
    if (known) return known;
    const name = day.stops[0]?.name;
    if (!name) return null;
    try {
      const matches = await search_places(trip.region, name);
      const normalize = (value) => value?.replace(/\s/g, '');
      return matches.find((place) => located(place) && normalize(place.name) === normalize(name));
    } catch {
      return null;
    }
  }));
  const landmarks = [...new Map(visits.filter(Boolean).map((place) => [place.name, place])).values()].slice(0, 2);
  if (landmarks.length < 2) {
    const extra = plan.days.flatMap((day) => day.stops).find((stop) =>
      located(stop.place) && !landmarks.some((place) => place.name === stop.place.name));
    if (extra) landmarks.push(extra.place);
  }

  // Compare a bounded set across both search categories.
  const candidates = [...unique.values()];
  const compare = async (place) => ({
    name: place.name, address: place.address, category: place.category,
    routes: await Promise.all(landmarks.map(async (landmark) => {
      let durationMs = null;
      if (located(place)) {
        try {
          const route = await get_routes(place, landmark);
          if (route.status === 'available') durationMs = route.durationMs;
        } catch {
          // A failed lookup leaves this leg unconfirmed.
        }
      }
      return { destination: landmark.name, durationMs };
    })),
  });

  const compared = await Promise.all(candidates.slice(0, 8).map(compare));
  const measured = (candidate) => candidate.routes.filter(({ durationMs }) => durationMs !== null);
  const average = (candidate) => {
    const routes = measured(candidate);
    return routes.length ? routes.reduce((sum, route) => sum + route.durationMs, 0) / routes.length : Infinity;
  };
  compared.sort((a, b) => measured(b).length - measured(a).length || average(a) - average(b));
  return {
    candidates: compared.slice(0, 4),
    landmarks: landmarks.map(({ name }) => name),
    budget: trip.budget,
    nights: trip.days - 1,
    knownNonLodging: plan.budget?.items
      .filter((item) => item.category !== 'lodging')
      .reduce((sum, item) => sum + (item.amount ?? 0), 0) ?? 0,
    searchTerms: keywords,
    partial: results.some((result) => result.status === 'rejected'),
  };
}

export async function researchLodging(trip, candidate) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim();
  if (!apiKey || !model) throw new Error('OpenAI configuration missing');
  const client = new OpenAI({ apiKey, timeout: 35_000, maxRetries: 0 });
  const response = await client.responses.create({
    model, store: false, tools: [{ type: 'web_search' }], tool_choice: 'required', max_tool_calls: 2,
    instructions: '웹에서 입력한 숙소와 주소가 일치하는 운영사·공공기관 공개 자료를 찾아 주차와 시설 정보를 한국어로 짧게 요약하세요. 인용을 붙이세요. 숙박 요금, 예약 가능 여부, 예약 링크는 쓰지 마세요. 일치하는 자료가 없으면 확인 필요로 답하세요.',
    input: JSON.stringify({ region: trip.region, name: candidate.name, address: candidate.address }),
  });
  const citations = new Map();
  for (const item of response.output) {
    if (item.type !== 'message') continue;
    for (const content of item.content) {
      for (const citation of content.annotations ?? []) {
        if (citation.type === 'url_citation' && /^https?:\/\//i.test(citation.url)) {
          citations.set(citation.url, { url: citation.url, title: citation.title });
        }
      }
    }
  }
  return { sources: [...citations.values()] };
}
