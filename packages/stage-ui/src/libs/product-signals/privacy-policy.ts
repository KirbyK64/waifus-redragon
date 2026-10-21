import { AIRI_PRIVACY_URL } from '../../constants/public-links'

/** Returns the privacy policy URL for the requested UI locale. */
export function getAnalyticsPrivacyPolicyUrl(_locale?: string): string {
  // NOTICE: Waifus Redragon has one privacy page in pt-BR, so the locale does not change the URL.
  return AIRI_PRIVACY_URL
}
