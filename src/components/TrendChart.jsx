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
import { formatTwd } from '../utils/formatters'

const rangeOptions = [
  { label: '24 小時', value: '24h' },
  { label: '一週', value: '7d' },
  { label: '一個月', value: '30d' },
]

function TrendChart({ range, onRangeChange, data, height = 320 }) {
  const chartData = data.map((point) => ({
    ...point,
    label: dayjs(point.ts).format('MM/DD'),
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
              <XAxis dataKey="label" minTickGap={28} />
              <YAxis tickFormatter={(value) => formatTwd(value, true)} />
              <Tooltip formatter={(value) => formatTwd(value)} />
              <Line
                dataKey="totalTwd"
                type="monotone"
                stroke="#165dff"
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
