import { useState } from "react";
import { User } from "iconoir-react";
import { getHolderAvatar, getHolderInitial } from "../utils/holderAvatars";

// Round holder photo in front of a group heading. Decorative: the holder's
// name is right beside it. Falls back to the first character when there is
// no photo or it fails to load, and to a person icon for 未設定.
function HolderAvatar({ holder, unset = false }) {
  const src = unset ? null : getHolderAvatar(holder);
  const [failedSrc, setFailedSrc] = useState(null);
  const initial = unset ? "" : getHolderInitial(holder);

  return (
    <span className="holder-avatar" aria-hidden>
      {src && failedSrc !== src ? (
        <img src={src} alt="" onError={() => setFailedSrc(src)} />
      ) : initial ? (
        initial
      ) : (
        <User />
      )}
    </span>
  );
}

export default HolderAvatar;
