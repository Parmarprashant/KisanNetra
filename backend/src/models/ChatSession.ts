/**
 * ChatSession model (Phase 6).
 *
 * Stores a farmer's conversation with the RAG assistant. Messages accumulate on
 * the session; only the most recent turns are replayed to the LLM (history
 * trimming lives in chat.service, per rules.md "Context size limits").
 */
import { Schema, model, Document, Types } from 'mongoose';

export type ChatRole = 'user' | 'assistant';

export interface IChatMessage {
  role: ChatRole;
  content: string;
  timestamp: Date;
}

export interface IChatSession extends Document {
  _id: Types.ObjectId;
  session_id: string;
  user_id: Types.ObjectId;
  messages: IChatMessage[];
  context_scan_id?: string; // scan this conversation is grounded to, if any
  createdAt: Date;
  updatedAt: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const ChatSessionSchema = new Schema<IChatSession>(
  {
    session_id: { type: String, required: true, unique: true },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    messages: { type: [ChatMessageSchema], default: [] },
    context_scan_id: String,
  },
  { timestamps: true },
);

// Serialization: drop internal Mongoose field.
ChatSessionSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.__v;
    return obj;
  },
});

ChatSessionSchema.index({ user_id: 1, updatedAt: -1 });

export const ChatSession = model<IChatSession>(
  'ChatSession',
  ChatSessionSchema,
);
