import { GoogleGenAI, Type, Schema } from "@google/genai";
import { NextResponse } from "next/server";

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    verses: {
      type: Type.ARRAY,
      description: "List of 5 relevant Bible verses in the NLT translation.",
      items: {
        type: Type.OBJECT,
        properties: {
          reference: {
            type: Type.STRING,
            description: "Book, chapter, and verse reference (e.g. Philippians 4:6-7)",
          },
          text: {
            type: Type.STRING,
            description: "The full Scripture text in the NLT translation.",
          },
          context: {
            type: Type.STRING,
            description: "A 1-2 sentence concise summary explaining why this verse relates to the user topic.",
          },
        },
        required: ["reference", "text", "context"],
      },
    },
  },
  required: ["verses"],
};

export async function POST(req: Request) {
  try {
    const { topic } = await req.json();

    if (!topic || typeof topic !== "string") {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: `You are a biblical scholar. The user wants to search for Bible verses about: "${topic}". 

Provide exactly 5 relevant Bible verses using the New Living Translation (NLT). For each verse, include the reference, the exact text in NLT, and a 1-2 sentence context explaining its application to the topic.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response generated from AI.");
    }

    const parsedData = JSON.parse(resultText);
    return NextResponse.json(parsedData);
  } catch (err: any) {
    console.error("Verse API Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch verses." },
      { status: 500 }
    );
  }
}
