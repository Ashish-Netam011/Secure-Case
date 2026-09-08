import mongoose from "mongoose";

const accessRequestSchema = new mongoose.Schema(
  {
    evidence: { type: mongoose.Schema.Types.ObjectId, ref: "Evidence", required: true },
    officerId: { type: String, required: true, index: true },
    officerRole: { type: String, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING", index: true },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
  },
  { timestamps: true },
);

const AccessRequest = mongoose.models.AccessRequest || mongoose.model("AccessRequest", accessRequestSchema);

export default AccessRequest;
