import { useQuery } from "@tanstack/react-query";
import { focusSessionsApi } from "..";
import { queryKeys } from "../queryKeys";
import { useSession } from "../../state/SessionContext";

/**
 * The focus session still running, or null — what Home's "Right now" section exists to show.
 *
 * Kept in the cache rather than fetched on the spot: starting a session writes it here and
 * finishing or discarding one invalidates it, so the section appears and disappears with the
 * session instead of on Home's next refetch.
 */
export function useCurrentFocusSessionQuery() {
  const { user } = useSession();
  return useQuery({
    queryKey: queryKeys.currentFocusSession(),
    queryFn: () => focusSessionsApi.getCurrentSession(),
    enabled: !!user,
  });
}
