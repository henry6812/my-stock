// Expense category icons. A category may store its own `icon` (picked in the
// category form); otherwise the icon comes from keywords in its name: the
// first rule whose keyword appears wins (order matters — e.g. 家庭雜支 is
// 雜支, not 房屋). No match → "other".
// components/categoryIconComponents.js maps these keys to iconoir icons.
const RULES = [
  ["baby", ["寶寶", "嬰", "育兒", "小孩", "兒童", "尿布", "奶粉"]],
  ["coffee", ["咖啡", "飲料", "手搖"]],
  ["dining", ["外食", "餐", "飯", "吃", "食堂", "便當", "小吃"]],
  ["groceries", ["買菜", "菜", "生鮮", "超市", "食材", "量販"]],
  ["household", ["雜支", "日用", "生活用品", "家用", "購物"]],
  ["utilities", ["水電", "電費", "水費", "瓦斯", "管理費"]],
  ["phone", ["電信", "電話", "手機", "網路", "通訊"]],
  ["housing", ["房屋", "房租", "房貸", "租金", "住"]],
  ["learning", ["職涯", "學習", "進修", "課程", "教育", "學費", "書"]],
  ["transport", ["交通", "油", "停車", "捷運", "公車", "高鐵", "計程", "車"]],
  ["fitness", ["運動", "健身"]],
  ["health", ["健康", "醫", "藥", "診", "保健", "牙"]],
  ["clothing", ["衣", "服飾", "鞋", "褲"]],
  ["entertainment", ["娛樂", "遊戲", "電影", "訂閱", "休閒"]],
  ["travel", ["旅", "機票", "住宿"]],
  ["gift", ["禮", "紅包", "送"]],
  ["insurance", ["保險"]],
];

export const UNCATEGORIZED_LABEL = "未指定";

// Picker order + accessible names. "none" (no category) is not pickable.
export const CATEGORY_ICON_OPTIONS = [
  { key: "dining", label: "外食" },
  { key: "coffee", label: "咖啡飲料" },
  { key: "groceries", label: "買菜" },
  { key: "household", label: "日用雜支" },
  { key: "utilities", label: "水電" },
  { key: "phone", label: "通訊" },
  { key: "housing", label: "房屋" },
  { key: "transport", label: "交通" },
  { key: "learning", label: "學習" },
  { key: "fitness", label: "運動" },
  { key: "health", label: "健康" },
  { key: "clothing", label: "衣服" },
  { key: "entertainment", label: "娛樂" },
  { key: "travel", label: "旅遊" },
  { key: "gift", label: "禮物" },
  { key: "insurance", label: "保險" },
  { key: "baby", label: "寶寶" },
  { key: "other", label: "其他" },
];

const PICKABLE = new Set(CATEGORY_ICON_OPTIONS.map((option) => option.key));

// A stored icon is kept only if it is one we can draw; anything else (old or
// mistyped values) means "pick from the name".
export const normalizeCategoryIcon = (value) =>
  typeof value === "string" && PICKABLE.has(value) ? value : null;

export const getCategoryIconKey = (name) => {
  const text = String(name || "").trim();
  if (!text || text === UNCATEGORIZED_LABEL) return "none";
  const rule = RULES.find(([, keywords]) =>
    keywords.some((keyword) => text.includes(keyword)),
  );
  return rule ? rule[0] : "other";
};

// What a row shows: the category's own icon if it has one, else by name.
export const resolveCategoryIconKey = ({ name, icon } = {}) => {
  const key = getCategoryIconKey(name);
  if (key === "none") return "none";
  return normalizeCategoryIcon(icon) ?? key;
};
