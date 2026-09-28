import assert from "node:assert/strict";
import test from "node:test";
import { extractInvoiceDocument, invoiceDocumentSchema } from "../apps/invoice-qb/extraction.js";

const extracted = { suggestedType: "vendor_bill", partyName: "Acme Supply", invoiceNumber: "A-104", invoiceDate: "2026-09-01", dueDate: "2026-09-30", currency: "CAD", subtotal: "100.00", tax: "5.00", total: "105.00", lineItems: [{ description: "Parts", quantity: "2", rate: "50.00", amount: "100.00" }], uncertainFields: [] };

test("invoice extraction sends the original PDF as a non-stored PDF input and returns normalized fields", async () => {
  let request;
  const client = { responses: { parse: async (value) => { request = value; return { output_parsed: extracted }; } } };
  const result = await extractInvoiceDocument(Buffer.from("synthetic pdf bytes"), { client, model: "test-model" });
  assert.equal(request.store, false);
  assert.equal(request.model, "test-model");
  assert.equal(request.input[0].content[0].type, "input_file");
  assert.match(request.input[0].content[0].file_data, /^data:application\/pdf;base64,/);
  assert.equal(result.total, "105.00");
  assert.equal(result.lineItems[0].quantity, "2");
});

test("extraction schema permits missing values and requires ambiguity markers", () => {
  const missing = invoiceDocumentSchema.parse({ ...extracted, partyName: "", invoiceDate: "", subtotal: null, tax: null, total: null, lineItems: [], uncertainFields: ["partyName", "invoiceDate", "total"] });
  assert.equal(missing.total, null);
  assert.throws(() => invoiceDocumentSchema.parse({ ...extracted, suggestedType: "bill" }));
});
