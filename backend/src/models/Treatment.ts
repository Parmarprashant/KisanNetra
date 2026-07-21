/**
 * Treatment model.
 *
 * An agronomist-curated, safety-verified remedy for a specific disease + crop.
 * A treatment can be scoped to regions and seasons and carries both a chemical
 * and an organic option, plus prevention guidance and a citation. Localized
 * summaries (en/hi/gu) let the API serve farmers in their own language.
 *
 * Treatments are looked up on every scan (Phase 4/5) — the treatment.service
 * caches them in Redis, so keep this document lean and query-friendly.
 */
import { Schema, model, Document, Types } from 'mongoose';
import { SUPPORTED_CROPS, type SupportedCrop } from './Scan';
import { LANGUAGES, type Language } from './User';

export const REGION_ALL_INDIA = 'All India';

/** Growing seasons a treatment may apply to (Indian cropping calendar). */
export const SEASONS = ['Kharif', 'Rabi', 'Zaid', 'Year-round'] as const;
export type Season = (typeof SEASONS)[number];

export type TreatmentStatus = 'active' | 'archived';

export interface ChemicalTreatment {
  product?: string;
  dosage?: string;
  method?: string;
  interval?: string;
  pre_harvest_interval?: string;
  safety_notes?: string;
}

export interface OrganicTreatment {
  remedy?: string;
  dosage?: string;
  timing?: string;
}

export interface LocalizedContent {
  summary?: string;
  prevention_text?: string;
}

export interface ITreatment extends Document {
  _id: Types.ObjectId;
  treatment_id: string;
  disease_label: string;
  crop: SupportedCrop;
  regions: string[]; // e.g. ['Gujarat', 'Rajasthan'] or ['All India']
  seasons: Season[];
  chemical: ChemicalTreatment;
  organic: OrganicTreatment;
  prevention: string[];
  source?: string; // citation, e.g. 'ICAR Bulletin 2023, p.14'
  verified_by?: string; // agronomist name
  verified_at?: Date;
  status: TreatmentStatus;
  localized: Partial<Record<Language, LocalizedContent>>;
  createdAt: Date;
  updatedAt: Date;
}

const ChemicalSchema = new Schema<ChemicalTreatment>(
  {
    product: String,
    dosage: String,
    method: String,
    interval: String,
    pre_harvest_interval: String,
    safety_notes: String,
  },
  { _id: false },
);

const OrganicSchema = new Schema<OrganicTreatment>(
  {
    remedy: String,
    dosage: String,
    timing: String,
  },
  { _id: false },
);

const LocalizedSchema = new Schema<LocalizedContent>(
  {
    summary: String,
    prevention_text: String,
  },
  { _id: false },
);

const TreatmentSchema = new Schema<ITreatment>(
  {
    treatment_id: { type: String, required: true, unique: true },
    disease_label: { type: String, required: true },
    crop: { type: String, required: true, enum: SUPPORTED_CROPS },
    regions: { type: [String], default: [REGION_ALL_INDIA] },
    seasons: { type: [String], enum: SEASONS, default: ['Year-round'] },
    chemical: { type: ChemicalSchema, default: {} },
    organic: { type: OrganicSchema, default: {} },
    prevention: { type: [String], default: [] },
    source: String,
    verified_by: String,
    verified_at: Date,
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
    },
    // Fixed, small language set → a nested object (not a Map) keeps `.lean()`
    // reads and `localized[lang]` access simple across the service layer.
    localized: {
      en: { type: LocalizedSchema, default: undefined },
      hi: { type: LocalizedSchema, default: undefined },
      gu: { type: LocalizedSchema, default: undefined },
    },
  },
  { timestamps: true },
);

// Serialization: drop internal Mongoose field.
TreatmentSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.__v;
    return obj;
  },
});

// Primary lookup path: disease + crop + region (+ status filter).
TreatmentSchema.index({ disease_label: 1, crop: 1, regions: 1 });
TreatmentSchema.index({ crop: 1, status: 1 });

export const Treatment = model<ITreatment>('Treatment', TreatmentSchema);

export { SUPPORTED_CROPS, LANGUAGES };
