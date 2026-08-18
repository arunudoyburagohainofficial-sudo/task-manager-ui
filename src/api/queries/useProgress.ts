import { useQuery } from "@tanstack/react-query";
import { streaksApi, weeklyProgressApi } from "..";
import { queryKeys } from "../queryKeys";
import { useSession } from "../../state/SessionContext";

export function useStreakQuery() {
  const { user } = useSession();
  return useQuery({
    queryKey: queryKeys.streak(),
    queryFn: () => streaksApi.getStreak(),
    enabled: !!user,
  });
}

export function useWeeklyProgressQuery() {
  const { user } = useSession();
  return useQuery({
    queryKey: queryKeys.weeklyProgressCurrent(),
    queryFn: () => weeklyProgressApi.getCurrentWeekProgress(),
    enabled: !!user,
  });
}

export function useWeeklyHistoryQuery(weeks = 4) {
  const { user } = useSession();
  return useQuery({
    queryKey: queryKeys.weeklyProgressHistory(weeks),
    queryFn: () => weeklyProgressApi.getHistory(weeks),
    enabled: !!user,
  });
}

export function useAllTimeProgressQuery() {
  const { user } = useSession();
  return useQuery({
    queryKey: queryKeys.weeklyProgressAllTime(),
    queryFn: () => weeklyProgressApi.getAllTimeStats(),
    enabled: !!user,
  });
}
