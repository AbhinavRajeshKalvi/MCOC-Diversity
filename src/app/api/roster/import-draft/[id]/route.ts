import { NextRequest, NextResponse } from "next/server";
import { getDb, ObjectId } from "@/lib/db";
import { getSession } from "@/lib/session";
import { SCREENSHOT_IMPORT_ENABLED } from "@/lib/features";
import { withErrorHandling } from "@/lib/api-handler";
import { loadDraft } from "@/lib/roster-scan/drafts";

export const dynamic = "force-dynamic";

/**
 * Screenshots scanned in Discord (/roster-import), for the owner to review on
 * the roster page. Someone else's draft reads as not found.
 */
export const GET = withErrorHandling(
  "GET /api/roster/import-draft/[id]",
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    if (!SCREENSHOT_IMPORT_ENABLED) {
      return NextResponse.json({ error: "Screenshot import is locked while it's under development." }, { status: 403 });
    }

    const draft = await loadDraft(await getDb(), params.id, new ObjectId(session.userId));
    if (!draft) {
      return NextResponse.json(
        { error: "This import has expired or belongs to another account. Run /roster-import in Discord again." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      rows: draft.rows,
      errors: draft.errors,
      screenshotsAnalyzed: draft.screenshots,
      source: draft.source,
      createdAt: draft.createdAt
    });
  }
);
