// Holder photos for the asset tab's group headings, keyed by holder name as
// it appears in 設定 > 持有人. Add a photo by dropping it in
// src/assets/avatars/ and importing it here, e.g.
//   import po from "../assets/avatars/po.jpg";
//   export const HOLDER_AVATARS = { Po: po };
// Holders without a photo show their first character instead.
export const HOLDER_AVATARS = {};

export const getHolderAvatar = (holder) => HOLDER_AVATARS[holder] || null;

// The placeholder: the name's first character (Po → P, 澄澄 → 澄).
export const getHolderInitial = (holder) =>
  Array.from(String(holder ?? "").trim())[0]?.toUpperCase() || "";
