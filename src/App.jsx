import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  InputNumber,
  Layout,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { DeleteOutlined, EditOutlined, MenuOutlined } from '@ant-design/icons'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import dayjs from 'dayjs'
import HoldingForm from './components/HoldingForm'
import TrendChart from './components/TrendChart'
import {
  getPortfolioView,
  getTrend,
  refreshPrices,
  removeHolding,
  reorderHoldings,
  updateHoldingShares,
  upsertHolding,
} from './services/portfolioService'
import { formatDateTime, formatPrice, formatTwd } from './utils/formatters'
import './App.css'

const { Header, Content } = Layout
const { Title, Text } = Typography

const RowContext = createContext({
  listeners: undefined,
  setActivatorNodeRef: undefined,
})

function DragHandle({ disabled }) {
  const { listeners, setActivatorNodeRef } = useContext(RowContext)

  return (
    <Button
      type="text"
      size="small"
      icon={<MenuOutlined />}
      ref={setActivatorNodeRef}
      {...listeners}
      disabled={disabled}
      aria-label="拖曳排序"
      style={{ cursor: disabled ? 'not-allowed' : 'grab' }}
    />
  )
}

function SortableRow({ disabled, ...props }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props['data-row-key'], disabled })

  const style = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 999, background: '#fff' } : {}),
  }

  const contextValue = useMemo(
    () => ({
      setActivatorNodeRef,
      listeners,
    }),
    [setActivatorNodeRef, listeners],
  )

  return (
    <RowContext.Provider value={contextValue}>
      <tr {...props} ref={setNodeRef} style={style} {...attributes} />
    </RowContext.Provider>
  )
}

function App() {
  const { message } = AntdApp.useApp()
  const [rows, setRows] = useState([])
  const [totalTwd, setTotalTwd] = useState(0)
  const [trend, setTrend] = useState([])
  const [range, setRange] = useState('24h')
  const [lastUpdatedAt, setLastUpdatedAt] = useState()
  const [syncError, setSyncError] = useState('')
  const [loadingRefresh, setLoadingRefresh] = useState(false)
  const [loadingAddHolding, setLoadingAddHolding] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [loadingReorder, setLoadingReorder] = useState(false)
  const [activeHoldingTab, setActiveHoldingTab] = useState('all')
  const [editingHoldingId, setEditingHoldingId] = useState(null)
  const [editingShares, setEditingShares] = useState(null)
  const [loadingActionById, setLoadingActionById] = useState({})

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  )

  const loadAllData = useCallback(async () => {
    const [portfolio, trendData] = await Promise.all([
      getPortfolioView(),
      getTrend(range),
    ])

    setRows(portfolio.rows)
    setTotalTwd(portfolio.totalTwd)
    setLastUpdatedAt(portfolio.lastUpdatedAt)
    setSyncError(portfolio.syncStatus === 'error' ? portfolio.syncError : '')
    setTrend(trendData)
  }, [range])

  const setRowLoading = useCallback((id, isLoading) => {
    setLoadingActionById((prev) => ({ ...prev, [id]: isLoading }))
  }, [])

  const handleEditClick = useCallback((record) => {
    setEditingHoldingId(record.id)
    setEditingShares(record.shares)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingHoldingId(null)
    setEditingShares(null)
  }, [])

  const handleSaveShares = useCallback(async (record) => {
    const parsedShares = Number(editingShares)
    if (!Number.isFinite(parsedShares) || parsedShares <= 0) {
      message.error('Shares must be a positive number')
      return
    }

    try {
      setRowLoading(record.id, true)
      await updateHoldingShares({ id: record.id, shares: parsedShares })
      await loadAllData()
      setEditingHoldingId(null)
      setEditingShares(null)
      message.success('股數已更新')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新股數失敗')
    } finally {
      setRowLoading(record.id, false)
    }
  }, [editingShares, loadAllData, message, setRowLoading])

  const handleRemoveHolding = useCallback(async (record) => {
    try {
      setRowLoading(record.id, true)
      await removeHolding({ id: record.id })
      await loadAllData()
      if (editingHoldingId === record.id) {
        setEditingHoldingId(null)
        setEditingShares(null)
      }
      message.success('持股已移除')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '移除持股失敗')
    } finally {
      setRowLoading(record.id, false)
    }
  }, [editingHoldingId, loadAllData, message, setRowLoading])

  const filteredRows = useMemo(() => {
    if (activeHoldingTab === 'tw') {
      return rows.filter((row) => row.market === 'TW')
    }
    if (activeHoldingTab === 'us') {
      return rows.filter((row) => row.market === 'US')
    }
    return rows
  }, [activeHoldingTab, rows])

  const dragDisabled = editingHoldingId !== null || loadingData || loadingReorder

  const handleDragEnd = useCallback(async ({ active, over }) => {
    if (dragDisabled || !over || active.id === over.id) {
      return
    }

    const currentRows = filteredRows
    const oldIndex = currentRows.findIndex((row) => row.id === active.id)
    const newIndex = currentRows.findIndex((row) => row.id === over.id)

    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return
    }

    const reorderedTabRows = arrayMove(currentRows, oldIndex, newIndex)

    let orderedIds = []
    if (activeHoldingTab === 'all') {
      orderedIds = reorderedTabRows.map((row) => row.id)
    } else {
      const reorderedIds = reorderedTabRows.map((row) => row.id)
      const reorderedIdSet = new Set(reorderedIds)
      let index = 0
      const mergedRows = rows.map((row) => {
        if (!reorderedIdSet.has(row.id)) {
          return row
        }

        const next = reorderedTabRows[index]
        index += 1
        return next
      })
      orderedIds = mergedRows.map((row) => row.id)
    }

    try {
      setLoadingReorder(true)
      await reorderHoldings({ orderedIds })
      await loadAllData()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '持股排序更新失敗')
      await loadAllData()
    } finally {
      setLoadingReorder(false)
    }
  }, [activeHoldingTab, dragDisabled, filteredRows, loadAllData, message, rows])

  const tabItems = useMemo(() => {
    const twCount = rows.filter((row) => row.market === 'TW').length
    const usCount = rows.filter((row) => row.market === 'US').length

    return [
      { key: 'all', label: `全部 (${rows.length})` },
      { key: 'tw', label: `台股 (${twCount})` },
      { key: 'us', label: `美股 (${usCount})` },
    ]
  }, [rows])

  const tableColumns = useMemo(() => [
    {
      title: '',
      key: 'drag',
      width: 52,
      align: 'center',
      render: (_, record) => (
        <DragHandle disabled={dragDisabled || Boolean(loadingActionById[record.id])} />
      ),
    },
    {
      title: '公司名稱',
      dataIndex: 'companyName',
      key: 'companyName',
      render: (_, record) => record.companyName || record.symbol,
    },
    {
      title: '代號',
      dataIndex: 'symbol',
      key: 'symbol',
      render: (value, record) => (
        <Space>
          <Text code>{value}</Text>
          <Tag color={record.market === 'TW' ? 'blue' : 'gold'}>{record.market}</Tag>
        </Space>
      ),
    },
    {
      title: '股數',
      dataIndex: 'shares',
      key: 'shares',
      align: 'right',
      render: (value, record) => {
        if (editingHoldingId !== record.id) {
          return Number(value).toLocaleString('en-US', { maximumFractionDigits: 4 })
        }

        return (
          <InputNumber
            min={0.0001}
            step={1}
            precision={4}
            value={editingShares ?? value}
            onChange={(next) => setEditingShares(next)}
            style={{ width: 130 }}
          />
        )
      },
    },
    {
      title: '最新價格',
      dataIndex: 'latestPrice',
      key: 'latestPrice',
      align: 'right',
      render: (value, record) => formatPrice(value, record.latestCurrency || 'TWD'),
    },
    {
      title: '現值 (TWD)',
      dataIndex: 'latestValueTwd',
      key: 'latestValueTwd',
      align: 'right',
      render: (value) => formatTwd(value),
    },
    {
      title: '快照時間',
      dataIndex: 'latestCapturedAt',
      key: 'latestCapturedAt',
      render: (value) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 190,
      render: (_, record) => {
        const rowLoading = Boolean(loadingActionById[record.id]) || loadingReorder
        const isEditing = editingHoldingId === record.id

        if (isEditing) {
          return (
            <Space>
              <Button
                type="primary"
                size="small"
                loading={rowLoading}
                onClick={() => handleSaveShares(record)}
              >
                儲存
              </Button>
              <Button
                size="small"
                disabled={rowLoading}
                onClick={handleCancelEdit}
              >
                取消
              </Button>
            </Space>
          )
        }

        return (
          <Space>
            <Button
              size="small"
              disabled={editingHoldingId !== null || loadingReorder}
              loading={rowLoading}
              onClick={() => handleEditClick(record)}
              icon={<EditOutlined />}
              aria-label="編輯股數"
            >
            </Button>
            <Popconfirm
              title="移除此持股？"
              description="會一併刪除該持股的所有快照資料。"
              okText="刪除"
              cancelText="取消"
              onConfirm={() => handleRemoveHolding(record)}
              okButtonProps={{ danger: true, loading: rowLoading }}
              disabled={editingHoldingId !== null || loadingReorder}
            >
              <Button
                danger
                size="small"
                disabled={editingHoldingId !== null || rowLoading || loadingReorder}
                icon={<DeleteOutlined />}
                aria-label="移除持股"
              >
              </Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ], [
    dragDisabled,
    editingHoldingId,
    editingShares,
    handleCancelEdit,
    handleEditClick,
    handleRemoveHolding,
    handleSaveShares,
    loadingActionById,
    loadingReorder,
  ])

  const DraggableBodyRow = useCallback(
    (props) => <SortableRow {...props} disabled={dragDisabled} />,
    [dragDisabled],
  )

  useEffect(() => {
    const bootstrap = async () => {
      setLoadingData(true)
      try {
        await loadAllData()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '載入資料失敗')
      } finally {
        setLoadingData(false)
      }
    }

    bootstrap()
  }, [loadAllData, message])

  const handleAddHolding = async (values) => {
    try {
      setLoadingAddHolding(true)
      await upsertHolding(values)
      await loadAllData()
      message.success('持股已儲存')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '新增持股失敗')
    } finally {
      setLoadingAddHolding(false)
    }
  }

  const handleRefreshPrices = async () => {
    try {
      setLoadingRefresh(true)
      const result = await refreshPrices()
      await loadAllData()
      message.success(`更新完成，已更新 ${result.updatedCount} 檔（${dayjs(result.lastUpdatedAt).format('HH:mm:ss')}）`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新價格失敗')
    } finally {
      setLoadingRefresh(false)
    }
  }

  return (
    <Layout className="app-layout">
      <Header className="app-header">
        <div>
          <Title level={3} className="app-title">個人股票現值管理</Title>
          <Text type="secondary">PWA + IndexedDB，本地儲存持股與快照</Text>
        </div>
        <div className="header-actions">
          <Button type="primary" size="large" onClick={handleRefreshPrices} loading={loadingRefresh}>
            更新價格
          </Button>
          <Text type="secondary">上次更新時間：{formatDateTime(lastUpdatedAt)}</Text>
        </div>
      </Header>

      <Content className="app-content">
        {syncError && (
          <Alert
            type="error"
            showIcon
            message="上次同步發生錯誤"
            description={syncError}
            style={{ marginBottom: 16 }}
          />
        )}

        <Row gutter={[16, 16]}>
          <Col xs={24}>
            <Card title="新增持股">
              <HoldingForm onSubmit={handleAddHolding} loading={loadingAddHolding} />
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card>
              <Statistic title="總現值（TWD）" value={totalTwd} precision={0} formatter={(value) => formatTwd(Number(value))} />
            </Card>
          </Col>

          <Col xs={24}>
            <Card title="持股列表">
              <Tabs
                activeKey={activeHoldingTab}
                onChange={setActiveHoldingTab}
                items={tabItems}
                style={{ marginBottom: 12 }}
              />
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={filteredRows.map((row) => row.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <Table
                    rowKey="id"
                    dataSource={filteredRows}
                    columns={tableColumns}
                    pagination={false}
                    loading={loadingData || loadingReorder}
                    scroll={{ x: 1030 }}
                    components={{
                      body: {
                        row: DraggableBodyRow,
                      },
                    }}
                  />
                </SortableContext>
              </DndContext>
            </Card>
          </Col>

          <Col xs={24}>
            <Card title="現值變化走勢">
              <TrendChart
                range={range}
                onRangeChange={(value) => setRange(value)}
                data={trend}
              />
            </Card>
          </Col>
        </Row>
      </Content>
    </Layout>
  )
}

export default App
