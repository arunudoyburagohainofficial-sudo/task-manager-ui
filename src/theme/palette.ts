/**
 * The two palettes — light and dark.
 *
 * Transcribed from `designdocs/Light-final.dc.html` and `designdocs/Dark-final.dc.html`, the
 * finalized screen set. Same rule as before: if a value isn't in here, it isn't in the design.
 *
 * ## Why this file exists separately from index.ts
 *
 * Colour is the only part of the design that changes at runtime. Type, space, radius and the
 * depth recipes don't, so they stay in `index.ts` as plain exports. Everything that flips with
 * the theme lives here, behind one `Palette` shape that both modes satisfy — a token missing
 * from either mode is a compile error rather than a screen that half-changes.
 *
 * ## Reading the groups
 *
 * `color`, `home`, `schedulePanel`, `detail` and `wash` are the groups that already existed;
 * their light values are exactly what shipped, so a converted screen renders identically in
 * light mode to how it did before the theme became switchable.
 *
 * `surface` is new, and holds the redesigned screens' own values (Capture, Organize, Progress,
 * Settings, Task Detail, the schedule sheet). It is additive on purpose: the final screens draw
 * a slightly different set from the live app — their primary action is #B4562C where the app's
 * `interactive` is #BE816E, their in-card hairline #F3EBDA where `divider` is #F2E8D5 — and
 * Home is not among them. It's the reference the others were rebuilt against ("Home's exact
 * section-label rhythm on every screen"), so redirecting the shared tokens would have quietly
 * redrawn the one screen the design left alone. New names, Home untouched.
 *
 * ## Dark mode beyond the redesigned screens
 *
 * The dark set draws Capture, Organize, Progress, Settings, Task Detail and the sheet. It does
 * not draw Home, Scheduled, Focus, Completion or Auth — but the toggle is app-wide, so those
 * need dark values too. Theirs are derived from the dark vocabulary the HTML does establish
 * (#1B1714 ground, #241F1A card, #3A322A border, #2E2822 hairline, the same ink ramp) rather
 * than invented: where the light screen used `card`, the dark one uses the dark `card`, and so
 * on. Marked ⟨derived⟩ below so a later design pass knows which values were measured and which
 * were inferred.
 */

/** Light and dark only. "System" is a *preference* that resolves to one of these — see ThemeContext. */
export type ThemeMode = "light" | "dark";

export interface Palette {
  mode: ThemeMode;

  color: {
    // surfaces
    screen: string;
    card: string;
    fill: string;
    track: string;
    border: string;
    divider: string;
    toggleOff: string;

    // text
    text: string;
    textBody: string;
    textMuted: string;
    textFaint: string;
    textLabel: string;

    // the one interaction colour
    interactive: string;
    interactivePress: string;
    onInteractive: string;
    selectedTint: string;
    selectedText: string;

    progress: string;

    success: string;
    successFill: string;
    successBorder: string;
    doneFill: string;
    doneBorder: string;
    doneText: string;
    doneCheck: string;

    amberFill: string;
    amberText: string;
    amberLabel: string;

    goal: string;

    taskTypeReminderBg: string;
    taskTypeReminderFg: string;
    taskTypeFocusBg: string;
    taskTypeFocusFg: string;
    taskTypeCompletedBg: string;

    danger: string;
    dangerBorder: string;
    dangerFill: string;

    ferne: string;
    ferneLight: string;
    fernePale: string;
    ferneDeep: string;
  };

  /**
   * The redesigned screens' surfaces. Names follow the HTML's own vocabulary so a value can be
   * traced back to the line that drew it.
   */
  surface: {
    /** The full-width hairline beside a section eyebrow. */
    rule: string;
    /** The hairline *inside* a card, between two rows. */
    hairline: string;
    card: string;
    cardBorder: string;
    cardShadow: string;

    /** Segmented switches: type, period, Regular/Pomodoro, repeat frequency. */
    segTrack: string;
    segActive: string;
    segActiveInk: string;
    segActiveShadow: string;
    segIdleInk: string;

    /** The When chips, the Ends chips, the monthly anchor — anything single-choice and boxed. */
    chipBg: string;
    chipBorder: string;
    chipInk: string;
    chipSelBg: string;
    chipSelBorder: string;
    chipSelInk: string;

    /** The one pinned action per screen, and its disabled state. */
    primary: string;
    primaryInk: string;
    primaryShadow: string;
    primaryOff: string;
    primaryOffInk: string;
    /** The outlined Cancel that sits beside it. */
    cancelBorder: string;
    cancelInk: string;

    /** A row's own action pill — "Add", "Pick", "Attach", "Start". Home's colour, unchanged. */
    action: string;
    actionInk: string;

    /** Dashed ghosts: "+ Add another", the empty goal slot, the no-goal ring. */
    dashBorder: string;
    dashInk: string;
    dashInkQuiet: string;
    ghostRing: string;
    ghostPlus: string;

    /** Ferne's speech bubble, and the plain-English repeat summary. */
    bubble: string;
    bubbleInk: string;
    summary: string;
    summaryInk: string;

    /** The schedule sheet's dimmed ground, its own surface, and the grab handle. */
    sheetBackdrop: string;
    sheetSurface: string;
    sheetHandle: string;

    /** The 2×2 stat grid — the gaps are the background showing through. */
    statGap: string;
    /** A figure that is honestly zero, rather than an achievement. */
    zeroInk: string;

    /** Progress' seven-day strip, lowest to highest. */
    barEmpty: string;
    barLow: string;
    barMid: string;
    barHigh: string;
    /** A progress bar's groove. */
    progressTrack: string;

    toggleOn: string;
    toggleOffTrack: string;
    toggleKnob: string;

    /** Count pills and state badges: amber (NOW/SOON/captured), olive (goals), terracotta (unsaved). */
    badgeAmberBg: string;
    badgeAmberInk: string;
    badgeDoneBg: string;
    badgeDoneInk: string;
    badgeUnsavedBg: string;
    badgeUnsavedInk: string;
    /** The row a pending change sits on, and its dot. */
    unsavedRowBg: string;
    unsavedDot: string;

    /** Capture's field — the only lit object on that screen. */
    fieldBg: string;
    fieldBorder: string;
    fieldGlow: string;
    fieldDrop: string;
    fieldPlaceholder: string;
    fieldCaret: string;

    /** Destructive text on the redesigned screens. Softer than `color.danger`, which is a button. */
    danger: string;

    /** Small marks: the info circle, a row's leading icon, a chevron, a dropdown caret. */
    infoStroke: string;
    rowIcon: string;
    chevron: string;
    caret: string;

    /** Task Detail's round header buttons and overflow dots. */
    headerBg: string;
    headerInk: string;
    headerDots: string;

    /** Task Detail's session card: the 46px length, its unit, and the ± steppers. */
    lengthInk: string;
    unitInk: string;
    stepperBg: string;
    stepperInk: string;

    /** Settings' Do Not Disturb row, which is deliberately inert. */
    dndIcon: string;
    dndKnob: string;
  };

  wash: {
    base: string;
    violet: string;
    blush: string;
    mint: string;
    sand: string;
    /** The diagonal ramp's two ends, and the corner lift. */
    rampFrom: string;
    rampTo: string;
    cornerLift: string;
    /**
     * How strongly each layer of the wash is painted. The hues are the same in both modes; only
     * these change, and they change a lot — the ramp's white opens at .72 on cream and at .035
     * on charcoal. Without them the dark screens wear the light wash and read as grey fog.
     */
    stops: {
      rampLift: number;
      rampVioletMid: number;
      rampVioletEnd: number;
      bloomViolet: [number, number];
      bloomTerra: [number, number];
      bloomOlive: number;
      cornerLift: number;
      /** The older screens' closing overlay: a bright top and a warm floor. Absent in dark. */
      closeTop: number;
      closeFoot: number;
    };
  };

  schedulePanel: {
    overdue: {
      bg: string;
      border: string;
      label: string;
      rule: string;
      rowBorder: string;
      badgeBg: string;
      badgeFg: string;
      moreBorder: string;
      moreText: string;
    };
    neutral: {
      bg: string;
      border: string;
      label: string;
      rule: string;
      badgeBg: string;
      badgeFg: string;
    };
    repeatTileBg: string;
    repeatTileFg: string;
    dateRule: string;
    focusDot: string;
    reminderDot: string;
  };

  home: {
    avatarBg: string;
    avatarInk: string;
    subtle: string;
    statDivider: string;
    streakInk: string;
    pointsInk: string;
    focusedInk: string;
    statBoltStroke: string;
    countAmberBg: string;
    countAmberInk: string;
    countDoneBg: string;
    countDoneInk: string;
    caret: string;
    actionBg: string;
    actionInk: string;
    goalKindBg: string;
    goalKindInk: string;
    xpInk: string;
    doneBg: string;
    doneBorder: string;
    doneTileBg: string;
    doneTileBorder: string;
    doneTick: string;
    doneTitle: string;
    doneStrike: string;
    doneMetaGoal: string;
    doneMeta: string;
    donePillBg: string;
    donePillInk: string;
    closingLine: string;
    sessionTrack: string;
    sessionRing: string;
    sessionInk: string;
    cardShadow: string;
    captureDiscLit: string;
    captureDiscShade: string;
    captureRim: string;
    captureShadow: string;
  };

  detail: {
    ink: string;
    muted: string;
    label: string;
    cardShadow: string;
    switchTrack: string;
    switchActive: string;
    switchActiveShadow: string;
    modeTrack: string;
    modeActive: string;
    modeActiveInk: string;
    stepperBorder: string;
    stepperInk: string;
    tile: string;
    roundOn: string;
    roundOff: string;
    divider: string;
    rowIcon: string;
    action: string;
    chevron: string;
    goalTrack: string;
    goalArc: string;
    goalInk: string;
    emptyRing: string;
    emptyPlus: string;
    explainer: string;
    explainerInk: string;
    primary: string;
    primaryInk: string;
    primaryShadow: string;
    dark: string;
    darkInk: string;
    darkShadow: string;
    dots: string;
  };

  /**
   * Which way a goal's ring is lit. In light the groove is a pale wash of the goal's colour and
   * the figure a darker version of it; in dark that inverts — a deep groove, a lifted figure —
   * which is the pairing the dark screens draw (#2A3340/#8FB0DC around the blue #8DA6CC).
   */
  goalRing: { trackLightness: number; inkShift: number };
}

export const light: Palette = {
  mode: "light",

  color: {
    screen: "#FDF8EA",
    card: "#FFFFFF",
    fill: "#F1E7D3",
    track: "#F5EBD6",
    border: "#EDE0C6",
    divider: "#F2E8D5",
    toggleOff: "#D8D8D2",

    text: "#1F2927",
    textBody: "#3A4642",
    textMuted: "#68736F",
    textFaint: "#97A19D",
    textLabel: "#7E8985",

    interactive: "#BE816E",
    interactivePress: "#9C6252",
    onInteractive: "#FFFFFF",
    selectedTint: "#FBEEE9",
    selectedText: "#8A4A22",

    progress: "#167C72",

    success: "#2E6B3F",
    successFill: "#E6F0C3",
    successBorder: "#CFE7DC",
    doneFill: "#F5F6E2",
    doneBorder: "#E2E7BE",
    doneText: "#7E9433",
    doneCheck: "#A4BF43",

    amberFill: "#FFF4DC",
    amberText: "#9A6B14",
    amberLabel: "#C08A1E",

    goal: "#8DA6CC",

    taskTypeReminderBg: "#E8EEF6",
    taskTypeReminderFg: "#4C7BB5",
    taskTypeFocusBg: "#FBEADF",
    taskTypeFocusFg: "#B4562C",
    taskTypeCompletedBg: "#EAEFD3",

    danger: "#9D131B",
    dangerBorder: "#D95C5C",
    dangerFill: "#F7E4E4",

    ferne: "#DF6D41",
    ferneLight: "#F0A382",
    fernePale: "#F2CDB8",
    ferneDeep: "#8E3D1D",
  },

  surface: {
    rule: "#EDE0C6",
    hairline: "#F3EBDA",
    card: "#FFFFFF",
    cardBorder: "#EDE0C6",
    cardShadow: "rgba(139,109,74,.06)",

    segTrack: "#F4EDDE",
    segActive: "#FFFFFF",
    segActiveInk: "#1F2927",
    segActiveShadow: "rgba(26,26,26,.13)",
    segIdleInk: "#5C564B",

    chipBg: "#FBF7EC",
    chipBorder: "#EDE0C6",
    chipInk: "#3A4642",
    chipSelBg: "#FBEDE6",
    chipSelBorder: "#DF6D41",
    chipSelInk: "#B4562C",

    primary: "#B4562C",
    primaryInk: "#FFF6EF",
    primaryShadow: "rgba(142,61,29,.85)",
    primaryOff: "#F0E7D4",
    primaryOffInk: "#B0A68F",
    cancelBorder: "#E4D8BF",
    cancelInk: "#6F6757",

    action: "#EBC294",
    actionInk: "#4A3608",

    dashBorder: "#E0D3B8",
    dashInk: "#8C8371",
    dashInkQuiet: "#A9A08C",
    ghostRing: "#D6CEBC",
    ghostPlus: "#B3AA98",

    bubble: "#F6EEDD",
    bubbleInk: "#3A4642",
    summary: "#F6EEDD",
    summaryInk: "#5E5645",

    sheetBackdrop: "#E7DCC8",
    sheetSurface: "#FDF8EA",
    sheetHandle: "#E4D8BF",

    statGap: "#F0E7D4",
    zeroInk: "#C4BBA6",

    barEmpty: "#F0E7D4",
    barLow: "#DCE7C2",
    barMid: "#A4BF43",
    barHigh: "#2E6B3F",
    progressTrack: "#F0E7D4",

    toggleOn: "#2E6B3F",
    toggleOffTrack: "#E4DFD4",
    toggleKnob: "#FFFFFF",

    badgeAmberBg: "#FFF4DC",
    badgeAmberInk: "#8A6112",
    badgeDoneBg: "#EAF0DA",
    badgeDoneInk: "#6F8429",
    badgeUnsavedBg: "#FBEDE6",
    badgeUnsavedInk: "#B4562C",
    unsavedRowBg: "#FDF6F1",
    unsavedDot: "#DF6D41",

    fieldBg: "#FFFFFF",
    fieldBorder: "#DF6D41",
    fieldGlow: "rgba(223,109,65,.10)",
    fieldDrop: "rgba(142,61,29,.5)",
    fieldPlaceholder: "#A8AEA9",
    fieldCaret: "#DF6D41",

    danger: "#A8322B",

    infoStroke: "#A8B0AC",
    rowIcon: "#8C8371",
    chevron: "#B6AA95",
    caret: "#B6AA95",

    headerBg: "#F4EDDE",
    headerInk: "#3A4642",
    headerDots: "#5C564B",

    lengthInk: "#1F2927",
    unitInk: "#5F6A66",
    stepperBg: "#F4EDDE",
    stepperInk: "#5C564B",

    dndIcon: "#C7BFD8",
    dndKnob: "#FFFFFF",
  },

  wash: {
    base: "#FDF8EA",
    violet: "#EFE4F5",
    blush: "#F8DFD4",
    mint: "#E4F0E2",
    sand: "#FBF1DE",
    rampFrom: "rgba(255,255,255,.72)",
    rampTo: "rgba(139,92,246,.11)",
    cornerLift: "rgba(255,255,255,.85)",
    stops: {
      rampLift: 0.72,
      rampVioletMid: 0.05,
      rampVioletEnd: 0.11,
      bloomViolet: [0.3, 0.06],
      bloomTerra: [0.24, 0.05],
      bloomOlive: 0.16,
      cornerLift: 0.85,
      closeTop: 0.34,
      closeFoot: 0.13,
    },
  },

  schedulePanel: {
    overdue: {
      bg: "#FCF0EA",
      border: "#F0D5C8",
      label: "#8A4E39",
      rule: "#EEC9B8",
      rowBorder: "#EFDCCE",
      badgeBg: "#BE816E",
      badgeFg: "#FDF8EA",
      moreBorder: "#E7C6B6",
      moreText: "#A66B58",
    },
    neutral: {
      bg: "rgba(255,255,255,.5)",
      border: "#EDE0C6",
      label: "#68736F",
      rule: "#EDE0C6",
      badgeBg: "#EFE6D4",
      badgeFg: "#4A5551",
    },
    repeatTileBg: "#F4EEE1",
    repeatTileFg: "#7E8A85",
    dateRule: "rgba(237,224,198,.75)",
    focusDot: "#DF6D41",
    reminderDot: "#7B96C0",
  },

  home: {
    avatarBg: "#F7F1E6",
    avatarInk: "#6A4F6A",
    subtle: "#5F6A66",
    statDivider: "#E8DCC4",
    streakInk: "#9E3F16",
    pointsInk: "#7A5408",
    focusedInk: "#2E6B3F",
    statBoltStroke: "#8A6112",
    countAmberBg: "#FFF4DC",
    countAmberInk: "#8A6112",
    countDoneBg: "#EAF0DA",
    countDoneInk: "#6F8429",
    caret: "#A0A79F",
    actionBg: "#EBC294",
    actionInk: "#4A3608",
    goalKindBg: "#EFF4E2",
    goalKindInk: "#5F7226",
    xpInk: "#A9760B",
    doneBg: "#FBF7EC",
    doneBorder: "#EFE6D2",
    doneTileBg: "#EAF0DA",
    doneTileBorder: "#D4E0B4",
    doneTick: "#6F8429",
    doneTitle: "#67716D",
    doneStrike: "#AEB6B1",
    doneMetaGoal: "#4C5A76",
    doneMeta: "#5C564B",
    donePillBg: "#FFF4DC",
    donePillInk: "#8A6112",
    closingLine: "#6B7571",
    sessionTrack: "#F4E3D4",
    sessionRing: "#DF6D41",
    sessionInk: "#B4562C",
    cardShadow: "rgba(139,109,74,.07)",
    captureDiscLit: "#FFF3E8",
    captureDiscShade: "#F8DCC8",
    captureRim: "rgba(223,109,65,.34)",
    captureShadow: "rgba(142,61,29,.24)",
  },

  detail: {
    // 5a/5b's values. The Elegant screens this was first transcribed from used a warmer,
    // browner register (#1C2422 ink, #A2604A terracotta); the final set brings Task Detail onto
    // the same ink and the same one-loud-action terracotta as every other screen.
    ink: "#1F2927",
    muted: "#5F6A66",
    label: "#7E8985",
    cardShadow: "rgba(139,109,74,.07)",
    switchTrack: "#F4EDDE",
    switchActive: "#FFFFFF",
    switchActiveShadow: "rgba(26,26,26,.13)",
    modeTrack: "#F4EDDE",
    /** White now, not ink — the final screens have no dark-filled switch. */
    modeActive: "#FFFFFF",
    modeActiveInk: "#1F2927",
    stepperBorder: "#F4EDDE",
    stepperInk: "#5C564B",
    tile: "#FBF7EC",
    roundOn: "#B4562C",
    roundOff: "#E4DCCB",
    divider: "#F3EBDA",
    rowIcon: "#8C8371",
    action: "#B4562C",
    chevron: "#B6AA95",
    goalTrack: "#EDF1E6",
    goalArc: "#7FB04A",
    goalInk: "#54762D",
    emptyRing: "#D6CEBC",
    emptyPlus: "#B3AA98",
    explainer: "#F6EEDD",
    explainerInk: "#3A4642",
    primary: "#B4562C",
    primaryInk: "#FFF6EF",
    primaryShadow: "rgba(142,61,29,.85)",
    /** Both footer buttons are terracotta in the final screens; this pair is kept in step. */
    dark: "#B4562C",
    darkInk: "#FFF6EF",
    darkShadow: "rgba(142,61,29,.85)",
    dots: "#5C564B",
  },

  goalRing: { trackLightness: 94, inkShift: -22 },
};

export const dark: Palette = {
  mode: "dark",

  color: {
    screen: "#0E1113",
    card: "#1C2024",
    fill: "#23282C",
    track: "#2B3034",
    border: "#2F353A",
    divider: "#262B2F",
    toggleOff: "#2F353A",

    text: "#E9EDEF",
    textBody: "#D1D7DB",
    textMuted: "#8696A0",
    textFaint: "#6E787D",
    textLabel: "#8696A0",

    // The terracotta reads as the accent at this weight on charcoal; its pressed state goes
    // deeper rather than lighter, same direction as light.
    interactive: "#D3703F",
    interactivePress: "#B4562C",
    onInteractive: "#FFF6EF",
    selectedTint: "#3A241C",
    selectedText: "#D3703F",

    progress: "#3E9E93", // ⟨derived⟩ the teal lifted to read on charcoal

    success: "#57A76C",
    successFill: "#26301C",
    successBorder: "#2F4438", // ⟨derived⟩
    doneFill: "#262B18", // ⟨derived⟩
    doneBorder: "#39492A",
    doneText: "#A9C262",
    doneCheck: "#A4BF43",

    amberFill: "#3A2F18",
    amberText: "#E2B863",
    amberLabel: "#E2B863",

    goal: "#8DA6CC",

    taskTypeReminderBg: "#1F2A38", // ⟨derived⟩
    taskTypeReminderFg: "#8FB0DC",
    taskTypeFocusBg: "#2A3035",
    taskTypeFocusFg: "#E08A5E", // ⟨derived⟩
    taskTypeCompletedBg: "#26301C",

    danger: "#E77A6E",
    dangerBorder: "#8C4038", // ⟨derived⟩
    dangerFill: "#33211F", // ⟨derived⟩

    ferne: "#DF6D41",
    ferneLight: "#F0A382",
    fernePale: "#F2CDB8",
    ferneDeep: "#8E3D1D",
  },

  surface: {
    rule: "#2F353A",
    hairline: "#262B2F",
    card: "#1C2024",
    cardBorder: "#2F353A",
    cardShadow: "rgba(0,0,0,.4)",

    segTrack: "#23282C",
    segActive: "#1C2024",
    segActiveInk: "#E9EDEF",
    segActiveShadow: "rgba(0,0,0,.5)",
    segIdleInk: "#8696A0",

    chipBg: "#171A1D",
    chipBorder: "#2F353A",
    chipInk: "#D1D7DB",
    chipSelBg: "#3A241C",
    chipSelBorder: "#DF6D41",
    chipSelInk: "#D3703F",

    primary: "#B4562C",
    primaryInk: "#FFF6EF",
    primaryShadow: "rgba(142,61,29,.85)",
    primaryOff: "#2B3034",
    primaryOffInk: "#6E787D",
    cancelBorder: "#3B4247",
    cancelInk: "#C3CACE",

    action: "#EBC294",
    actionInk: "#4A3608",

    dashBorder: "#373E43",
    dashInk: "#7C868B",
    dashInkQuiet: "#6E787D",
    ghostRing: "#3B4247",
    ghostPlus: "#6E787D",

    bubble: "#23282C",
    bubbleInk: "#D1D7DB",
    summary: "#23282C",
    summaryInk: "#8696A0",

    sheetBackdrop: "#05080A",
    sheetSurface: "#0E1113",
    sheetHandle: "#3B4247",

    statGap: "#2B3034",
    zeroInk: "#7C868B",

    barEmpty: "#2B3034",
    barLow: "#39492A",
    barMid: "#A4BF43",
    barHigh: "#57A76C",
    progressTrack: "#2B3034",

    toggleOn: "#57A76C",
    toggleOffTrack: "#2F353A",
    toggleKnob: "#1C2024",

    badgeAmberBg: "#3A2F18",
    badgeAmberInk: "#E2B863",
    badgeDoneBg: "#26301C",
    badgeDoneInk: "#A9C262",
    badgeUnsavedBg: "#3A241C",
    badgeUnsavedInk: "#D3703F",
    unsavedRowBg: "#2A211C",
    unsavedDot: "#DF6D41",

    fieldBg: "#1C2024",
    fieldBorder: "#DF6D41",
    fieldGlow: "rgba(223,109,65,.10)",
    fieldDrop: "rgba(142,61,29,.5)",
    fieldPlaceholder: "#737D82",
    fieldCaret: "#DF6D41",

    danger: "#E77A6E",

    infoStroke: "#6E787D",
    rowIcon: "#7C868B",
    chevron: "#6E787D",
    caret: "#6E787D",

    headerBg: "#23282C",
    headerInk: "#D1D7DB",
    headerDots: "#8696A0",

    lengthInk: "#E9EDEF",
    unitInk: "#8696A0",
    stepperBg: "#23282C",
    stepperInk: "#8696A0",

    dndIcon: "#4B4458",
    dndKnob: "#1C2024",
  },

  wash: {
    base: "#0E1113",
    // The blooms are the same hues at far lower alpha — on charcoal they read as light in the
    // room rather than as colour fields, which is what the dark screens draw.
    violet: "rgba(139,92,246,.10)",
    blush: "rgba(223,109,65,.13)",
    mint: "rgba(87,167,108,.07)", // ⟨derived⟩
    sand: "rgba(255,255,255,.035)",
    rampFrom: "rgba(255,255,255,.035)",
    rampTo: "rgba(139,92,246,.05)",
    cornerLift: "rgba(255,255,255,.05)",
    // Straight off the dark screens. The olive bloom and the closing overlay aren't drawn there
    // at all, so they're zero rather than a dimmed version of themselves.
    // Near-flat on purpose. The warm blooms are what made the dark screens read as a lit
    // room; a neutral dark wants a plain ground with only a hint of depth left in it.
    stops: {
      rampLift: 0.014,
      rampVioletMid: 0.006,
      rampVioletEnd: 0.016,
      bloomViolet: [0.035, 0.008],
      bloomTerra: [0.045, 0.01],
      bloomOlive: 0,
      cornerLift: 0.018,
      closeTop: 0,
      closeFoot: 0,
    },
  },

  // ⟨derived⟩ throughout: the dark screens don't draw the Scheduled panels.
  schedulePanel: {
    overdue: {
      bg: "#232A2F",
      border: "#3B4247",
      label: "#E0A184",
      rule: "#454D52",
      rowBorder: "#2F353A",
      badgeBg: "#D3703F",
      badgeFg: "#0E1113",
      moreBorder: "#454D52",
      moreText: "#D79878",
    },
    neutral: {
      bg: "rgba(36,31,26,.6)",
      border: "#2F353A",
      label: "#8696A0",
      rule: "#2F353A",
      badgeBg: "#2B3034",
      badgeFg: "#D1D7DB",
    },
    repeatTileBg: "#23282C",
    repeatTileFg: "#8696A0",
    dateRule: "rgba(58,50,42,.75)",
    focusDot: "#DF6D41",
    reminderDot: "#8FB0DC",
  },

  // ⟨derived⟩ throughout: the dark screens don't draw Home. Each value is its light counterpart
  // moved to the dark ground — a cream card becomes #241F1A, an olive tile the dark olive, and
  // every ink lifted to the dark ramp.
  home: {
    avatarBg: "#23282C",
    avatarInk: "#B9C2C7",
    subtle: "#8696A0",
    statDivider: "#2F353A",
    streakInk: "#E8956B",
    pointsInk: "#E2B863",
    focusedInk: "#57A76C",
    statBoltStroke: "#E2B863",
    countAmberBg: "#3A2F18",
    countAmberInk: "#E2B863",
    countDoneBg: "#26301C",
    countDoneInk: "#A9C262",
    caret: "#6E787D",
    actionBg: "#EBC294",
    actionInk: "#4A3608",
    goalKindBg: "#26301C",
    goalKindInk: "#A9C262",
    xpInk: "#E2B863",
    doneBg: "#181C1F",
    doneBorder: "#2B3034",
    doneTileBg: "#26301C",
    doneTileBorder: "#39492A",
    doneTick: "#A9C262",
    doneTitle: "#7C868B",
    doneStrike: "#5B6469",
    doneMetaGoal: "#8FB0DC",
    doneMeta: "#8696A0",
    donePillBg: "#3A2F18",
    donePillInk: "#E2B863",
    closingLine: "#7C868B",
    sessionTrack: "#2A3035",
    sessionRing: "#DF6D41",
    sessionInk: "#E08A5E",
    cardShadow: "rgba(0,0,0,.4)",
    captureDiscLit: "#2A3035",
    captureDiscShade: "#232A2F",
    captureRim: "rgba(223,109,65,.45)",
    captureShadow: "rgba(0,0,0,.55)",
  },

  detail: {
    ink: "#E9EDEF",
    muted: "#8696A0",
    label: "#8696A0",
    cardShadow: "rgba(0,0,0,.4)",
    switchTrack: "#23282C",
    switchActive: "#1C2024",
    switchActiveShadow: "rgba(0,0,0,.5)",
    modeTrack: "#23282C",
    modeActive: "#1C2024",
    modeActiveInk: "#E9EDEF",
    stepperBorder: "#2F353A",
    stepperInk: "#8696A0",
    tile: "#171A1D",
    roundOn: "#D3703F",
    roundOff: "#2F353A",
    divider: "#262B2F",
    rowIcon: "#7C868B",
    action: "#EBC294",
    chevron: "#6E787D",
    goalTrack: "#2A3325",
    goalArc: "#A4BF43",
    goalInk: "#A9C262",
    emptyRing: "#3B4247",
    emptyPlus: "#6E787D",
    explainer: "#23282C",
    explainerInk: "#D1D7DB",
    primary: "#B4562C",
    primaryInk: "#FFF6EF",
    primaryShadow: "rgba(142,61,29,.85)",
    dark: "#B4562C",
    darkInk: "#FFF6EF",
    darkShadow: "rgba(142,61,29,.85)",
    dots: "#8696A0",
  },

  /** Inverted from light: a deep groove, a lifted figure. Measured off #2A3340/#8FB0DC. */
  goalRing: { trackLightness: 20, inkShift: 6 },
};

export const palettes = { light, dark } as const;
