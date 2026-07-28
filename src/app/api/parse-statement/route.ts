/**
 * Statement Drop: a PDF (card statement or paycheck stub) in, structured
 * transactions out. Claude reads the document server-side and returns
 * schema-validated JSON — dates, merchants, amounts, and a semantic category
 * per transaction that maps onto the user's buckets. Env-gated on
 * ANTHROPIC_API_KEY (same key as the honest recap).
 *
 * Privacy: the PDF passes through Anthropic's API under its retention terms;
 * the model is instructed to never echo account numbers, and only the
 * extracted transaction fields ever reach the client.
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ~6 MB of PDF once base64-decoded — statements are far smaller.
const MAX_BASE64_CHARS = 8_000_000;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "transactions", "paystub"],
  properties: {
    kind: { type: "string", enum: ["statement", "paystub", "other"] },
    transactions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "name", "amount", "category"],
        properties: {
          date: { type: "string", format: "date" },
          name: { type: "string" },
          amount: { type: "number" },
          category: {
            type: "string",
            enum: ["food", "bills", "fun", "investment", "savings", "other"],
          },
        },
      },
    },
    paystub: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["pay_date", "net_pay", "employer"],
          properties: {
            pay_date: { type: "string", format: "date" },
            net_pay: { type: "number" },
            employer: { anyOf: [{ type: "string" }, { type: "null" }] },
          },
        },
      ],
    },
  },
} as const;

const SYSTEM = `You extract financial data from documents for Till Payday, a budgeting app. Rules:

1. If the document is a card or bank statement: extract every CHARGE (money the person spent) as a transaction — positive amounts, ISO dates, a short merchant name. EXCLUDE payments made to the card, refunds, and credits. Include interest and fees (category "bills").
2. Assign each transaction a category by what the merchant sells: restaurants/groceries/delivery = "food"; utilities/rent/insurance/phone/gas/transport/medical = "bills"; streaming/games/bars/entertainment/shopping-for-fun = "fun"; brokerage/retirement transfers = "investment"; transfers to savings = "savings"; anything unclear = "other".
3. If the document is a paycheck stub: set kind "paystub", leave transactions empty, and fill paystub with the NET pay (take-home), the pay date, and the employer name if visible.
4. If it is neither, set kind "other" with empty transactions and null paystub.
5. NEVER include account numbers, card numbers, SSNs, addresses, or balances in any output field. Merchant names only.
6. Cap extraction at 300 transactions (most recent first if you must cut).`;

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { ok: false, reason: "Unconfigured: set ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Not signed in" }, { status: 401 });
  }

  let body: { base64?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "Bad request" }, { status: 400 });
  }
  const base64 = (body.base64 ?? "").replace(/\s/g, "");
  if (!base64) {
    return NextResponse.json({ ok: false, reason: "No file" }, { status: 400 });
  }
  if (base64.length > MAX_BASE64_CHARS) {
    return NextResponse.json(
      { ok: false, reason: "That file is too large — statements are usually well under 6 MB." },
      { status: 413 },
    );
  }

  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          },
          { type: "text", text: "Extract this document per the rules." },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    return NextResponse.json(
      { ok: false, reason: "The reader declined this document — try a different export." },
      { status: 502 },
    );
  }
  if (response.stop_reason === "max_tokens") {
    return NextResponse.json(
      { ok: false, reason: "Statement too long to read in one pass — try one month at a time." },
      { status: 502 },
    );
  }

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const parsed = JSON.parse(text) as {
      kind: string;
      transactions: { date: string; name: string; amount: number; category: string }[];
      paystub: { pay_date: string; net_pay: number; employer: string | null } | null;
    };
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Couldn't read that document — try again." },
      { status: 502 },
    );
  }
}
