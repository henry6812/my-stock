// Savings goal icon key (utils/savingsGoals.js) → iconoir component. Kept apart
// from the 18 category icons so the category picker stays short.
import {
  Airplane,
  Car,
  GraduationCap,
  Healthcare,
  Home,
  Laptop,
  PiggyBank,
  Rings,
  SmartphoneDevice,
  Umbrella,
} from "iconoir-react";

export const GOAL_ICON_COMPONENTS = {
  savings: PiggyBank,
  emergency: Umbrella,
  car: Car,
  travel: Airplane,
  phone: SmartphoneDevice,
  home: Home,
  wedding: Rings,
  education: GraduationCap,
  computer: Laptop,
  medical: Healthcare,
};
