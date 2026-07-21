/**
 * Multilingual notification templates (en / hi / gu).
 *
 * A single source of truth for notification copy across every channel (in-app,
 * push, SMS, email). Each builder returns a plain `{ title, body }` so the
 * orchestrator can reuse the same text for the persisted Notification, the push
 * payload, the SMS body, and the email. Keep messages short — SMS segments and
 * push bodies are length-sensitive, and many farmers read on low-end devices.
 *
 * Per rules.md (AI/i18n): the language set is fixed and small, so a nested
 * lookup keeps access simple and type-safe.
 */
import type { Language } from '../../models/User';
import type { NotificationType } from '../../models/Notification';

export interface RenderedNotification {
  title: string;
  body: string;
}

/** Fallback language when a requested one is missing (matches treatment i18n). */
const FALLBACK_LANG: Language = 'en';

// ─── scan_result ─────────────────────────────────────────────────────
const scanResult: Record<Language, (disease: string) => RenderedNotification> =
  {
    en: (disease) => ({
      title: 'Scan result ready',
      body: `Your crop scan is complete. Detected: ${disease}. Open the app to view treatment details.`,
    }),
    hi: (disease) => ({
      title: 'स्कैन परिणाम तैयार',
      body: `आपके फसल स्कैन का परिणाम तैयार है। रोग: ${disease}। उपचार देखने के लिए ऐप खोलें।`,
    }),
    gu: (disease) => ({
      title: 'સ્કેન પરિણામ તૈયાર',
      body: `તમારા પાક સ્કેનનું પરિણામ તૈયાર છે. રોગ: ${disease}. સારવાર જોવા એપ ખોલો.`,
    }),
  };

// ─── outbreak_alert ──────────────────────────────────────────────────
const outbreakAlert: Record<
  Language,
  (district: string, disease: string) => RenderedNotification
> = {
  en: (district, disease) => ({
    title: 'Outbreak alert',
    body: `High ${disease} incidence detected in ${district}. Take preventive measures now.`,
  }),
  hi: (district, disease) => ({
    title: 'प्रकोप चेतावनी',
    body: `${district} में ${disease} का प्रकोप बढ़ रहा है। अभी बचाव के उपाय करें।`,
  }),
  gu: (district, disease) => ({
    title: 'ફેલાવાની ચેતવણી',
    body: `${district} માં ${disease}નો ફેલાવો વધ્યો છે. હવે નિવારક પગલાં ભરો.`,
  }),
};

// ─── treatment_reminder ──────────────────────────────────────────────
const treatmentReminder: Record<
  Language,
  (disease: string) => RenderedNotification
> = {
  en: (disease) => ({
    title: 'Treatment follow-up',
    body: `Time to check on your crop for ${disease}. Reapply treatment if symptoms persist.`,
  }),
  hi: (disease) => ({
    title: 'उपचार अनुवर्ती',
    body: `${disease} के लिए अपनी फसल की जाँच करें। लक्षण बने रहने पर फिर से उपचार करें।`,
  }),
  gu: (disease) => ({
    title: 'સારવાર ફોલો-અપ',
    body: `${disease} માટે તમારા પાકની તપાસ કરો. લક્ષણો રહે તો ફરી સારવાર કરો.`,
  }),
};

/**
 * Builders keyed by notification type. Each takes the language plus its own
 * interpolation params and returns rendered { title, body }. Types not covered
 * here (model_updated, feedback_thanks, proposal_reviewed) are rendered from
 * explicit title/body passed to the orchestrator.
 */
export const notificationTemplates = {
  scan_result: (lang: Language, disease: string): RenderedNotification =>
    (scanResult[lang] ?? scanResult[FALLBACK_LANG])(disease),

  outbreak_alert: (
    lang: Language,
    district: string,
    disease: string,
  ): RenderedNotification =>
    (outbreakAlert[lang] ?? outbreakAlert[FALLBACK_LANG])(district, disease),

  treatment_reminder: (lang: Language, disease: string): RenderedNotification =>
    (treatmentReminder[lang] ?? treatmentReminder[FALLBACK_LANG])(disease),
};

export type TemplatedType = keyof typeof notificationTemplates;

export function isTemplatedType(
  type: NotificationType,
): type is TemplatedType & NotificationType {
  return type in notificationTemplates;
}
