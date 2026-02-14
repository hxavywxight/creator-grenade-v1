import OpenAI from "openai";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { mode, title, contentType } = await req.json();

    if (!title) {
      return Response.json({ error: "Missing title" }, { status: 400 });
    }

    const prompt =
      mode === "hooks"
        ? `Generate 12 powerful scroll-stopping hooks for a ${contentType || "content piece"} titled "${title}". Short. Punchy. No emojis.`
        : `Generate 10 creative repurpose angles for a ${contentType || "content piece"} titled "${title}". Each should feel like a distinct content idea.`;

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
    });

    const text =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "";

    const items = text
      .split("\n")
      .map((line) =>
        line.replace(/^\s*[-*\d.)]+\s*/, "").trim()
      )
      .filter(Boolean);

    return Response.json({ items });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "AI error" },
      { status: 500 }
    );
  }
}