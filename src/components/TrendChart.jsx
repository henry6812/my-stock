import { Segmented, Empty } from 'antd'
import dayjs from 'dayjs'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatAxisTwd, formatTwd } from '../utils/formatters'
import { COLORS } from '../theme/tokens'

const rangeOptions = [
  { label: '24 小時', value: '24h' },
  { label: '一週', value: '7d' },
  { label: '一個月', value: '30d' },
]

function TrendChart({ range, onRangeChange, data, height = 320 }) {
  // A 24h view needs times on the axis (with the date, since its points can
  // be end-of-day snapshots from two days); longer ranges read as dates.
  const axisFormat = range === '24h' ? 'M/D HH:mm' : 'MM/DD'
  // A numeric time axis: points sit at their real times and ticks never
  // repeat (a category axis labelled every snapshot 「23:59」 twice).
  const chartData = data.map((point) => ({
    ...point,
    time: dayjs(point.ts).valueOf(),
    fullLabel: dayjs(point.ts).format('YYYY/MM/DD HH:mm'),
  }))

  return (
    <div
      style={{
        height,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Segmented
        value={range}
        options={rangeOptions}
        onChange={onRangeChange}
        style={{ marginBottom: 12 }}
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        {chartData.length === 0 ? (
          <Empty description="尚無走勢資料，請先按更新" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(time) => dayjs(time).format(axisFormat)}
                minTickGap={28}
              />
              {/* Fit the axis to the data: from zero, a <1% day is a flat line. */}
              <YAxis
                tickFormatter={formatAxisTwd}
                width={56}
                domain={['auto', 'auto']}
              />
              <Tooltip
                formatter={(value) => formatTwd(value)}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel ?? ''}
              />
              <Line
                isAnimationActive={false}
                dataKey="totalTwd"
                type="monotone"
                stroke={COLORS.tealBright}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

export default TrendChart
