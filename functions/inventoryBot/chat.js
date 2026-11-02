/** xAI chat loop for Inventory Bot. Tools are executed by the caller so this file never touches Firestore. */

export const MODEL = "grok-4.3";
export const CHAT_URL = "https://api.x.ai/v1/chat/completions";

const parameters = (properties) => ({ type: "object", properties, additionalProperties: false });
const string = (description) => ({ type: "string", description });

export const TOOLS = [
  { type: "function", function: { name: "search_tickets", description: "Find up to 15 tickets. Filter by source, type, company, rig, LSD, warehouse, or a short text query. Do not ask for every ticket.", parameters: parameters({ query: string("Ticket id, customer, well, or product text"), source: string("xpress or mim"), type: string("Ticket type such as DT or SR"), company: string("uniqenergy or alchem"), rig: string("Rig number"), lsd: string("LSD or UWI"), warehouseCode: string("Warehouse code"), date: string("YYYY-MM-DD") }) } },
  { type: "function", function: { name: "get_ticket", description: "Get one ticket, including its lines and charges, by its document id.", parameters: parameters({ id: string("Document id, for example xpress_WBFS-DT-000529") }) } },
  { type: "function", function: { name: "get_well_inventory", description: "Get one well: app remaining, expected inventory, and the latest receipts, returns, and usage.", parameters: parameters({ wellId: string("Well document id"), name: string("Well name"), rig: string("Rig number"), lsd: string("LSD or UWI") }) } },
  { type: "function", function: { name: "list_issues", description: "List up to 20 check issues. Filter by date, status, severity, or rule.", parameters: parameters({ date: string("YYYY-MM-DD"), status: string("open, resolved, or ignored"), severity: string("high, medium, or low"), rule: string("Rule id") }) } },
  { type: "function", function: { name: "get_warehouse_stock", description: "Get the latest stock snapshot for one warehouse, with the previous on-hand quantity.", parameters: parameters({ warehouseCode: string("Warehouse code"), source: string("xpress or mim") }) } },
  { type: "function", function: { name: "find_product", description: "Find up to 8 products by code or name.", parameters: parameters({ code: string("Warehouse product code"), name: string("Product name") }) } },
];

function limit(text) {
  const value = String(text ?? "");
  return value.length > 8000 ? `${value.slice(0, 8000)}…` : value;
}

export async function completeInventoryChat({ apiKey, messages, runTool, fetchImpl, model = MODEL }) {
  const history = messages.map((message) => ({ ...message }));
  for (let round = 0; round < 4; round += 1) {
    const response = await fetchImpl(CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: history, tools: TOOLS, tool_choice: "auto" }),
    });
    if (!response.ok) throw new Error(`Inventory chat failed (${response.status}).`);
    const payload = await response.json();
    const choice = payload.choices?.[0]?.message;
    if (!choice) throw new Error("Inventory chat returned no answer.");
    const calls = Array.isArray(choice.tool_calls) ? choice.tool_calls.slice(0, 4) : [];
    const assistant = { role: "assistant", content: choice.content || "" };
    if (calls.length) assistant.tool_calls = calls;
    history.push(assistant);
    if (!calls.length) return { reply: choice.content || "I could not find that in the inventory records.", messages: history };
    for (const call of calls) {
      let args = {};
      try { args = JSON.parse(call.function?.arguments || "{}"); } catch { args = {}; }
      let result;
      try { result = await runTool(String(call.function?.name || ""), args && typeof args === "object" ? args : {}); }
      catch (error) { result = { error: error instanceof Error ? error.message : "The inventory lookup failed." }; }
      history.push({ role: "tool", tool_call_id: call.id, content: limit(JSON.stringify(result)) });
    }
  }
  return { reply: "I could not finish that from the inventory records. Ask about one ticket, well, or warehouse.", messages: history };
}
