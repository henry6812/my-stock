// Calculator-style amount entry for the mobile quick-expense keypad: whole
// numbers joined by + / −, evaluated left to right. No eval().

const OPERATORS = ["+", "-"];
const MAX_OPERAND_DIGITS = 9;

const lastOperand = (expr) => expr.split(/[+-]/).pop();

export const pressKey = (expr, key) => {
  const current = String(expr || "");
  if (key === "clear") return "";
  if (key === "backspace") return current.slice(0, -1);

  if (OPERATORS.includes(key)) {
    if (!current) return current;
    if (OPERATORS.includes(current.at(-1))) {
      return current.slice(0, -1) + key;
    }
    return current + key;
  }

  if (key !== "00" && !/^\d$/.test(key)) return current;

  const operand = lastOperand(current);
  if (operand === "") {
    return current + (key === "00" ? "0" : key);
  }
  if (operand === "0") {
    if (key === "0" || key === "00") return current;
    return current.slice(0, -1) + key;
  }
  if (operand.length + key.length > MAX_OPERAND_DIGITS) return current;
  return current + key;
};

export const evaluateExpression = (expr) => {
  const trimmed = String(expr || "").replace(/[+-]$/, "");
  if (!trimmed) return null;
  return trimmed
    .match(/[+-]?\d+/g)
    .reduce((sum, token) => sum + Number(token), 0);
};

export const hasOperator = (expr) => /[+-]/.test(String(expr || ""));
