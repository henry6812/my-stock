// Design tokens ("家計簿" direction): one quiet teal-ink system where the
// big numbers are the only loud thing. CSS mirrors these as custom properties
// in index.css; JS consumers (antd theme, Recharts, tags) import from here.

export const COLORS = {
  ink: "#1B2B29",
  // Secondary text: ≥4.5:1 on paper, surface, neutral-fill and teal-soft.
  muted: "#5F6E68",
  // Tertiary: ≥3:1 on paper / surface, so only for large text (the hero
  // currency sign) and non-text marks. Small text that must be read uses muted.
  subtle: "#838E8A",
  paper: "#F4F6F5",
  surface: "#FFFFFF",
  line: "#E2E7E5",
  lineStrong: "#CBD3D0",
  // Primary is a step darker than the brand icon teal so white button text
  // and teal link text both clear WCAG AA; the brighter teal stays for
  // large fills (icon, FAB, progress bars).
  teal: "#2B7F74",
  tealHover: "#33907F",
  tealActive: "#22675E",
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
  neutralFill: "#EEF2F1",
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

// Categorical order for charts: teal first, then hues that sit calmly next
// to it (no antd rainbow). Neutral grey is reserved for "other/cash".
export const CHART_PALETTE = [
  "#2B7F74",
  "#4C6FA8",
  "#C08A2B",
  "#8E5A8C",
  "#7FA36B",
  "#5F8FA3",
  "#B06A5B",
  "#6E7C99",
];

export const CHART_NEUTRAL = "#A7B2AE";

// Holders are the one tag type that keeps colour — telling Po from Wei at a
// glance is the point. Assigned by the holder's position in the settings list
// so two holders never collide.
export const HOLDER_TONES = [
  { color: "#1E5E56", background: "#E4F1EE" },
  { color: "#34507F", background: "#E6ECF5" },
  { color: "#7A5510", background: "#F6EEDC" },
  { color: "#6A3F68", background: "#F1E8F0" },
  { color: "#48633C", background: "#EAF1E5" },
];

export const antdTheme = {
  token: {
    colorPrimary: COLORS.teal,
    colorPrimaryHover: COLORS.tealHover,
    colorPrimaryActive: COLORS.tealActive,
    colorInfo: COLORS.teal,
    colorLink: COLORS.teal,
    colorLinkHover: COLORS.tealHover,
    colorSuccess: COLORS.up,
    colorError: COLORS.down,
    colorWarning: COLORS.warn,
    // Status surfaces set explicitly: antd's derivation from these darker
    // brand colours produced muddy alert backgrounds.
    colorInfoBg: COLORS.tealSoft,
    colorInfoBorder: "#C5E0DA",
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
    boxShadow: "0 8px 24px rgba(27, 43, 41, 0.14)",
    boxShadowSecondary: "0 8px 24px rgba(27, 43, 41, 0.14)",
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
      headerBg: "#F7F9F8",
      headerColor: COLORS.muted,
      headerSplitColor: "transparent",
      rowHoverBg: "#F7F9F8",
      borderColor: COLORS.line,
    },
    Segmented: {
      trackBg: "#E9EEEC",
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
      remainingColor: "#E9EEEC",
      defaultColor: COLORS.tealBright,
    },
    Alert: {
      withDescriptionPadding: "12px 16px",
    },
  },
};
