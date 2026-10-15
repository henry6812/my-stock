import MobileSwipeRow from "../MobileSwipeRow";
import { formatPrice } from "../../utils/formatters";
import { describeRowMeta, formatDistance } from "../../utils/stockScreen";

// 低估候選 rows under group titles; shared by the section and the sheet.
// Under-valued is not a price move, so no up / down colours.
function ScreenList({ groups, onOpen }) {
  return groups
    .filter((group) => group.rows.length > 0)
    .map((group) => (
      <div key={group.key} className="screen-group">
        <div className="screen-group-head">
          <span>{group.title}</span>
          <span className="screen-group-count">{group.count ?? `${group.rows.length} 檔`}</span>
        </div>
        {group.rows.map((item) => (
          <MobileSwipeRow
            key={item.code}
            onTap={() => onOpen(item)}
            label={`${item.name} ${item.code}，查看個股`}
            main={
              <div className="watchlist-row-main">
                <span className="watchlist-row-name">{item.name}</span>
                <span className="watchlist-row-symbol">
                  {[item.code, item.industryName, ...describeRowMeta(item)].join(" · ")}
                </span>
              </div>
            }
            side={
              <div className="watchlist-row-price">
                <div className="watchlist-row-price-main">{formatPrice(item.price, "TWD")}</div>
                <div className="screen-row-distance">{formatDistance(item.distanceToFair)}</div>
              </div>
            }
          />
        ))}
      </div>
    ));
}

export default ScreenList;
