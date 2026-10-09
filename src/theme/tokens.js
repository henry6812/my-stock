// Design tokens ("家計簿" direction): neutral cool greys with charcoal CTAs;
// teal is kept for the savings visuals only, and the big numbers are the
// only loud thing. CSS mirrors these as custom properties
// in index.css; JS consumers (antd theme, Recharts, tags) import from here.

export const COLORS = {
  ink: "#1C1F23",
  // Secondary text: ≥4.5:1 on paper, surface, neutral-fill and track.
  muted: "#5E646B",
  // Tertiary: ≥3:1 on paper / surface, so only for large text (the hero
  // currency sign) and non-text marks. Small text that must be read uses muted.
  subtle: "#868C93",
  paper: "#F5F6F7",
  surface: "#FFFFFF",
  line: "#E3E5E8",
  lineStrong: "#CDD1D6",
  // Every CTA, selected control, link and focus ring: charcoal, not pure
  // black (white text 15.8:1).
  action: "#1F2328",
  actionHover: "#353B43",
  actionActive: "#121417",
  // Teal belongs to the savings visuals only: the jar's water, the towers,
  // the month bars and the net-worth trend.
  teal: "#2B7F74",
  tealHover: "#33907F",
  tealBright: "#44A194",
  tealSoft: "#E4F1EE",
  // Mid tint between soft and bright: the savings tower's recurring part.
  tealTint: "#A9D3CB",
  tealInk: "#1E5E56",
  up: "#237804",
  down: "#CF1322",
  warn: "#D48806",
  // Warn as text: the fill colour is too light to read on white.
  warnInk: "#A36100",
  neutralFill: "#EFF1F3",
  track: "#E8EBEE",
};

// Icons (iconoir-react, set once in main.jsx): 1em square so they size with
// the surrounding font-size like antd icons did — set font-size to
// --icon-sm / --icon-md in CSS. Decorative by default; an icon that carries
// meaning on its own passes aria-hidden={false} role="img" aria-label.
export const ICON_SIZES = { sm: 16, md: 20, tile: 36 };

export const iconoirDefaults = {
  width: "1em",
  height: "1em",
  strokeWidth: 1.5,
  "aria-hidden": true,
  "data-icon": "",
};

// Categorical order for charts: a slate first, then calm hues (no antd
// rainbow, and no teal — that is the savings colour). Neutral grey is
// reserved for "other/cash".
export const CHART_PALETTE = [
  "#3D4550",
  "#4C6FA8",
  "#C08A2B",
  "#8E5A8C",
  "#7FA36B",
  "#5F8FA3",
  "#B06A5B",
  "#6E7C99",
];

export const CHART_NEUTRAL = "#A9AFB6";

// Holders are the one tag type that keeps colour — telling Po from Wei at a
// glance is the point. Assigned by the holder's position in the settings list
// so two holders never collide.
// Teal goes last so it rarely shows outside the savings visuals.
export const HOLDER_TONES = [
  { color: "#34507F", background: "#E6ECF5" },
  { color: "#7A5510", background: "#F6EEDC" },
  { color: "#6A3F68", background: "#F1E8F0" },
  { color: "#48633C", background: "#EAF1E5" },
  { color: "#1E5E56", background: "#E4F1EE" },
];

export const antdTheme = {
  token: {
    colorPrimary: COLORS.action,
    colorPrimaryHover: COLORS.actionHover,
    colorPrimaryActive: COLORS.actionActive,
    colorInfo: COLORS.action,
    colorLink: COLORS.action,
    colorLinkHover: COLORS.actionHover,
    colorLinkActive: COLORS.actionActive,
    colorSuccess: COLORS.up,
    colorError: COLORS.down,
    colorWarning: COLORS.warn,
    // Status surfaces set explicitly: antd's derivation from these darker
    // brand colours produced muddy alert backgrounds.
    colorInfoBg: COLORS.neutralFill,
    colorInfoBorder: COLORS.line,
    colorSuccessBg: "#EEF6EA",
    colorSuccessBorder: "#C9E0BD",
    colorWarningBg: "#FDF6E7",
    colorWarningBorder: "#F1D9A6",
    colorErrorBg: "#FDF0F0",
    colorErrorBorder: "#F5C7CB",
    colorText: COLORS.ink,
    colorTextSecondary: COLORS.muted,
    colorTextTertiary: COLORS.subtle,
    colorBorder: COLORS.lineStrong,
    colorBorderSecondary: COLORS.line,
    colorBgLayout: COLORS.paper,
    colorFillSecondary: COLORS.neutralFill,
    borderRadius: 8,
    borderRadiusSM: 6,
    borderRadiusLG: 12,
    fontSize: 14,
    fontFamily:
      "'PingFang TC', 'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    boxShadow: "0 8px 24px rgba(28, 31, 35, 0.14)",
    boxShadowSecondary: "0 8px 24px rgba(28, 31, 35, 0.14)",
  },
  components: {
    // Flat controls: only floating things (FAB, tab bar, overlays) cast shadows.
    Button: {
      primaryShadow: "none",
      defaultShadow: "none",
      dangerShadow: "none",
    },
    Card: {
      headerFontSize: 16,
      headerBg: "transparent",
    },
    Table: {
      headerBg: COLORS.paper,
      headerColor: COLORS.muted,
      headerSplitColor: "transparent",
      rowHoverBg: COLORS.paper,
      borderColor: COLORS.line,
    },
    Segmented: {
      trackBg: COLORS.track,
      itemSelectedBg: COLORS.surface,
      itemColor: COLORS.muted,
      itemSelectedColor: COLORS.ink,
    },
    Tabs: {
      itemColor: COLORS.muted,
      itemSelectedColor: COLORS.ink,
      itemHoverColor: COLORS.ink,
    },
    Tag: {
      defaultBg: COLORS.neutralFill,
      defaultColor: COLORS.muted,
    },
    Progress: {
      remainingColor: COLORS.track,
      defaultColor: COLORS.action,
    },
    Alert: {
      withDescriptionPadding: "12px 16px",
    },
  },
};
