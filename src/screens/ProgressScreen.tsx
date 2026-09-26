import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useGoalsQuery } from "../api/queries/useGoals";
import {
  useAllTimeProgressQuery,
  useStreakQuery,
  useWeeklyHistoryQuery,
  useWeeklyProgressQuery,
} from "../api/queries/useProgress";
import { useTasksQuery } from "../api/queries/useTasks";
import {
  CountPill,
  Ferne,
  GhostRing,
  GoalRingCard,
  Hairline,
  InfoTooltip,
  PanelCard,
  PlusMark,
  ScreenContainer,
  SectionLabel,
  Segmented,
  StreakIconInline,
} from "../components";
import { space, textAtDesignSize as ds, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import { formatMinutes, formatShortDate } from "../utils/format";
import { goalsRowLayout } from "../utils/goalsLayout";

type Period = "week" | "month" | "all";

/** The gap between goal cards — shared by the row's style and its width arithmetic. */
const GOALS_ROW_GAP = 9;

/** Monday-first, matching the week the server starts its rows on. */
const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * Progress — transcribed from the final screens 3a–3e.
 *
 * The period switch moved directly under the title because it governs everything below it, four
 * bordered stat boxes became one card split by hairlines, and the empty goals slot became a
 * tappable ghost row rather than a dead sentence. Goals sit inside the period sections now; they
 * are still read-only here, since Home is where a goal is made and edited.
 */
export function ProgressScreen() {
  const [period, setPeriod] = useState<Period>("week");
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  const streakQuery = useStreakQuery();
  const weeklyQuery = useWeeklyProgressQuery();
  const completedTasksQuery = useTasksQuery("completed");
  const monthHistoryQuery = useWeeklyHistoryQuery(4);
  const allTimeQuery = useAllTimeProgressQuery();
  const goalsQuery = useGoalsQuery();

  const goals = goalsQuery.data ?? [];
  // space.gutter each side, matching styles.content — the row's real drawable width.
  const { width: screenWidth } = useWindowDimensions();
  const goalsLayout = goalsRowLayout(screenWidth - 2 * space.gutter, goals.length, GOALS_ROW_GAP);

  // Only truthy once every source query has data — the same gating the JSX below relies on.
  const data = useMemo(() => {
    const streak = streakQuery.data;
    const weekly = weeklyQuery.data;
    const completedTasks = completedTasksQuery.data;
    const monthHistory = monthHistoryQuery.data;
    const allTime = allTimeQuery.data;
    if (!streak || !weekly || !completedTasks || !monthHistory || !allTime) return null;
    return { streak, weekly, completedTasks, monthHistory, allTime };
  }, [streakQuery.data, weeklyQuery.data, completedTasksQuery.data, monthHistoryQuery.data, allTimeQuery.data]);

  /**
   * How much was finished on each of this week's seven days.
   *
   * Counted here rather than fetched: weekly progress is one row per week, so the server has no
   * per-day breakdown to give. Completed tasks carry the instant they were finished, and the
   * phone's own zone is the one that decides which day that was — the same rule everything else
   * date-shaped in this app follows.
   */
  const weekBars = useMemo(() => {
    if (!data) return null;
    const start = new Date(`${data.weekly.weekStartDate}T00:00:00`);
    const counts = new Array(7).fill(0) as number[];
    for (const task of data.completedTasks) {
      if (!task.completedAt) continue;
      const done = new Date(task.completedAt);
      const day = Math.floor((done.getTime() - start.getTime()) / 86_400_000);
      if (day >= 0 && day < 7) counts[day] += 1;
    }
    return counts;
  }, [data]);

  const weeklyPercent = data
    ? Math.min(100, (data.weekly.tasksCompleted / Math.max(1, data.weekly.weeklyGoal)) * 100)
    : 0;
  const weekHasWork = !!data && data.weekly.tasksCompleted > 0;

  /** One cell of a 2×2 grid. The gaps between cells are the card's own background showing through. */
  const statCell = (value: string, label: string, opts: { tone?: "plain" | "good" | "zero"; mark?: React.ReactNode } = {}) => (
    <View style={styles.statCell}>
      <View style={styles.statValueRow}>
        <Text
          style={ds(T.h2, {
            fontSize: 24,
            letterSpacing: -0.7,
            color:
              opts.tone === "good"
                ? theme.color.success
                : opts.tone === "zero"
                  ? theme.surface.zeroInk
                  : theme.color.text,
          })}
        >
          {value}
        </Text>
        {opts.mark}
      </View>
      <Text style={[ds(T.meta, { fontSize: 12, color: theme.home.subtle }), styles.statLabel]}>{label}</Text>
    </View>
  );

  const statGrid = (cells: React.ReactNode[]) => (
    <View style={styles.statGrid}>
      <View style={styles.statRow}>
        {cells[0]}
        {cells[1]}
      </View>
      <View style={styles.statRowGap} />
      <View style={styles.statRow}>
        {cells[2]}
        {cells[3]}
      </View>
    </View>
  );

  const goalsSection = (
    <>
      <SectionLabel
        info={goals.length === 0 ? <InfoTooltip topic="goals" /> : undefined}
        badge={goals.length > 0 ? <CountPill tone="done" label={String(goals.length)} /> : undefined}
      >
        GOALS
      </SectionLabel>
      {goals.length > 0 ? (
        /*
          Same row Home draws, and for the same reason it scrolls: past two goals, dividing the
          width between them squeezes each card until the name vanishes and the day count wraps
          one character per line. Shared definition rather than a second copy of the arithmetic.
        */
        goalsLayout.scroll ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.goalsRow}>
            {goals.map((goal) => (
              <GoalRingCard key={goal.id} goal={goal} width={goalsLayout.cardWidth} />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.goalsRow}>
            {goals.map((goal) => (
              <GoalRingCard key={goal.id} goal={goal} />
            ))}
          </View>
        )
      ) : (
        <View style={styles.ghostRow}>
          <GhostRing>
            <PlusMark size={15} color={theme.surface.ghostPlus} />
          </GhostRing>
          <Text style={ds(T.meta, { fontSize: 14, color: theme.color.textMuted })}>
            No goals yet — create one from Home.
          </Text>
        </View>
      )}
    </>
  );

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={ds(T.h1, { fontSize: 27, letterSpacing: -0.8, color: theme.color.text })}>Progress</Text>

        {/* Directly under the title, because it governs everything below it. */}
        <Segmented<Period>
          value={period}
          onChange={setPeriod}
          options={[
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
            { value: "all", label: "All time" },
          ]}
        />

        {period === "week" ? (
          <>
            <PanelCard lifted style={styles.figureCard}>
              <View style={styles.figureLabel}>
                <Text style={ds(T.eyebrow, { color: theme.color.textLabel })}>WEEKLY GOAL</Text>
                <InfoTooltip topic="weeklyProgress" />
              </View>
              <View style={styles.figureRow}>
                <Text
                  style={ds(T.h1, {
                    fontSize: 40,
                    letterSpacing: -1.8,
                    lineHeight: 40,
                    color: weekHasWork ? theme.color.text : theme.surface.zeroInk,
                  })}
                >
                  {data?.weekly.tasksCompleted ?? 0}
                </Text>
                <Text
                  style={ds(T.body, {
                    fontSize: 15,
                    fontWeight: "700",
                    color: weekHasWork ? theme.home.subtle : theme.surface.dashInk,
                  })}
                >
                  of {data?.weekly.weeklyGoal ?? 0} · {Math.round(weeklyPercent)}%
                </Text>
              </View>
              <View style={styles.goalBarTrack}>
                <View style={[styles.goalBarFill, { width: `${weeklyPercent}%` }]} />
              </View>

              {weekHasWork && weekBars ? (
                <View style={styles.strip}>
                  {weekBars.map((count, i) => {
                    const peak = Math.max(...weekBars);
                    const height = count === 0 ? 8 : Math.max(12, Math.round((count / peak) * 36));
                    const fill =
                      count === 0
                        ? theme.surface.barEmpty
                        : count === peak
                          ? theme.surface.barHigh
                          : count >= peak / 2
                            ? theme.surface.barMid
                            : theme.surface.barLow;
                    return (
                      <View key={i} style={styles.stripColumn}>
                        <View style={[styles.stripBar, { height, backgroundColor: fill }]} />
                        <Text style={ds(T.badge, { fontSize: 9.5, color: theme.color.textFaint })}>
                          {DAY_LETTERS[i]}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={[ds(T.meta, { fontSize: 12.5, color: theme.surface.dashInk }), styles.figureNote]}>
                  Finish a focus session and it lands here.
                </Text>
              )}
            </PanelCard>

            {goalsSection}

            <SectionLabel info={<InfoTooltip topic="streak" />}>THIS WEEK&rsquo;S STATS</SectionLabel>
            {statGrid([
              statCell(`${data?.streak.currentStreak ?? 0} days`, "current streak", {
                tone: data?.streak.currentStreak ? "good" : "plain",
                mark: <StreakIconInline size={15} />,
              }),
              statCell(formatMinutes(data?.weekly.totalFocusTimeMinutes ?? 0), "focus time", {
                tone: data?.weekly.totalFocusTimeMinutes ? "plain" : "zero",
              }),
              statCell(`${data?.streak.longestStreak ?? 0} days`, "longest streak"),
              statCell(data?.streak.gracePeriodUsed ? "0 left" : "1 left ✓", "streak grace day", {
                tone: data?.streak.gracePeriodUsed ? "plain" : "good",
              }),
            ])}
          </>
        ) : period === "month" ? (
          <>
            {data && data.monthHistory.length > 0 ? (
              <>
                {/* The month's own headline, so the list below reads as detail rather than as
                    the whole story. Only drawn once there's more than the current week. */}
                {data.monthHistory.length > 1 ? (
                  <PanelCard lifted style={styles.figureCard}>
                    <Text style={ds(T.eyebrow, { color: theme.color.textLabel })}>THIS MONTH</Text>
                    <View style={styles.figureRow}>
                      <Text style={ds(T.h1, { fontSize: 40, letterSpacing: -1.8, lineHeight: 40, color: theme.color.text })}>
                        {data.monthHistory.reduce((n, w) => n + w.tasksCompleted, 0)}
                      </Text>
                      <Text style={ds(T.body, { fontSize: 15, fontWeight: "700", color: theme.home.subtle })}>
                        tasks · {formatMinutes(data.monthHistory.reduce((n, w) => n + w.totalFocusTimeMinutes, 0))}{" "}
                        focused
                      </Text>
                    </View>
                  </PanelCard>
                ) : null}

                <SectionLabel>
                  {`LAST ${data.monthHistory.length} WEEK${data.monthHistory.length === 1 ? "" : "S"}`}
                </SectionLabel>
                <PanelCard>
                  {data.monthHistory.map((week, i) => {
                    const best = Math.max(...data.monthHistory.map((w) => w.tasksCompleted), 1);
                    const pct = Math.round((week.tasksCompleted / best) * 100);
                    const current = i === 0;
                    return (
                      <React.Fragment key={week.weekStartDate}>
                        <View style={styles.weekRow}>
                          <View style={styles.weekRowTop}>
                            <View style={styles.weekRowName}>
                              <Text style={ds(T.body, { fontSize: 15, fontWeight: "800", color: theme.color.text })}>
                                Week of {formatShortDate(week.weekStartDate)}
                              </Text>
                              {current ? <CountPill label="NOW" /> : null}
                            </View>
                            <Text style={ds(T.meta, { fontWeight: "700", color: theme.home.subtle })}>
                              {week.tasksCompleted} tasks · {formatMinutes(week.totalFocusTimeMinutes)}
                            </Text>
                          </View>
                          <View style={styles.weekBarTrack}>
                            <View
                              style={[
                                styles.weekBarFill,
                                {
                                  width: `${pct}%`,
                                  backgroundColor:
                                    week.tasksCompleted === 0
                                      ? theme.surface.barEmpty
                                      : week.tasksCompleted === best
                                        ? theme.surface.barHigh
                                        : theme.surface.barMid,
                                },
                              ]}
                            />
                          </View>
                        </View>
                        {i < data.monthHistory.length - 1 ? <Hairline /> : null}
                      </React.Fragment>
                    );
                  })}
                </PanelCard>
              </>
            ) : null}

            {goalsSection}

            {data && data.monthHistory.length <= 1 ? (
              <View style={styles.ferneLine}>
                <Ferne size={44} />
                <Text style={[ds(T.meta, { color: theme.color.textMuted, lineHeight: 20 }), styles.ferneText]}>
                  Each finished week stacks up here. Come back next Sunday.
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <PanelCard lifted style={styles.headlineCard}>
              <View style={styles.headlineMain}>
                <Text style={ds(T.eyebrow, { color: theme.color.textLabel })}>FOCUS TASKS COMPLETED</Text>
                <Text
                  style={[
                    ds(T.h1, { fontSize: 44, letterSpacing: -2, lineHeight: 44, color: theme.color.success }),
                    styles.headlineFigure,
                  ]}
                >
                  {data?.allTime.totalTasksCompleted ?? 0}
                </Text>
              </View>
              <Ferne size={58} />
            </PanelCard>

            <SectionLabel>SINCE YOU STARTED</SectionLabel>
            {statGrid([
              statCell(formatMinutes(data?.allTime.totalFocusTimeMinutes ?? 0), "total focus time"),
              statCell(`${data?.streak.longestStreak ?? 0} days`, "longest streak", {
                tone: data?.streak.longestStreak ? "good" : "plain",
                mark: <StreakIconInline size={15} />,
              }),
              statCell(String(data?.allTime.weeksTracked ?? 0), "weeks active"),
              // Minutes ÷ finished sessions. The session count is its own field on the endpoint
              // precisely so this isn't minutes ÷ tasks wearing the word "session".
              statCell(
                data && data.allTime.totalSessions > 0
                  ? formatMinutes(Math.round(data.allTime.totalFocusTimeMinutes / data.allTime.totalSessions))
                  : "0 min",
                "average session",
                { tone: data && data.allTime.totalSessions > 0 ? "plain" : "zero" }
              ),
            ])}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: space.gutter,
      paddingTop: space.sm,
      paddingBottom: 24,
      gap: 16,
    },
    figureCard: {
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 16,
    },
    figureLabel: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    figureRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 7,
      marginTop: 10,
    },
    goalBarTrack: {
      height: 10,
      borderRadius: 99,
      backgroundColor: t.surface.progressTrack,
      marginTop: 14,
      overflow: "hidden",
    },
    goalBarFill: {
      height: 10,
      borderRadius: 99,
      backgroundColor: t.surface.barHigh,
    },
    figureNote: {
      marginTop: 11,
    },
    strip: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 6,
      height: 52,
      marginTop: 16,
    },
    stripColumn: {
      flex: 1,
      alignItems: "center",
      gap: 6,
    },
    stripBar: {
      width: "100%",
      borderRadius: 5,
    },
    goalsRow: {
      flexDirection: "row",
      gap: GOALS_ROW_GAP,
    },
    ghostRow: {
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: t.surface.dashBorder,
      borderRadius: 14,
      paddingVertical: 15,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    /** The 1px gaps are the grid's own background showing between the cells. */
    statGrid: {
      backgroundColor: t.surface.statGap,
      borderWidth: 1,
      borderColor: t.surface.cardBorder,
      borderRadius: 16,
      overflow: "hidden",
    },
    statRow: {
      flexDirection: "row",
      gap: 1,
    },
    statRowGap: {
      height: 1,
    },
    statCell: {
      flex: 1,
      backgroundColor: t.surface.card,
      paddingVertical: 15,
      paddingHorizontal: 14,
    },
    statValueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    statLabel: {
      marginTop: 7,
    },
    weekRow: {
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    weekRowTop: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 10,
    },
    weekRowName: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      flexShrink: 1,
    },
    weekBarTrack: {
      height: 7,
      borderRadius: 99,
      backgroundColor: t.surface.progressTrack,
      marginTop: 10,
      overflow: "hidden",
    },
    weekBarFill: {
      height: 7,
      borderRadius: 99,
    },
    ferneLine: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      paddingHorizontal: 2,
    },
    ferneText: {
      flex: 1,
    },
    headlineCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 16,
    },
    headlineMain: {
      flex: 1,
    },
    headlineFigure: {
      marginTop: 8,
    },
  });
