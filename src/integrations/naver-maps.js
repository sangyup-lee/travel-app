const endpoint = 'https://maps.apigw.ntruss.com/map-direction/v1/driving';

function formatPoint(point) {
  const { longitude, latitude } = point ?? {};
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
      !Number.isFinite(latitude) || Math.abs(latitude) > 90) {
    throw new TypeError('WGS84 경도와 위도를 숫자로 입력해 주세요.');
  }
  return longitude + ',' + latitude;
}

export async function get_routes(start, goal) {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    start: formatPoint(start), goal: formatPoint(goal), option: 'traoptimal',
  });

  const id = process.env.NAVER_MAPS_CLIENT_ID?.trim();
  const secret = process.env.NAVER_MAPS_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new Error('NAVER Maps 인증 정보를 확인해 주세요.');

  const response = await fetch(url, {
    headers: { 'X-NCP-APIGW-API-KEY-ID': id, 'X-NCP-APIGW-API-KEY': secret },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json().catch(() => null);
  const documentedFailure = [200, 400].includes(response.status) && [1, 2, 3, 4, 5].includes(data?.code);
  // The live gateway can wrap route failures in a generic 400 error.
  const gatewayRouteFailure = response.status === 400 &&
    /동일|도로 주변|길\s*찾기|경로.*(?:제공|탐색).*불가|1500\s*km/.test(data?.error?.message ?? '');
  if (documentedFailure || gatewayRouteFailure) {
    return { status: 'unavailable', message: '자동차 경로 확인 불가', distanceMeters: null, durationMs: null };
  }
  if (!response.ok) {
    throw Object.assign(new Error('NAVER Maps 경로 요청에 실패했습니다.'), { status: response.status });
  }
  const route = data?.route?.traoptimal?.[0];
  const summary = route?.summary;
  if (data?.code !== 0 || !Number.isSafeInteger(summary?.distance) || summary.distance < 0 ||
      !Number.isSafeInteger(summary?.duration) || summary.duration < 0) {
    throw new Error('NAVER Maps 경로 응답 형식을 확인해 주세요.');
  }
  return { status: 'available', distanceMeters: summary.distance, durationMs: summary.duration, path: Array.isArray(route.path) ? route.path : [] };
}
