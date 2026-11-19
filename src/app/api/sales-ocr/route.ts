export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const PROMPT = `You are a sales data extraction specialist for restaurant operations.
You are shown one or more photos/pages of daily sales reports, POS Z-reports, cash drawer summaries, or handwritten daily sheets.

Extract ALL sales figures clearly visible and return them in JSON.

The restaurant tracks these categories:
- cash_sales: Physical cash sales (not tips)
- pos_sales: Credit/debit card POS sales (not aggregators)
- liquor_sales: Alcohol / liquor / bar sales
- uber_eats_gross: Uber Eats gross sales before commission
- grubhub_gross: Grubhub gross sales before commission
- doordash_gross: DoorDash gross sales before commission
- catering_cash: Catering orders paid in cash
- catering_card: Catering orders paid by card
- catering_cheque: Catering orders paid by cheque/check
- cash_tips: Cash tips collected

Rules:
- Return ONLY the number value (no $ signs, no commas), rounded to 2 decimal places
- If a value is not visible or not applicable, omit that key entirely — do NOT guess
- If you see a total labeled "Total Sales" without breakdown, put it in pos_sales
- CRITICAL: Also extract the date of the sales from the document (business date, report date, or Z-report date). Return it as "date" in YYYY-MM-DD format. If no date is visible, omit the "date" field.

Return ONLY valid JSON, no markdown, no explanation:
{"date": "2024-10-15", "sales": {"cash_sales": 1234.56, "pos_sales": 5678.90}}`;

export async function POST(req: NextRequest) {
  // Auth guard — prevent unauthenticated quota burn
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured on server" }, { status: 500 });
  }

  let body: { images: { type: string; data: string }[]; date?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { images, date } = body;
  if (!images?.length) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  // Build content blocks — PDFs sent natively, images sent as image blocks
  const mediaBlocks: object[] = images.map(img =>
    img.type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: img.data } }
      : { type: "image", source: { type: "base64", media_type: img.type || "image/jpeg", data: img.data } }
  );

  const contentBlocks: object[] = [
    {
      type: "text",
      text: date
        ? `Extract daily sales figures from the following document(s). The operator believes the date is around ${date}, but ALWAYS use the actual date printed on the document if you can read it.`
        : "Extract daily sales figures from the following document(s). Read the date directly from the document.",
    },
    ...mediaBlocks,
    { type: "text", text: PROMPT },
  ];

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        // Include PDF beta header — harmless for images, required for PDF documents
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL_SMART ?? "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: contentBlocks }],
      }),
    });

    const data = await anthropicRes.json();
    if (!anthropicRes.ok) {
      return NextResponse.json(
        { error: data.error?.message ?? `Anthropic returned ${anthropicRes.status}` },
        { status: anthropicRes.status }
      );
    }

    const raw: string = data.content?.[0]?.text ?? "{}";
    // Strip markdown fences if present
    const cleaned = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    let parsed: object;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "Could not parse AI response as JSON", raw }, { status: 502 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reach Anthropic" },
      { status: 502 }
    );
  }
}
