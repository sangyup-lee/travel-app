export const minutes = (time) => {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};

export function validatePlan(plan, trip, { budget, weather } = {}) {
  const issues = [];
  const checks = [];
  const add = (target, code, message, day = null, stop = null) =>
    target.push({ code, message, day, stop });

  if (budget?.total > trip.budget) {
    add(issues, 'budget', '제공된 비용 합계가 총예산을 ' + (budget.total - trip.budget).toLocaleString('ko-KR') + '원 초과합니다.');
  }
  if (!budget || budget.status !== 'confirmed') {
    add(checks, 'cost', '미확인 또는 추정 비용을 포함한 실제 총지출 확인 필요');
  }

  for (const [index, day] of plan.days.entries()) {
    const number = index + 1;
    const forecast = weather?.forecast[index];
    const driveLimit = trip.maxDriveMinutes ?? 120;
    if (day.stops.length > trip.stopsPerDay) {
      add(issues, 'count', '하루 최대 방문지 ' + trip.stopsPerDay + '곳을 초과합니다.', number);
    }
    if ((trip.weatherAware || weather) && forecast?.status !== 'available') {
      add(checks, 'weather', '활동 시간대 날씨 확인 필요', number);
    }
    let latestEnd = -1;
    for (const [position, stop] of day.stops.entries()) {
      const start = minutes(stop.time);
      const end = minutes(stop.endTime);
      if (start < latestEnd || end <= start) {
        add(issues, 'overlap', stop.name + ' 방문 시간이 앞 일정과 겹치거나 종료 시간이 올바르지 않습니다.', number, stop.name);
      }
      latestEnd = Math.max(latestEnd, end);
      if (position && trip.transport === '자동차') {
        if (stop.route?.status !== 'available') {
          add(checks, 'drive', stop.name + '까지 자동차 이동시간 확인 필요', number, stop.name);
        } else if (stop.route.durationMs > driveLimit * 60_000) {
          add(issues, 'drive', stop.name + '까지 자동차 이동이 ' + Math.ceil(stop.route.durationMs / 60_000) +
            '분으로 구간 제한 ' + driveLimit + '분을 초과합니다.', number, stop.name);
        }
      }
      const hours = trip.openingHours?.filter((entry) => entry.day === number && entry.name === stop.name) ?? [];
      if (!hours.length) {
        add(checks, 'hours', stop.name + ' 영업시간 확인 필요', number, stop.name);
      } else if (!hours.some(({ open, close }) => start >= minutes(open) && end <= minutes(close))) {
        add(issues, 'hours', stop.name + ' 방문 시간이 입력한 영업시간과 충돌합니다.', number, stop.name);
      }
      const category = stop.place?.category ?? '';
      const outdoor = /해수욕장|등산로|산책로|자연휴양림|해변|공원|전망대/.test(category);
      const indoor = /박물관|미술관|전시관|도서관|영화관|카페|음식점/.test(category);
      if (forecast?.rainExpected) {
        const overlapsRain = forecast.rainyHours.some((hour) => {
          const rain = minutes(hour);
          return start < rain + 60 && end > rain;
        });
        if (overlapsRain && outdoor && !indoor) {
          add(issues, 'rain', stop.name + ' 야외 방문이 비 예보 시간대와 겹칩니다.', number, stop.name);
        } else if (overlapsRain && !indoor && !outdoor) {
          add(checks, 'type', stop.name + ' 실내·실외 유형 확인 필요', number, stop.name);
        }
      }
    }
  }
  return { issues, checks };
}
