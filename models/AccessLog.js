import mongoose from 'mongoose';
import { normalizePlate } from '../utils/normalizePlate.js';

const accessLogSchema = new mongoose.Schema(
  {
    numberPlate: {
      type: String,
      set: (value) => (value ? normalizePlate(value) : null),
      default: null,
    },
    deviceId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    authorized: {
      type: Boolean,
      required: true,
    },
    gateAction: {
      type: String,
      required: true,
      enum: ['OPEN', 'CLOSED'],
    },
    reason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    requestId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
  },
  {
    versionKey: false,
    // Fail quickly when MongoDB is disconnected instead of buffering queries.
    bufferCommands: false,
  },
);

// Access logs are always listed newest first.
accessLogSchema.index({ timestamp: -1 });

const AccessLog = mongoose.model('AccessLog', accessLogSchema);

export default AccessLog;
