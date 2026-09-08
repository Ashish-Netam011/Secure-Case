import mongoose from "mongoose";

const evidenceSchema = new mongoose.Schema(
  {
    caseId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    uploadedBy: { type: String, required: true, index: true },
    uploadedByRole: { type: String, required: true },
    filename: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true, index: true },
    data: { type: Buffer, required: true },
    aiAnalysis: {
      analysis: { type: mongoose.Schema.Types.Mixed },
      model: String,
      analyzedAt: Date,
    },
  },
  { timestamps: true },
);

const Evidence = mongoose.models.Evidence || mongoose.model("Evidence", evidenceSchema);

export default Evidence;
