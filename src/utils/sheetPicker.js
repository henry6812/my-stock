// Date pickers in a bottom sheet hang their calendar inside the sheet. On a
// short screen there is no room below the field, so the calendar flips up
// and its month header ends up above the top of the screen. Pass this as the
// picker's onOpenChange: on open it scrolls the field (the focused input) to
// the top of the sheet first, leaving the calendar room to open downward.
export const makeRoomForPicker = (open) => {
  if (!open) return;
  const input = document.activeElement;
  if (!input?.closest?.(".form-bottom-sheet .ant-drawer-body")) return;
  input.scrollIntoView({ block: "start" });
};
