import { NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/accounts";

export async function POST() {
  return clearSessionCookies(NextResponse.json({ ok: true }));
}
