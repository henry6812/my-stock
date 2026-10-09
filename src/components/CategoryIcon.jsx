// Round tile with the expense category's icon, at the start of a list row.
// The category's own icon if it picked one, else one chosen from its name
// (utils/categoryIcons.js); a row without a category gets a neutral tile.
// Decorative: the row text already names the category.
import { resolveCategoryIconKey } from "../utils/categoryIcons";
import { CATEGORY_ICON_COMPONENTS } from "./categoryIconComponents";

export default function CategoryIcon({ name, icon = null }) {
  const key = resolveCategoryIconKey({ name, icon });
  const Icon = CATEGORY_ICON_COMPONENTS[key];
  return (
    <span
      className={`category-icon${key === "none" ? " category-icon--none" : ""}`}
      data-category-icon={key}
    >
      <Icon />
    </span>
  );
}
