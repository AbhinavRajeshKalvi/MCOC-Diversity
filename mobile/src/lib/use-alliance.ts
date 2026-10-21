import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { api, errorMessage } from "./api";
import { useAuth } from "./auth";
import type { Alliance, Member } from "./types";

/** The alliance and its member list, reloaded whenever the screen comes into view. */
export function useAllianceData() {
  const { user, setSession } = useAuth();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [alliance, setAlliance] = useState<Alliance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ alliance: Alliance; members: Member[] }>("/api/alliance");
      setAlliance(data.alliance);
      setMembers(data.members);
      setError(null);
      // Keep the signed-in member's own role in sync with the list.
      const me = data.members.find((m) => m.id === user?.id);
      if (user && me && (me.role !== user.role || me.battlegroup !== user.battlegroup)) {
        setSession({ ...user, role: me.role, battlegroup: me.battlegroup }, data.alliance);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [user, setSession]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return { alliance, members, error, refreshing, refresh, reload: load, setError };
}

export function useInitialLoad(fn: () => void) {
  useEffect(fn, []); // eslint-disable-line react-hooks/exhaustive-deps
}
