import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { SCREENSHOT_IMPORT_ENABLED } from "@/lib/features";
import { withErrorHandling } from "@/lib/api-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GEMINI_MAX_RETRIES = 2;
const GEMINI_REQUEST_TIMEOUT_MS = 120_000;

const detectedSchema = z.object({
  name: z.string().min(1).max(120),
  stars: z.number().int().min(0).max(7),
  rating: z.number().int().min(0),
  awakenedEvidence: z.enum(["silver_stars", "gold_stars", "unknown"]),
  ascendedEvidence: z.enum(["lavender_border", "normal_border", "unknown"])
});

const responseSchema = z.object({
  champions: z.array(detectedSchema).max(500)
});

type DetectedChampion = z.infer<typeof detectedSchema>;

type ChampionDoc = {
  _id: { toString(): string };
  name: string;
};

function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
}

function similarity(a: string, b: string): number {
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length, 1);
}

function matchChampion(name: string, champions: ChampionDoc[]): ChampionDoc | null {
  const normalized = normalizeName(name);
  if (!normalized) return null;

  const exact = champions.find((champion) => normalizeName(champion.name) === normalized);
  if (exact) return exact;

  let best: { champion: ChampionDoc; score: number } | null = null;
  for (const champion of champions) {
    const score = similarity(normalized, normalizeName(champion.name));
    if (!best || score > best.score) best = { champion, score };
  }

  // Be conservative. The review screen can handle anything that does not pass this threshold.
  return best && best.score >= 0.86 ? best.champion : null;
}

function mergeDetected(a: DetectedChampion, b: DetectedChampion): DetectedChampion {
  return {
    name: a.name,
    stars: a.stars || b.stars,
    rating: a.rating || b.rating,
    awakenedEvidence: a.awakenedEvidence === "unknown" ? b.awakenedEvidence : a.awakenedEvidence,
    ascendedEvidence: a.ascendedEvidence === "unknown" ? b.ascendedEvidence : a.ascendedEvidence
  };
}

function toNullableNumber(value: number): number | null {
  return value === 0 ? null : value;
}

function evidenceToAwakened(value: "silver_stars" | "gold_stars" | "unknown"): boolean | null {
  if (value === "unknown") return null;
  return value === "silver_stars";
}

function evidenceToAscended(value: "lavender_border" | "normal_border" | "unknown"): boolean | null {
  if (value === "unknown") return null;
  return value === "lavender_border";
}

export const POST = withErrorHandling("POST /api/roster/analyze", async (req: NextRequest) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!SCREENSHOT_IMPORT_ENABLED) {
    return NextResponse.json({ error: "Screenshot import is locked while it's under development." }, { status: 403 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured. Add it to .env.local." },
      { status: 503 }
    );
  }

  const formData = await req.formData();
  const files = formData
    .getAll("screenshots")
    .filter((value): value is File =>
      typeof value === "object" &&
      value !== null &&
      "arrayBuffer" in value &&
      "type" in value &&
      "size" in value
    );

  if (files.length === 0) {
    return NextResponse.json({ error: "Upload at least one roster screenshot." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `You can analyze up to ${MAX_FILES} screenshots at once.` }, { status: 400 });
  }

  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  for (const file of files) {
    if (!allowedTypes.has(file.type)) {
      return NextResponse.json({ error: `${file.name} is not a supported image type. Use JPG, PNG, or WebP.` }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `${file.name} is too large. Each screenshot must be 10 MB or smaller.` }, { status: 400 });
    }
  }

  let db;
  try {
    db = await getDb();
  } catch (error) {
    console.error("Roster screenshot analysis could not connect to MongoDB:", error);
    return NextResponse.json(
      {
        error: "MongoDB is temporarily unreachable. Check your MongoDB Atlas connection/network access and try again. No roster data was changed."
      },
      { status: 503 }
    );
  }

  let champions: ChampionDoc[];
  try {
    champions = (await db
      .collection("champions")
      .find({}, { projection: { _id: 1, name: 1 } })
      .sort({ name: 1 })
      .toArray()) as unknown as ChampionDoc[];
  } catch (error) {
    console.error("Roster screenshot analysis could not read champion master list:", error);
    return NextResponse.json(
      {
        error: "MongoDB is connected but the champion list could not be read. Check your Atlas connection and try again. No roster data was changed."
      },
      { status: 503 }
    );
  }

  const championNames = champions.map((champion) => champion.name);

  const prompt = `You are extracting data from ONE Marvel Contest of Champions roster screenshot.

Identify every champion card actually visible in this image. Do not guess or infer values that cannot be read.

For each visible champion return:
- name: the champion's displayed name
- stars: displayed star count; use 0 only if unreadable
- rating: displayed champion rating / PI; use 0 only if unreadable
- awakenedEvidence: exactly one of "silver_stars", "gold_stars", "unknown"
- ascendedEvidence: exactly one of "lavender_border", "normal_border", "unknown"

MCOC visual rules:
- AWAKENED: SILVER/light-gray stars mean awakened. GOLD/yellow-gold stars mean NOT awakened. Judge the actual star-row color on the champion card only.
- ASCENDED: for 7-star champions, a distinct LAVENDER/light-purple vertical card border means ascended. A normal non-lavender border means not ascended. Judge the actual card border only.
- Do not infer awakening or ascension from champion identity, rating, abilities, or game knowledge.
- If either visual indicator is ambiguous because of compression, glare, overlap, or resolution, use "unknown".
- Read the champion name and rating from the card itself.
- Return each visible champion once.
- Ignore navigation, filters, currencies, player information, and other non-champion UI.

Current champion master list. Prefer these exact names when they match what you see:
${championNames.join("\n")}`;

  const responseSchemaForGemini = {
    type: "object",
    properties: {
      champions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            stars: { type: "integer" },
            rating: { type: "integer" },
            awakenedEvidence: { type: "string", enum: ["silver_stars", "gold_stars", "unknown"] },
            ascendedEvidence: { type: "string", enum: ["lavender_border", "normal_border", "unknown"] }
          },
          required: ["name", "stars", "rating", "awakenedEvidence", "ascendedEvidence"]
        }
      }
    },
    required: ["champions"]
  };

  async function analyzeOne(file: File): Promise<DetectedChampion[]> {
    const bytes = Buffer.from(await file.arrayBuffer());
    const imagePart = {
      inlineData: {
        mimeType: file.type,
        data: bytes.toString("base64")
      }
    };

    const requestBody = {
      contents: [{ role: "user", parts: [{ text: prompt }, imagePart] }],
      generationConfig: {
        temperature: 0,
        // Gemini 3.6 Flash uses thinkingLevel rather than the older
        // thinkingBudget setting. Minimal thinking is enough for this
        // deterministic screenshot/OCR extraction task.
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingLevel: "minimal" },
        responseMimeType: "application/json",
        responseSchema: responseSchemaForGemini
      }
    };

    let response: Response | null = null;
    let geminiData: any = null;
    let lastTransientMessage = "";

    for (let attempt = 1; attempt <= GEMINI_MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
          {
            method: "POST",
            signal: controller.signal,
            headers: {
              "x-goog-api-key": apiKey!,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
          }
        );
        geminiData = await response.json().catch(() => null);

        if (response.ok) break;

        const message = geminiData?.error?.message || `Gemini returned HTTP ${response.status}.`;
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        lastTransientMessage = message;
        console.error(`Gemini HTTP ${response.status} for ${file.name} (attempt ${attempt}/${GEMINI_MAX_RETRIES}):`, message);

        if (!retryable || attempt === GEMINI_MAX_RETRIES) {
          throw new Error(`${file.name}: ${message}`);
        }

        const delayMs = Math.min(10_000, 2000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 500);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          lastTransientMessage = `Gemini request timed out after ${Math.round(GEMINI_REQUEST_TIMEOUT_MS / 1000)} seconds.`;
          if (attempt === GEMINI_MAX_RETRIES) {
            throw new Error(`${file.name}: ${lastTransientMessage}`);
          }
          const delayMs = Math.min(10_000, 2000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 500);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }

    if (!response || !geminiData) {
      throw new Error(`${file.name}: Gemini did not return a usable response${lastTransientMessage ? `: ${lastTransientMessage}` : "."}`);
    }

    if (!response.ok) {
      const message = geminiData?.error?.message;
      throw new Error(`${file.name}: ${message || `Gemini returned HTTP ${response.status}.`}`);
    }

    const finishReason = geminiData?.candidates?.[0]?.finishReason;
    const content = geminiData?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join("")
      .trim();

    if (!content) {
      throw new Error(`${file.name}: Gemini returned no usable data${finishReason ? ` (finish reason: ${finishReason})` : ""}.`);
    }

    if (finishReason === "MAX_TOKENS") {
      console.error(`Gemini hit MAX_TOKENS for ${file.name}; output length=${content.length}`);
      throw new Error(`${file.name}: Gemini truncated its JSON response (MAX_TOKENS).`);
    }

    let parsedJson: unknown;
    try {
      const cleaned = content
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      parsedJson = JSON.parse(cleaned);
    } catch {
      console.error(`Gemini invalid JSON for ${file.name}:`, content.slice(0, 2000));
      throw new Error(`${file.name}: Gemini returned invalid JSON.`);
    }

    const parsed = responseSchema.safeParse(parsedJson);
    if (!parsed.success) {
      console.error(`Gemini schema mismatch for ${file.name}:`, parsed.error.flatten());
      throw new Error(`${file.name}: Gemini returned an unexpected result.`);
    }
    return parsed.data.champions;
  }

  // Analyze each screenshot separately. This is more reliable than sending five
  // large roster images in one multimodal request and also keeps each request
  // comfortably below Gemini's inline-image request-size limit.
  const allDetected: DetectedChampion[] = [];
  for (const file of files) {
    try {
      const detected = await analyzeOne(file);
      allDetected.push(...detected);
    } catch (error) {
      console.error("Roster screenshot analysis failed:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Gemini could not analyze the screenshots." },
        { status: 502 }
      );
    }
  }

  const merged = new Map<string, DetectedChampion>();
  for (const detected of allDetected) {
    const matched = matchChampion(detected.name, champions);
    const key = matched ? matched._id.toString() : `unmatched:${normalizeName(detected.name)}`;
    const existing = merged.get(key);
    merged.set(key, existing ? mergeDetected(existing, detected) : detected);
  }

  const results = Array.from(merged.entries()).map(([key, detected]) => {
    const matched = key.startsWith("unmatched:") ? null : champions.find((champion) => champion._id.toString() === key);
    return {
      name: detected.name,
      stars: toNullableNumber(detected.stars),
      rating: toNullableNumber(detected.rating),
      awakened: evidenceToAwakened(detected.awakenedEvidence),
      ascended: evidenceToAscended(detected.ascendedEvidence),
      championId: matched?._id.toString() ?? null,
      matchedName: matched?.name ?? null
    };
  });

  results.sort((a, b) => (a.matchedName ?? a.name).localeCompare(b.matchedName ?? b.name));

  return NextResponse.json({ champions: results, model: GEMINI_MODEL, screenshotsAnalyzed: files.length });
});
