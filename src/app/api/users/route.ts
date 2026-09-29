import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireOfficer } from "@/lib/session";
import { hashPassword, DEFAULT_PASSWORD } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling("GET /api/users", async () => {
  try {
    await requireOfficer();
  } catch {
    return NextResponse.json({ error: "Officers only." }, { status: 403 });
  }

  const db = await getDb();
  const docs = await db.collection("users").find().sort({ displayName: 1 }).toArray();
  const users = docs.map((u) => ({
    id: u._id.toString(),
    username: u.username as string,
    displayName: u.displayName as string,
    role: u.role as "leader" | "officer" | "member",
    battlegroup: (u.battlegroup as 1 | 2 | 3 | null) ?? null,
    mustChangePassword: Boolean(u.mustChangePassword)
  }));

  return NextResponse.json({ users });
});

const schema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Use letters, numbers, dots, dashes or underscores only."),
  displayName: z.string().trim().min(1).max(60),
  role: z.enum(["officer", "member"]).default("member"),
  battlegroup: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]).optional()
});

export const POST = withErrorHandling("POST /api/users", async (req: NextRequest) => {
  try {
    await requireOfficer();
  } catch {
    return NextResponse.json({ error: "Officers only." }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid member details." },
      { status: 400 }
    );
  }
  const { username, displayName, role, battlegroup } = parsed.data;

  const db = await getDb();
  if (battlegroup !== undefined && battlegroup !== null) {
    const memberCount = await db.collection("users").countDocuments({ battlegroup });
    if (memberCount >= 10) {
      return NextResponse.json(
        { error: `Battlegroup ${battlegroup} is full. Each battlegroup can have at most 10 members.` },
        { status: 400 }
      );
    }
  }

  try {
    const hash = hashPassword(DEFAULT_PASSWORD);
    const result = await db.collection("users").insertOne({
      username,
      displayName,
      passwordHash: hash,
      role,
      battlegroup: battlegroup ?? null,
      mustChangePassword: true,
      createdAt: new Date()
    });
    return NextResponse.json({ id: result.insertedId.toString(), defaultPassword: DEFAULT_PASSWORD });
  } catch (err: any) {
    if (err?.code === 11000) {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
    throw err;
  }
});
