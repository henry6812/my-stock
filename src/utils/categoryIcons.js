// Expense categories are user-named, so their icon is picked from keywords in
// the name: the first rule whose keyword appears wins (order matters — e.g.
// 家庭雜支 is groceries-ish 雜支, not 房屋). No match → "other".
// components/CategoryIcon.jsx maps these keys to iconoir icons.
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

export const getCategoryIconKey = (name) => {
  const text = String(name || "").trim();
  if (!text || text === UNCATEGORIZED_LABEL) return "none";
  const rule = RULES.find(([, keywords]) =>
    keywords.some((keyword) => text.includes(keyword)),
  );
  return rule ? rule[0] : "other";
};
