import { PlannerWebView } from "@/components/PlannerWebView";

// Officers: edit members' rosters, and (for game-data editors) the champion list.
export default function AdminScreen() {
  return <PlannerWebView path="/admin" />;
}
