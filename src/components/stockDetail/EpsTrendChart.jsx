import { Typography } from "antd";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { COLORS } from "../../theme/tokens";
import { buildEpsChartData } from "../../utils/stockDetail";

const { Text } = Typography;

const TOOLTIP_NAMES = { eps: "單季 EPS", lastYearEps: "去年同季", estimate: "預估" };

const formatTooltip = (value, name, { payload }) => {
  const text = Number.isFinite(value) ? value.toFixed(2) : "--";
  if (name === "estimate" && Number.isFinite(payload.surprisePercent)) {
    return [`${text}（surprise ${payload.surprisePercent.toFixed(1)}%）`, TOOLTIP_NAMES[name]];
  }
  return [text, TOOLTIP_NAMES[name] ?? name];
};

function EpsTrendChart({ fundamentals }) {
  const data = buildEpsChartData(fundamentals);
  const hasEstimates = data.some((item) => item.estimate !== null);
  return (
    <section className="stock-detail-section" aria-label="EPS 趨勢">
      <Text strong>EPS 趨勢</Text>
      {data.length === 0 ? (
        <Text type="secondary">尚無 EPS 資料</Text>
      ) : (
        <div className="stock-detail-chart">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={COLORS.line} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: COLORS.muted }} />
              <YAxis tick={{ fontSize: 11, fill: COLORS.muted }} />
              <Tooltip formatter={formatTooltip} />
              <Bar dataKey="lastYearEps" fill={COLORS.lineStrong} radius={[3, 3, 0, 0]} />
              <Bar dataKey="eps" fill={COLORS.teal} radius={[3, 3, 0, 0]} />
              {hasEstimates && <Scatter dataKey="estimate" fill={COLORS.warn} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      {fundamentals.nextEarnings && (
        <Text type="secondary">{`${fundamentals.nextEarnings.label}：${fundamentals.nextEarnings.date}`}</Text>
      )}
    </section>
  );
}

export default EpsTrendChart;
