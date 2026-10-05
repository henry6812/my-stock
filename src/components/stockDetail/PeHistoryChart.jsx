import { Typography } from "antd";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { COLORS } from "../../theme/tokens";

const { Text } = Typography;

const BAND_LINES = [
  { key: "cheap", label: "便宜", color: COLORS.up },
  { key: "fair", label: "合理", color: COLORS.muted },
  { key: "expensive", label: "昂貴", color: COLORS.down },
];

// Explains where the three P/E bands come from: the stock's own P/E history
// with the bands in use (including overrides) drawn across it.
function PeHistoryChart({ peSeries, bands }) {
  const validCount = peSeries.filter((point) => Number.isFinite(point.pe)).length;
  return (
    <section className="stock-detail-section" aria-label="本益比走勢">
      <Text strong>本益比走勢</Text>
      {validCount < 2 ? (
        <Text type="secondary">尚無歷史本益比資料</Text>
      ) : (
        <div className="stock-detail-chart">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={peSeries} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={COLORS.line} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: COLORS.muted }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: COLORS.muted }} domain={["auto", "auto"]} />
              <Tooltip formatter={(value) => [Number.isFinite(value) ? value.toFixed(1) : "--", "本益比"]} />
              <Line dataKey="pe" stroke={COLORS.teal} dot={false} connectNulls={false} strokeWidth={2} />
              {BAND_LINES.map(({ key, label, color }) =>
                Number.isFinite(bands?.[key]) ? (
                  <ReferenceLine
                    key={key}
                    y={bands[key]}
                    stroke={color}
                    strokeDasharray="4 4"
                    label={{ value: `${label} ${bands[key]}`, position: "insideTopRight", fontSize: 11, fill: color }}
                  />
                ) : null,
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export default PeHistoryChart;
