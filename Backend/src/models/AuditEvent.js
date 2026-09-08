import mongoose from "mongoose";

const auditEventSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    status: { type: String, required: true },
    officerId: { type: String },
    adminId: { type: String },
    evidence: { type: mongoose.Schema.Types.ObjectId, ref: "Evidence" },
    request: { type: mongoose.Schema.Types.ObjectId, ref: "AccessRequest" },
    reason: { type: String },
  },
  { timestamps: true },
);

const AuditEvent = mongoose.models.AuditEvent || mongoose.model("AuditEvent", auditEventSchema);

export default AuditEvent;
