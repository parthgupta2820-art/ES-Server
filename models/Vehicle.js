import mongoose from 'mongoose';
import { normalizePlate } from '../utils/normalizePlate.js';

const vehicleSchema = new mongoose.Schema(
  {
    numberPlate: {
      type: String,
      required: [true, 'numberPlate is required'],
      unique: true,
      trim: true,
      // The setter normalizes both document saves and query values.
      set: normalizePlate,
    },
    ownerName: {
      type: String,
      required: [true, 'ownerName is required'],
      trim: true,
    },
    vehicleType: {
      type: String,
      trim: true,
      default: null,
    },
    ownerType: {
      type: String,
      trim: true,
      default: null,
    },
    isAuthorized: {
      type: Boolean,
      default: true,
    },
    validUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    // Fail quickly when MongoDB is disconnected instead of buffering queries.
    bufferCommands: false,
  },
);

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

export default Vehicle;
