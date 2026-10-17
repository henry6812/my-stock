import { Segmented } from "antd";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatAxisTwd, formatTwd } from "../../utils/formatters";
import { buildForecastChartData, FORECAST_HORIZONS } from "../../utils/forecast";
import { CHART_STOCK, COLORS } from "../../theme/tokens";

const horizonOptions = FORECAST_HORIZONS.map((years) => ({
  label: `${years} 年`,
  value: years,
}));

const tick = { fontSize: 11, fill: COLORS.muted };

function ForecastTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="pe-river-tooltip">
      <div className="pe-river-tooltip-title">{`${point.year} 年`}</div>
      <div>{`股票 ${formatTwd(point.stockTwd)}`}</div>
      <div>{`現金 ${formatTwd(point.cashTwd)}`}</div>
      <div>{`總額 ${formatTwd(point.totalTwd)}`}</div>
      {point.whatIfTotalTwd !== null && (
        <div>{`如果… ${formatTwd(point.whatIfTotalTwd)}`}</div>
      )}
    </div>
  );
}

// Total assets a year at a time: the base line solid (the savings colour, as
// on the trend chart), the what-if line dashed cobalt, the FI threshold a
// muted dashed rule with a dot where each line crosses it.
function ForecastChart({ base, whatIf = null, horizonYears, onHorizonChange, height = 280 }) {
  const data = buildForecastChartData({ base, whatIf });
  const startYear = data[0]?.year ?? 0;
  const showWhatIfThreshold =
    whatIf && whatIf.thresholdTwd !== null && whatIf.thresholdTwd !== base.thresholdTwd;

  return (
    <div className="forecast-chart">
      <Segmented
        block
        value={horizonYears}
        options={horizonOptions}
        onChange={onHorizonChange}
      />
      <div className="forecast-chart-plot" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.line} />
            <XAxis
              dataKey="yearsFromNow"
              type="number"
              domain={[0, horizonYears]}
              allowDecimals={false}
              tickFormatter={(value) => String(startYear + value)}
              tick={tick}
              minTickGap={24}
            />
            <YAxis tickFormatter={formatAxisTwd} width={56} tick={tick} />
            <Tooltip content={<ForecastTooltip />} />
            {base.thresholdTwd !== null && (
              <ReferenceLine
                y={base.thresholdTwd}
                stroke={COLORS.muted}
                strokeDasharray="4 4"
                label={{
                  value: "財務自由門檻",
                  position: "insideTopLeft",
                  fontSize: 11,
                  fill: COLORS.muted,
                }}
              />
            )}
            {showWhatIfThreshold && (
              <ReferenceLine
                y={whatIf.thresholdTwd}
                stroke={CHART_STOCK.primary}
                strokeOpacity={0.5}
                strokeDasharray="4 4"
              />
            )}
            <Line
              isAnimationActive={false}
              dataKey="totalTwd"
              stroke={COLORS.tealBright}
              strokeWidth={2}
              dot={false}
            />
            {whatIf && (
              <Line
                isAnimationActive={false}
                dataKey="whatIfTotalTwd"
                stroke={CHART_STOCK.primary}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
              />
            )}
            {base.fiMonthIndex !== null && (
              <ReferenceDot
                x={base.fiMonthIndex / 12}
                y={base.thresholdTwd}
                r={4}
                fill={COLORS.tealBright}
                stroke={COLORS.surface}
              />
            )}
            {whatIf && whatIf.fiMonthIndex !== null && (
              <ReferenceDot
                x={whatIf.fiMonthIndex / 12}
                y={whatIf.thresholdTwd}
                r={4}
                fill={CHART_STOCK.primary}
                stroke={COLORS.surface}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="stock-detail-legend">
        <li>
          <span
            className="stock-detail-legend-swatch"
            style={{ background: COLORS.tealBright }}
          />
          目前步調
        </li>
        {whatIf && (
          <li>
            <span
              className="stock-detail-legend-swatch stock-detail-legend-swatch--outline"
              style={{ borderColor: CHART_STOCK.primary }}
            />
            如果…
          </li>
        )}
      </ul>
    </div>
  );
}

export default ForecastChart;
