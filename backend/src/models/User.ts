/**
 * User model.
 *
 * Central identity for all actors: farmers, extension officers, agronomists,
 * and admins. Passwords are hashed with bcrypt via a pre-save hook and are
 * never selected by default (`select: false`), so they cannot leak into API
 * responses unless explicitly requested.
 */
import { Schema, model, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export type Role = 'farmer' | 'extension_officer' | 'agronomist' | 'admin';
export type Language = 'en' | 'hi' | 'gu';

export const ROLES = [
  'farmer',
  'extension_officer',
  'agronomist',
  'admin',
] as const;
export const LANGUAGES = ['en', 'hi', 'gu'] as const;

const BCRYPT_ROUNDS = 12;

export interface IUser extends Document {
  _id: Types.ObjectId;
  user_id: string;
  name: string;
  email?: string;
  phone?: string;
  password: string;
  role: Role;
  language: Language;
  region?: string; // district — used by extension officers' regional scope
  state?: string;
  is_active: boolean;
  is_deleted: boolean;
  last_login?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    user_id: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
      unique: true,
    },
    phone: { type: String, trim: true, sparse: true, unique: true },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ROLES,
      default: 'farmer',
      index: true,
    },
    language: { type: String, enum: LANGUAGES, default: 'en' },
    region: { type: String, trim: true },
    state: { type: String, trim: true },
    is_active: { type: Boolean, default: true },
    // Admin soft-delete (Phase 9). Distinct from is_active (suspension): a
    // deleted user is hidden from listings and cannot authenticate.
    is_deleted: { type: Boolean, default: false },
    last_login: Date,
  },
  { timestamps: true },
);

// Hash password whenever it is set or changed.
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
  next();
});

UserSchema.methods.comparePassword = function (
  this: IUser,
  candidate: string,
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

// Never expose password / internal Mongoose fields in serialized output.
UserSchema.set('toJSON', {
  virtuals: false,
  transform: (_doc, ret) => {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.password;
    delete obj.__v;
    return obj;
  },
});

UserSchema.index({ role: 1, region: 1 });

export const User = model<IUser>('User', UserSchema);
