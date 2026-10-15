import { useState } from "react";
import ResearchSheet from "./ResearchSheet";
import ScreenList from "./ScreenList";

// Every 低估候選 row; the flagged ones folded at the bottom.
function ScreenListSheet({ open, isMobile, result, onClose, onOpen }) {
  const [showFlagged, setShowFlagged] = useState(false);
  if (!result) return null;
  return (
    <ResearchSheet open={open} isMobile={isMobile} title="低估候選" onClose={onClose}>
      <div className="mobile-list-body">
        <ScreenList
          groups={[
            { key: "below", title: "低於便宜價", rows: result.below },
            { key: "fairLow", title: "合理偏低", rows: result.fairLow },
          ]}
          onOpen={onOpen}
        />
        {result.flagged.length > 0 && (
          <>
            <div className="price-refresh-footer">
              <button
                type="button"
                className="price-refresh-link"
                aria-expanded={showFlagged}
                onClick={() => setShowFlagged((value) => !value)}
              >
                {`被標記 ${result.flagged.length} 檔`}
              </button>
            </div>
            {showFlagged && (
              <ScreenList groups={[{ key: "flagged", title: "被標記", rows: result.flagged }]} onOpen={onOpen} />
            )}
          </>
        )}
      </div>
    </ResearchSheet>
  );
}

export default ScreenListSheet;
