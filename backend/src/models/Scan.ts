/**
 * Scan model.
 *
 * A scan is a single crop-disease diagnosis: the uploaded (processed) leaf
 * image plus the AI prediction and a link to the recommended treatment
 * (Phase 5). Location is stored as GeoJSON for outbreak heatmaps / 2dsphere
 * queries (Phase 8).
 */
import { Schema, model, Document, Types } from 'mongoose';
import { LANGUAGES, type Language } from './User';

/** Crops the scan pipeline accepts. Mirrors the classification prompt. */
export const SUPPORTED_CROPS = [
  'tomato',
  'potato',
  'pepper',
  'maize',
  'wheat',
  'rice',
  'groundnut',
  'apple',
] as const;

export type SupportedCrop = (typeof SUPPORTED_CROPS)[number];

export type ScanStatus = 'pending' | 'processed' | 'failed';
export type ScanFeedback = 'correct' | 'incorrect';

interface TopKPrediction {
  label: string;
  confidence: number;
}

export interface IScan extends Document {
  _id: Types.ObjectId;
  scan_id: string;
  user_id: Types.ObjectId;
  device_id?: string;
  image_url: string;
  image_s3_key: string;
  crop_type: SupportedCrop;
  location: { type: 'Point'; coordinates: [number, number] };
  prediction: {
    disease_label: string;
    scientific_name: string;
    confidence: number;
    is_healthy: boolean;
    top_k: TopKPrediction[];
    model_version: string;
    low_confidence: boolean;
  };
  treatment_ref?: Types.ObjectId;
  feedback: ScanFeedback | null;
  offline_queued_at?: Date;
  processed_at?: Date;
  language: Language;
  status: ScanStatus;
  is_deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TopKSchema = new Schema<TopKPrediction>(
  {
    label: { type: String, required: true },
    confidence: { type: Number, required: true },
  },
  { _id: false },
);

const ScanSchema = new Schema<IScan>(
  {
    scan_id: { type: String, required: true, unique: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    device_id: String, // hashed device fingerprint (guest / offline sync)
    image_url: { type: String, required: true },
    image_s3_key: { type: String, required: true },
    crop_type: { type: String, required: true, enum: SUPPORTED_CROPS },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: { type: [Number], default: [0, 0] }, // [lon, lat]
    },
    prediction: {
      disease_label: String,
      scientific_name: String,
      confidence: Number,
      is_healthy: { type: Boolean, default: false },
      top_k: { type: [TopKSchema], default: [] },
      model_version: String,
      low_confidence: { type: Boolean, default: false },
    },
    treatment_ref: { type: Schema.Types.ObjectId, ref: 'Treatment' },
    feedback: {
      type: String,
      enum: ['correct', 'incorrect', null],
      default: null,
    },
    offline_queued_at: Date,
    processed_at: Date,
    language: { type: String, enum: LANGUAGES, default: 'en' },
    status: {
      type: String,
      enum: ['pending', 'processed', 'failed'],
      default: 'processed',
    },
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Serialization: drop internal fields.
ScanSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.__v;
    delete obj.image_s3_key; // internal storage key — not for clients
    return obj;
  },
});

ScanSchema.index({ location: '2dsphere' });
ScanSchema.index({ user_id: 1, createdAt: -1 });
ScanSchema.index({ 'prediction.disease_label': 1, createdAt: -1 });
ScanSchema.index({ crop_type: 1, 'prediction.disease_label': 1 });

export const Scan = model<IScan>('Scan', ScanSchema);
