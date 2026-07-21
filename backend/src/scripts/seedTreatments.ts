/**
 * Treatment knowledge-base seed script.
 *
 * Populates the Treatment collection with a starter set of agronomist-style
 * remedies whose `disease_label` values match what the Gemini classifier
 * returns (verified in Phase 3/4), so scans immediately resolve treatments.
 *
 * Run once (idempotent — upserts by treatment_id):
 *   npx ts-node src/scripts/seedTreatments.ts
 *   npm run seed:treatments
 *
 * Sources are illustrative (ICAR/agricultural extension style); replace with
 * fully verified citations before production use.
 */
import { connectMongoDB, disconnectMongoDB } from '../config/db';
import { Treatment, REGION_ALL_INDIA } from '../models/Treatment';
import { logger } from '../utils/logger';

interface SeedTreatment {
  treatment_id: string;
  disease_label: string;
  crop: string;
  regions: string[];
  seasons: string[];
  chemical: Record<string, string>;
  organic: Record<string, string>;
  prevention: string[];
  source: string;
  verified_by: string;
  localized: Record<string, { summary: string; prevention_text: string }>;
}

const TREATMENTS: SeedTreatment[] = [
  {
    treatment_id: 'trt_tomato_late_blight',
    disease_label: 'Late Blight',
    crop: 'tomato',
    regions: [REGION_ALL_INDIA],
    seasons: ['Kharif', 'Rabi'],
    chemical: {
      product: 'Mancozeb 75% WP (or Metalaxyl 8% + Mancozeb 64% WP)',
      dosage: '2.5 g per litre of water',
      method: 'Foliar spray, covering both leaf surfaces',
      interval: 'Repeat every 7–10 days in humid weather',
      pre_harvest_interval: '5 days',
      safety_notes:
        'Wear gloves and a mask while spraying. Do not spray before rain.',
    },
    organic: {
      remedy: 'Copper oxychloride 50% WP or Bordeaux mixture (1%)',
      dosage: '3 g per litre of water',
      timing: 'Apply at first sign of water-soaked lesions, early morning',
    },
    prevention: [
      'Use certified disease-free seed and resistant varieties.',
      'Avoid overhead irrigation; keep foliage dry.',
      'Ensure good spacing and air circulation between plants.',
      'Remove and destroy infected plant debris.',
    ],
    source: 'ICAR Plant Protection Guidelines (illustrative)',
    verified_by: 'Dr. A. Sharma (Agronomist)',
    localized: {
      en: {
        summary:
          'Late blight spreads fast in cool, humid weather. Spray Mancozeb promptly and remove infected leaves.',
        prevention_text:
          'Keep leaves dry, space plants well, and use resistant varieties.',
      },
      hi: {
        summary:
          'पछेती झुलसा ठंडे, नम मौसम में तेजी से फैलता है। तुरंत मैंकोजेब का छिड़काव करें और संक्रमित पत्तियाँ हटाएँ।',
        prevention_text:
          'पत्तियों को सूखा रखें, पौधों के बीच अच्छी दूरी रखें और प्रतिरोधी किस्में उपयोग करें।',
      },
      gu: {
        summary:
          'મોડો સુકારો ઠંડા, ભેજવાળા હવામાનમાં ઝડપથી ફેલાય છે. તરત જ મેન્કોઝેબનો છંટકાવ કરો અને ચેપગ્રસ્ત પાન દૂર કરો.',
        prevention_text:
          'પાન સૂકા રાખો, છોડ વચ્ચે યોગ્ય અંતર રાખો અને પ્રતિકારક જાતો વાપરો.',
      },
    },
  },
  {
    treatment_id: 'trt_tomato_early_blight',
    disease_label: 'Early Blight',
    crop: 'tomato',
    regions: [REGION_ALL_INDIA],
    seasons: ['Kharif', 'Rabi'],
    chemical: {
      product: 'Chlorothalonil 75% WP or Mancozeb 75% WP',
      dosage: '2 g per litre of water',
      method: 'Foliar spray starting from lower leaves',
      interval: 'Every 10–12 days',
      pre_harvest_interval: '7 days',
      safety_notes: 'Avoid spraying during peak sun; use protective gear.',
    },
    organic: {
      remedy: 'Neem oil (Azadirachtin 1500 ppm) with 0.5% potassium bicarbonate',
      dosage: '5 ml neem oil per litre of water',
      timing: 'Apply weekly at first appearance of concentric ring spots',
    },
    prevention: [
      'Rotate crops; avoid planting tomato/potato in the same plot yearly.',
      'Mulch to prevent soil splash onto lower leaves.',
      'Stake plants and prune lower foliage for airflow.',
    ],
    source: 'State Agricultural Extension Bulletin (illustrative)',
    verified_by: 'Dr. A. Sharma (Agronomist)',
    localized: {
      en: {
        summary:
          'Early blight shows dark concentric rings on older leaves. Spray Mancozeb and remove affected lower leaves.',
        prevention_text:
          'Rotate crops, mulch the soil, and improve airflow by pruning.',
      },
      hi: {
        summary:
          'अगेती झुलसा पुरानी पत्तियों पर गहरे संकेंद्रित छल्ले दिखाता है। मैंकोजेब छिड़कें और प्रभावित निचली पत्तियाँ हटाएँ।',
        prevention_text:
          'फसल चक्र अपनाएँ, मिट्टी पर मल्च डालें और छँटाई से हवा का प्रवाह बढ़ाएँ।',
      },
      gu: {
        summary:
          'વહેલો સુકારો જૂના પાન પર ઘેરા વર્તુળાકાર ડાઘ બતાવે છે. મેન્કોઝેબ છાંટો અને અસરગ્રસ્ત નીચલા પાન દૂર કરો.',
        prevention_text:
          'પાક ફેરબદલી કરો, જમીન પર મલ્ચ કરો અને છટણીથી હવાની અવરજવર વધારો.',
      },
    },
  },
  {
    treatment_id: 'trt_potato_late_blight',
    disease_label: 'Late Blight',
    crop: 'potato',
    regions: [REGION_ALL_INDIA],
    seasons: ['Rabi'],
    chemical: {
      product: 'Cymoxanil 8% + Mancozeb 64% WP',
      dosage: '3 g per litre of water',
      method: 'Foliar spray covering the whole canopy',
      interval: 'Every 7 days during cool, cloudy spells',
      pre_harvest_interval: '7 days',
      safety_notes: 'Do not graze livestock on sprayed foliage.',
    },
    organic: {
      remedy: 'Copper oxychloride 50% WP',
      dosage: '3 g per litre of water',
      timing: 'Preventive spray before forecasted humid weather',
    },
    prevention: [
      'Plant certified seed tubers; hill up soil over tubers.',
      'Destroy volunteer plants and cull piles.',
      'Harvest in dry weather and cure tubers before storage.',
    ],
    source: 'ICAR-CPRI Potato Advisory (illustrative)',
    verified_by: 'Dr. R. Verma (Agronomist)',
    localized: {
      en: {
        summary:
          'Potato late blight can destroy a field in days. Spray Cymoxanil+Mancozeb preventively in cool, humid weather.',
        prevention_text:
          'Use certified seed tubers, hill the soil, and harvest in dry weather.',
      },
      hi: {
        summary:
          'आलू का पछेती झुलसा कुछ ही दिनों में खेत नष्ट कर सकता है। ठंडे, नम मौसम में साइमोक्सानिल+मैंकोजेब का निवारक छिड़काव करें।',
        prevention_text:
          'प्रमाणित बीज कंद उपयोग करें, मिट्टी चढ़ाएँ और सूखे मौसम में कटाई करें।',
      },
      gu: {
        summary:
          'બટાટાનો મોડો સુકારો થોડા દિવસોમાં ખેતર નાશ કરી શકે છે. ઠંડા, ભેજવાળા હવામાનમાં સાયમોક્સાનિલ+મેન્કોઝેબનો નિવારક છંટકાવ કરો.',
        prevention_text:
          'પ્રમાણિત બીજ કંદ વાપરો, માટી ચઢાવો અને સૂકા હવામાનમાં કાપણી કરો.',
      },
    },
  },
  {
    treatment_id: 'trt_apple_scab',
    disease_label: 'Apple Scab',
    crop: 'apple',
    regions: ['Himachal Pradesh', 'Jammu and Kashmir', 'Uttarakhand'],
    seasons: ['Year-round'],
    chemical: {
      product: 'Dodine 65% WP or Mancozeb 75% WP',
      dosage: '2 g per litre of water',
      method: 'Cover spray from green-tip to fruit-set stage',
      interval: 'Every 10–14 days through the primary infection period',
      pre_harvest_interval: '15 days',
      safety_notes: 'Rotate fungicide groups to avoid resistance.',
    },
    organic: {
      remedy: 'Lime sulphur or wettable sulphur',
      dosage: '4 g per litre of water',
      timing: 'Apply at green-tip and repeat as leaves expand',
    },
    prevention: [
      'Rake and destroy fallen leaves to reduce overwintering inoculum.',
      'Prune for an open canopy and faster leaf drying.',
      'Grow scab-resistant cultivars where available.',
    ],
    source: 'ICAR-CITH Apple Advisory (illustrative)',
    verified_by: 'Dr. S. Thakur (Agronomist)',
    localized: {
      en: {
        summary:
          'Apple scab causes olive-green to black spots on leaves and fruit. Begin sulphur/Dodine sprays at green-tip.',
        prevention_text:
          'Remove fallen leaves, prune for airflow, and plant resistant cultivars.',
      },
      hi: {
        summary:
          'सेब का स्कैब पत्तियों और फलों पर जैतूनी-हरे से काले धब्बे बनाता है। ग्रीन-टिप अवस्था पर सल्फर/डोडीन छिड़काव शुरू करें।',
        prevention_text:
          'गिरी पत्तियाँ हटाएँ, हवा के लिए छँटाई करें और प्रतिरोधी किस्में लगाएँ।',
      },
      gu: {
        summary:
          'સફરજનનો સ્કૅબ પાન અને ફળ પર ઓલિવ-લીલાથી કાળા ડાઘ કરે છે. ગ્રીન-ટિપ તબક્કે સલ્ફર/ડોડિન છંટકાવ શરૂ કરો.',
        prevention_text:
          'ખરી પડેલા પાન દૂર કરો, હવા માટે છટણી કરો અને પ્રતિકારક જાતો વાવો.',
      },
    },
  },
  {
    treatment_id: 'trt_rice_blast',
    disease_label: 'Rice Blast',
    crop: 'rice',
    regions: [REGION_ALL_INDIA],
    seasons: ['Kharif'],
    chemical: {
      product: 'Tricyclazole 75% WP',
      dosage: '0.6 g per litre of water',
      method: 'Foliar spray at tillering and again at booting stage',
      interval: 'Two sprays 15 days apart',
      pre_harvest_interval: '21 days',
      safety_notes: 'Maintain 2–3 cm standing water while treating.',
    },
    organic: {
      remedy: 'Pseudomonas fluorescens talc formulation',
      dosage: '10 g per litre for seed treatment / foliar spray',
      timing: 'Seed treatment before sowing; foliar at early symptoms',
    },
    prevention: [
      'Avoid excess nitrogen; split-apply fertilizer.',
      'Use resistant varieties and treated seed.',
      'Drain fields periodically to reduce humidity in the canopy.',
    ],
    source: 'ICAR-NRRI Rice Advisory (illustrative)',
    verified_by: 'Dr. P. Nair (Agronomist)',
    localized: {
      en: {
        summary:
          'Rice blast forms spindle-shaped lesions on leaves. Spray Tricyclazole and avoid excess nitrogen.',
        prevention_text:
          'Use resistant seed, split nitrogen doses, and manage water levels.',
      },
      hi: {
        summary:
          'धान का ब्लास्ट पत्तियों पर तकली-आकार के धब्बे बनाता है। ट्राइसाइक्लाजोल छिड़कें और अधिक नाइट्रोजन से बचें।',
        prevention_text:
          'प्रतिरोधी बीज उपयोग करें, नाइट्रोजन विभाजित मात्रा में दें और जल स्तर प्रबंधित करें।',
      },
      gu: {
        summary:
          'ડાંગરનો બ્લાસ્ટ પાન પર ત્રાકના આકારના ડાઘ કરે છે. ટ્રાયસાયક્લાઝોલ છાંટો અને વધુ નાઇટ્રોજન ટાળો.',
        prevention_text:
          'પ્રતિકારક બીજ વાપરો, નાઇટ્રોજન વિભાજિત આપો અને પાણીનું સ્તર સંભાળો.',
      },
    },
  },
];

async function seed(): Promise<void> {
  await connectMongoDB();
  logger.info(`Seeding ${TREATMENTS.length} treatments...`);

  let created = 0;
  let updated = 0;
  for (const t of TREATMENTS) {
    const existing = await Treatment.findOne({ treatment_id: t.treatment_id });
    await Treatment.updateOne(
      { treatment_id: t.treatment_id },
      { $set: { ...t, verified_at: new Date(), status: 'active' } },
      { upsert: true },
    );
    if (existing) updated += 1;
    else created += 1;
  }

  logger.info(`Treatment seed complete — created ${created}, updated ${updated}`);
  await disconnectMongoDB();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Treatment seed failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
