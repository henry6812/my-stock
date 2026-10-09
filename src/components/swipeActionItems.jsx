import { EditPencil, Trash } from "iconoir-react";

// The 編輯 / 刪除 actions behind a MobileSwipeRow, named after the row.
export const swipeEditAction = (name, onClick, text = "編輯") => ({
  key: "edit",
  label: `${text} ${name}`,
  text,
  icon: <EditPencil />,
  onClick,
});

export const swipeDeleteAction = (name, onClick, text = "刪除") => ({
  key: "delete",
  label: `${text} ${name}`,
  text,
  icon: <Trash />,
  danger: true,
  onClick,
});
