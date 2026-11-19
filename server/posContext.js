/**
 * POS context module for operator app
 */

/**
 * Returns the currency for a given country
 * Rwanda -> RWF, everything else -> UGX (including null/undefined)
 */
export function currencyFor(country) {
  return country === 'Rwanda' ? 'RWF' : 'UGX';
}

/**
 * Build context for operator POS app
 * @param {Object} options
 * @param {Database} options.sqlite - SQLite database connection
 * @param {Object} options.caller - Authenticated caller with id, email, role
 * @param {Date} options.now - Current timestamp
 * @param {Object} options.policy - App policy with minVersion, latestVersion, apkUrl, sha256
 * @returns {Object} Context object with operator, user, server_time, app
 */
export function buildContext({ sqlite, caller, now, policy }) {
  const operator = sqlite.prepare(`
    SELECT id, name, slug, country, status FROM operator
    WHERE lower(owner_email) = lower(?) ORDER BY created_date ASC LIMIT 1
  `).get(caller?.email || '');

  const result = {
    operator: operator ? {
      ...operator,
      currency: currencyFor(operator.country)
    } : null,
    user: {
      id: caller?.id,
      email: caller?.email,
      role: caller?.role
    },
    server_time: now?.toISOString(),
    app: {
      min_version: policy?.minVersion,
      latest_version: policy?.latestVersion,
      apk_url: policy?.apkUrl,
      sha256: policy?.sha256
    }
  };

  return result;
}

/**
 * Build app policy from environment variables
 * @returns {Object} Policy object with minVersion, latestVersion, apkUrl, sha256
 */
export function appPolicyFromEnv() {
  return {
    minVersion: parseInt(process.env.POS_MIN_VERSION || '1', 10),
    latestVersion: parseInt(process.env.POS_LATEST_VERSION || '2', 10),
    apkUrl: process.env.POS_APK_URL || 'https://www.yooterminal.com/pos/yooterminal-operator-2.0.0.apk',
    sha256: process.env.POS_APK_SHA256 || ''
  };
}