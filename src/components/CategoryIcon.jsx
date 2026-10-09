// Round tile with the expense category's icon, at the start of a list row.
// Which icon comes from the category name (utils/categoryIcons.js); a row
// without a category gets a neutral tile. Decorative: the row text already
// names the category.
import {
  Airplane,
  Car,
  Cart,
  CoffeeCup,
  Cutlery,
  Gamepad,
  Gift,
  GraduationCap,
  Gym,
  Heart,
  Home,
  Label,
  LightBulb,
  Phone,
  Shield,
  Shirt,
  ShoppingBag,
  Stroller,
} from "iconoir-react";
import { getCategoryIconKey } from "../utils/categoryIcons";

const ICONS = {
  baby: Stroller,
  coffee: CoffeeCup,
  dining: Cutlery,
  groceries: Cart,
  household: ShoppingBag,
  utilities: LightBulb,
  phone: Phone,
  housing: Home,
  learning: GraduationCap,
  transport: Car,
  fitness: Gym,
  health: Heart,
  clothing: Shirt,
  entertainment: Gamepad,
  travel: Airplane,
  gift: Gift,
  insurance: Shield,
  other: Label,
  none: Label,
};

export default function CategoryIcon({ name }) {
  const key = getCategoryIconKey(name);
  const Icon = ICONS[key];
  return (
    <span
      className={`category-icon${key === "none" ? " category-icon--none" : ""}`}
      data-category-icon={key}
    >
      <Icon />
    </span>
  );
}
