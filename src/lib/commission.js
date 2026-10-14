export function commissionPercentFor(operator, setting, crossingBorder) {
  const own = Number(operator?.commission_percent);
  if (!Number.isNaN(own) && own > 0) return own;

  const platform = crossingBorder
    ? Number(setting?.cross_border_commission_percent)
    : Number(setting?.default_commission_percent);
  if (!Number.isNaN(platform) && platform > 0) return platform;

  const fallback = Number(setting?.default_commission_percent);
  return Number.isNaN(fallback) ? 0 : fallback || 0;
}

export function commissionSplit(amount, percent) {
  const total = Number(amount) || 0;
  const rate = Number(percent) || 0;
  const fee = Math.round((total * rate) / 100);
  return { fee, net: total - fee };
}

export function discountFor(coupon, amount) {
  const total = Number(amount) || 0;
  const value = Number(coupon?.discount_value) || 0;
  const raw = coupon?.discount_type === 'fixed' ? value : Math.round((total * value) / 100);
  return Math.min(Math.max(raw, 0), total);
}