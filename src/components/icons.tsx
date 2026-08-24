/**
 * Icon marks — transcribed from designdocs/rn-handoff 2/icons.tsx.
 * All drawn on a 24x24 grid: filled shape + darker same-hue stroke. 2-3 shapes each.
 * Never line-only. Never add faces (Ferne is the only character).
 */
import React from "react";
import Svg, { Circle, Path } from "react-native-svg";
import { color, size } from "../theme";

type IconProps = { size?: number };

export const ReminderIcon = ({ size: s = size.icon }: IconProps) => (
  <Svg width={s} height={s} viewBox="0 0 24 24">
    <Path
      d="M12 3.2c-3.6 0-6.4 2.8-6.4 6.2v3c0 1.6-.7 2.6-1.5 3.3-.6.5-.3 1.4.5 1.4h14.8c.8 0 1.1-.9.5-1.4-.8-.7-1.5-1.7-1.5-3.3v-3c0-3.4-2.8-6.2-6.4-6.2z"
      fill="#F7A62B"
      stroke="#A85F09"
      strokeWidth={1.6}
    />
    <Path d="M9.7 19.2a2.4 2.4 0 0 0 4.6 0" stroke="#A85F09" strokeWidth={1.7} strokeLinecap="round" />
  </Svg>
);

export const FocusIcon = ({ size: s = size.icon }: IconProps) => (
  <Svg width={s} height={s} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={9.4} fill="#25C08E" stroke="#0B7A59" strokeWidth={1.6} />
    <Circle cx={12} cy={12} r={5.8} fill="#FFF6E2" />
    <Circle cx={12} cy={12} r={2.6} fill="#FF6B2C" />
  </Svg>
);

export const DoNotDisturbIcon = ({ size: s = size.iconLg }: IconProps) => (
  <Svg width={s} height={s} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={9.4} fill="#8B5CF6" stroke="#5326C0" strokeWidth={1.6} />
    <Path d="M7.4 12h9.2" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" />
  </Svg>
);

/** Full flame — standalone slots (>= 26px). */
export const StreakIcon = ({ size: s = size.iconLg }: IconProps) => (
  <Svg width={s} height={s} viewBox="0 0 24 24">
    <Path
      d="M12 2.2c3.5 3.3 6.4 6 6.4 10a6.4 6.4 0 0 1-12.8 0c0-4 2.9-6.7 6.4-10z"
      fill="#FF6B2C"
      stroke="#C63C06"
      strokeWidth={1.6}
    />
    <Path d="M12 8.2c2.5 2.4 4.2 4 4.2 6.4a4.2 4.2 0 0 1-8.4 0c0-2.4 1.7-4 4.2-6.4z" fill="#FFD23F" />
  </Svg>
);

/** Inline variant — inside a text run, keeps the line box at text height. */
export const StreakIconInline = ({ size: s = size.iconInline }: IconProps) => <StreakIcon size={s} />;

/**
 * Single-colour glyphs for the task-type tile on Home's To do / Completed rows — distinct
 * from ReminderIcon/FocusIcon above, which are fixed-palette "stickers" and can't be
 * recoloured per row (reminder tinted blue, focus tinted terracotta, completed tinted
 * olive, all from the same shape).
 */
type GlyphProps = { size?: number; color: string };

export const BellGlyph = ({ size: s = 18, color: c }: GlyphProps) => (
  <Svg width={s} height={s} viewBox="0 0 24 24">
    <Path
      d="M12 2.5a5.5 5.5 0 0 0-5.5 5.5v2.4c0 1.6-.6 2.6-1.4 3.4-.5.5-.2 1.3.5 1.3h13.8c.7 0 1-.8.5-1.3-.8-.8-1.4-1.8-1.4-3.4V8A5.5 5.5 0 0 0 12 2.5z"
      fill={c}
    />
    <Path d="M9.7 18.2a2.4 2.4 0 0 0 4.6 0" stroke={c} strokeWidth={1.6} strokeLinecap="round" fill="none" />
  </Svg>
);

export const TargetGlyph = ({ size: s = 18, color: c }: GlyphProps) => (
  <Svg width={s} height={s} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={9} stroke={c} strokeWidth={1.7} fill="none" />
    <Circle cx={12} cy={12} r={5} stroke={c} strokeWidth={1.7} fill="none" />
    <Circle cx={12} cy={12} r={1.8} fill={c} />
  </Svg>
);

/* ---- bottom tab icons (line style, 22px) ---- */

const TabIcon = ({ d, active }: { d: string[]; active: boolean }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    {d.map((p, i) => (
      <Path
        key={i}
        d={p}
        stroke={active ? color.interactive : color.textFaint}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ))}
  </Svg>
);

export const HomeTabIcon = ({ active }: { active: boolean }) => (
  <TabIcon active={active} d={["M3.2 10.8 12 3.6l8.8 7.2M5.6 9.6V20.4h12.8V9.6M9.6 20.4v-6.2h4.8v6.2"]} />
);

export const ProgressTabIcon = ({ active }: { active: boolean }) => (
  <TabIcon active={active} d={["M4 19.4h16M7.6 19.4v-6.6M12 19.4V7.2M16.4 19.4v-9.4"]} />
);

export const SettingsTabIcon = ({ active }: { active: boolean }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={2.9} stroke={active ? color.interactive : color.textFaint} strokeWidth={1.6} />
    <Path
      d="M12 4.6 13.4 6.6h2.3l.6 2.3 2 1.3-.9 2.1.9 2.1-2 1.3-.6 2.3h-2.3L12 19.4l-1.4-2H8.3l-.6-2.3-2-1.3.9-2.1-.9-2.1 2-1.3.6-2.3h2.3z"
      stroke={active ? color.interactive : color.textFaint}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);
