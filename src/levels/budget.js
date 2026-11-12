const categories = ['food', 'lodging', 'transport', 'activities'];
const validAmount = (amount) => Number.isSafeInteger(amount) && amount >= 0;

export function calculate_budget(budget, costs = {}) {
  if (!validAmount(budget)) throw new TypeError('총예산은 0 이상의 원 단위 정수여야 합니다.');

  const items = categories.map((category) => {
    const { amount = null, status = 'unknown' } = costs[category] ?? {};
    if (status === 'unknown' && amount === null) return { category, amount, status };
    if (!['confirmed', 'estimated'].includes(status) || !validAmount(amount)) {
      throw new TypeError('비용은 0 이상의 원 단위 정수와 확인 상태를 함께 입력해야 합니다.');
    }
    return { category, amount, status };
  });

  const total = items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  if (!validAmount(total)) throw new RangeError('합산 비용이 계산 범위를 초과했습니다.');

  const hasUnknown = items.some((item) => item.status === 'unknown');
  return {
    budget,
    items,
    total,
    remaining: budget - total,
    status: hasUnknown ? 'partial' : items.some((item) => item.status === 'estimated') ? 'estimated' : 'confirmed',
  };
}
