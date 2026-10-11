import { Typography } from "antd";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_STOCK, COLORS } from "../../theme/tokens";
import { formatPrice } from "../../utils/formatters";
import { formatEps } from "../../utils/valuation";

const { Text } = Typography;

const price = (value) => (Number.isFinite(value) ? formatPrice(value, "TWD") : "--");
// Band prices are EPS × P/E, so they carry many decimals; the tooltip shows cents.
const bandPrice = (value) => (Number.isFinite(value) ? price(Math.round(value * 100) / 100) : "--");

export function RiverTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  const impliedPe = Number.isFinite(item.close) && item.ttmEps > 0 ? (item.close / item.ttmEps).toFixed(1) : null;
  return (
    <div className="pe-river-tooltip">
      <div className="pe-river-tooltip-title">{item.future ? `${item.label}（推估）` : item.label}</div>
      {Number.isFinite(item.close) && <div>{`收盤 ${price(item.close)}`}</div>}
      <div>{`近四季 EPS ${Number.isFinite(item.ttmEps) ? formatEps(item.ttmEps) : "--"}`}</div>
      {impliedPe && <div>{`本益比 ${impliedPe}`}</div>}
      <div>{`便宜 ${bandPrice(item.cheap)}／合理 ${bandPrice(item.fair)}／昂貴 ${bandPrice(item.expensive)}`}</div>
    </div>
  );
}

// Price against EPS × the P/E bands in use: when the price runs above the
// band it has outpaced earnings. Past the 今天 line the band follows
// the projected EPS.
function PeRiverChart({ river }) {
  let body;
  if (river.status === "missing-pe") {
    body = <Text type="secondary">請先在估價假設設定本益比</Text>;
  } else if (river.points.length < 2) {
    body = <Text type="secondary">尚無歷史股價資料</Text>;
  } else {
    body = (
      <div className="stock-detail-chart">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={river.points} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={COLORS.line} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: COLORS.muted }} minTickGap={24} />
            <YAxis tick={{ fontSize: 11, fill: COLORS.muted }} domain={["auto", "auto"]} />
            <Tooltip content={<RiverTooltip />} />
            <Area dataKey="band" stroke="none" fill={CHART_STOCK.previous} fillOpacity={0.7} isAnimationActive={false} />
            <Area
              dataKey="bandFuture"
              stroke={CHART_STOCK.previous}
              strokeDasharray="4 4"
              fill={CHART_STOCK.previous}
              fillOpacity={0.35}
              isAnimationActive={false}
            />
            <Line dataKey="fairLine" stroke={CHART_STOCK.primary} strokeOpacity={0.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <Line dataKey="fairFuture" stroke={CHART_STOCK.primary} strokeOpacity={0.35} strokeDasharray="2 4" dot={false} isAnimationActive={false} />
            <Line dataKey="close" stroke={CHART_STOCK.primary} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
            <ReferenceLine
              x={river.todayLabel}
              stroke={COLORS.line}
              label={{ value: "今天", position: "insideTopLeft", fontSize: 11, fill: COLORS.muted }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }
  return (
    <section className="stock-detail-section" aria-label="股價與 EPS">
      <div className="stock-detail-heading-row">
        <h3 className="stock-detail-heading">股價與 EPS</h3>
        <ul className="stock-detail-legend">
          <li>
            <span className="stock-detail-legend-swatch" style={{ background: CHART_STOCK.primary }} />
            股價
          </li>
          <li>
            <span className="stock-detail-legend-swatch" style={{ background: CHART_STOCK.previous }} />
            便宜–昂貴
          </li>
          <li>
            <span className="stock-detail-legend-swatch stock-detail-legend-swatch--outline" />
            推估
          </li>
        </ul>
      </div>
      {body}
    </section>
  );
}

export default PeRiverChart;
