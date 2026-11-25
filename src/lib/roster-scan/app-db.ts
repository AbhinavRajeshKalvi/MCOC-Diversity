import { getDb } from "@/lib/db";
import { getReferences } from "./references";

// Thin wrapper for the web app's analyze route. The shared loader takes a Db so
// the Discord bot can call it with its own connection to the same database.
export async function getAppReferences() {
  return getReferences(await getDb());
}
