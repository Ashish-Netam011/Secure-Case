// Minimal Ollama-shaped mock for testing the fallback path (no secrets involved).
import http from "http";

const analysis = {
  summary: "Mock Nemotron analysis: transfer of INR 4,50,000 involving Vertex Holdings.",
  classification: "Financial Fraud (mock fallback)",
  confidence: 0.8,
  entities: { persons: ["Ramesh Gupta"], organizations: ["Vertex Holdings"], locations: [], dates: ["2026-03-12"] },
  timeline: [{ date: "2026-03-08", event: "Cheque 445120 issued without authorization." }],
  relationships: [{ relationship: "Anil Kapoor coordinated with Vertex Holdings", support: "Email correspondence" }],
  followupEvidence: [{ item: "Bank statement for cheque 445120", whyItMatters: "Confirms the transfer path." }],
};

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/generate") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ model: "nemotron-test:cloud", response: JSON.stringify(analysis) }));
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(5058, () => console.log("ollama mock on :5058"));
