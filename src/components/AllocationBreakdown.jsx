// Asset allocation in the 資產分析 modal: a donut for the shape, then the
// same slices as a framed list with share and TWD amount, so the numbers
// don't depend on reading coloured pie labels.
import { Empty } from "antd";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { formatTwd } from "../utils/formatters";
import { allocationShares } from "../utils/allocation";

export default function AllocationBreakdown({ items = [], emptyText }) {
  const slices = allocationShares(items);
  if (slices.length === 0) {
    return <Empty description={emptyText} />;
  }
  return (
    <div className="allocation-breakdown">
      <div className="allocation-breakdown-chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              isAnimationActive={false}
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="92%"
              stroke="none"
            >
              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="allocation-breakdown-list">
        {slices.map((slice) => (
          <li key={slice.key} className="allocation-breakdown-row">
            <span
              className="allocation-breakdown-swatch"
              style={{ background: slice.color }}
              aria-hidden="true"
            />
            <span className="allocation-breakdown-name">{slice.name}</span>
            <span className="allocation-breakdown-share">
              {`${(slice.share * 100).toFixed(1)}%`}
            </span>
            <span className="allocation-breakdown-amount">
              {formatTwd(slice.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
