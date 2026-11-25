import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { SCREENSHOT_IMPORT_ENABLED } from "@/lib/features";
import { withErrorHandling } from "@/lib/api-handler";
import { analyzeScreenshots } from "@/lib/roster-scan/analyze";
import { getAppReferences } from "@/lib/roster-scan/app-db";

// Free, local screenshot reading: Tesseract (bundled language data, no CDN)
// finds the cards and plain pixel maths reads the numbers and matches the
// portraits. No paid API and nothing leaves the server.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const POST = withErrorHandling("POST /api/roster/analyze", async (req: NextRequest) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!SCREENSHOT_IMPORT_ENABLED) {
    return NextResponse.json({ error: "Screenshot import is locked while it's under development." }, { status: 403 });
  }

  const formData = await req.formData();
  const files = formData
    .getAll("screenshots")
    .filter((v): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v && "type" in v && "size" in v);

  if (files.length === 0) {
    return NextResponse.json({ error: "Upload at least one roster screenshot." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `You can analyze up to ${MAX_FILES} screenshots at once.` }, { status: 400 });
  }
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: `${file.name} is not a supported image type. Use JPG, PNG, or WebP.` }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `${file.name} is too large. Each screenshot must be 10 MB or smaller.` }, { status: 400 });
    }
  }

  let references;
  try {
    references = await getAppReferences();
  } catch (error) {
    console.error("Roster screenshot analysis could not load champion references:", error);
    return NextResponse.json(
      { error: "The champion list could not be loaded. Check the MongoDB connection and try again. No roster data was changed." },
      { status: 503 }
    );
  }

  const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
  const result = await analyzeScreenshots(buffers, references.refs, references.names);

  if (result.rows.length === 0) {
    const reason = result.errors[0]?.error ?? "No champion cards found.";
    return NextResponse.json({ error: reason }, { status: 422 });
  }

  return NextResponse.json({
    rows: result.rows,
    errors: result.errors.map((e) => ({ file: files[e.screenshot]?.name ?? `Screenshot ${e.screenshot + 1}`, error: e.error })),
    screenshotsAnalyzed: files.length,
    ms: result.ms
  });
});
