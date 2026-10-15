// Design tokens ("家計簿" direction): neutral cool greys with charcoal CTAs,
// tabs and tables. Bold colour is spent only where the product shows its
// character: vivid emerald for the savings visuals, saturated category
// tiles, holder tags and chart series. CSS mirrors these as custom properties
// in index.css; JS consumers (antd theme, Recharts, tags) import from here.

export const COLORS = {
  ink: "#1C1F23",
  // Secondary text: ≥4.5:1 on paper, surface, neutral-fill and track.
  muted: "#636970",
  // Tertiary: ≥3:1 on paper / surface, so only for large text (the hero
  // currency sign) and non-text marks. Small text that must be read uses muted.
  subtle: "#8B9198",
  // The page colour: the one place to change it. vite.config.js fills it into
  // --c-paper (index.css), the theme-color meta and the PWA manifest.
  paper: "#fdfdfd",
  surface: "#FFFFFF",
  line: "#EBEDF0",
  lineStrong: "#DADDE2",
  // Every CTA, selected control, link and focus ring: charcoal, not pure
  // black (white text 15.8:1).
  action: "#1F2328",
  actionHover: "#353B43",
  actionActive: "#121417",
  // Teal belongs to the savings visuals only: the jar's water, the towers,
  // the month bars and the net-worth trend.
  teal: "#00957A",
  tealHover: "#00A887",
  tealBright: "#12C29A",
  tealSoft: "#BDEFE0",
  // Mid tint between soft and bright: the savings tower's recurring part.
  tealTint: "#74DDBF",
  tealInk: "#00715C",
  up: "#0B8239",
  down: "#E0142B",
  warn: "#D48806",
  // Warn as text: the fill colour is too light to read on white.
  warnInk: "#A36100",
  // Soft fills behind warn / down text: the savings goal status pill and cup.
  warnSoft: "#F6EBD3",
  downSoft: "#FDE0E3",
  neutralFill: "#F3F4F6",
  // Holder group headings on the asset tab (CSS --c-group-heading).
  groupHeading: "#FFFFFF",
  // Rows of an open holder group (CSS --c-group-rows).
  groupRows: "#DDF0F0",
  // The net-worth jar's body (CSS --c-jar-body).
  jarBody: "#E2F4EE",
  track: "#EDEFF2",
};

// Category tile tints (CategoryIcon), mirrored as --c-cat-* in index.css and
// mapped per icon key in App.css. Soft pastels behind ink icons; no teal.
export const CATEGORY_TONES = {
  peach: "#FFC9A3",
  butter: "#FFE27A",
  sky: "#A9D4FF",
  periwinkle: "#B9C2FF",
  lavender: "#D6BCFF",
  mint: "#A8EBC2",
  rose: "#FFB8CB",
  sand: "#EBD1B0",
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
  "#2E44E0",
  "#FF7A45",
  "#F2B200",
  "#B04BD9",
  "#E2486B",
  "#1FA2D6",
  "#7A5AF8",
  "#5A5F80",
];

export const CHART_NEUTRAL = "#B4BAC0";

// The stock detail charts (EPS bars, P/E line): the palette's cobalt,
// with a pale tint of it for last year's quarters.
export const CHART_STOCK = {
  primary: CHART_PALETTE[0],
  previous: "#BAC3FA",
};

// Holders are the one tag type that keeps colour — telling Po from Wei at a
// glance is the point. Assigned by the holder's position in the settings list
// so two holders never collide.
// Teal goes last so it rarely shows outside the savings visuals.
export const HOLDER_TONES = [
  { color: "#1F2FB8", background: "#D9DEFF" },
  { color: "#8A3B00", background: "#FFDCC2" },
  { color: "#7A1FA2", background: "#EED9FF" },
  { color: "#A3123A", background: "#FFD6E1" },
  { color: "#00634F", background: "#C4F2E3" },
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
    colorSuccessBg: "#E6F7EC",
    colorSuccessBorder: "#C9E0BD",
    colorWarningBg: "#FDF6E7",
    colorWarningBorder: "#F1D9A6",
    colorErrorBg: "#FFEEF0",
    colorErrorBorder: "#FBC2CA",
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
