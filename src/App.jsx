import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Empty,
  InputNumber,
  Layout,
  Modal,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Table,
  Tabs,
  Tooltip,
  Tag,
  Typography,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  MenuOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import dayjs from "dayjs";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import HoldingForm from "./components/HoldingForm";
import TrendChart from "./components/TrendChart";
import {
  getPortfolioView,
  getTrend,
  refreshPrices,
  refreshHoldingPrice,
  removeHolding,
  reorderHoldings,
  updateHoldingShares,
  upsertHolding,
} from "./services/portfolioService";
import { formatDateTime, formatPrice, formatTwd } from "./utils/formatters";
import "./App.css";

const { Header, Content } = Layout;
const { Title, Text } = Typography;

const RowContext = createContext({
  listeners: undefined,
  setActivatorNodeRef: undefined,
});

function DragHandle({ disabled }) {
  const { listeners, setActivatorNodeRef } = useContext(RowContext);

  return (
    <Button
      type="text"
      size="small"
      icon={<MenuOutlined />}
      ref={setActivatorNodeRef}
      {...listeners}
      disabled={disabled}
      aria-label="拖曳排序"
      style={{ cursor: disabled ? "not-allowed" : "grab" }}
    />
  );
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
  } = useSortable({ id: props["data-row-key"], disabled });

  const style = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging
      ? { position: "relative", zIndex: 999, background: "#fff" }
      : {}),
  };

  const contextValue = useMemo(
    () => ({
      setActivatorNodeRef,
      listeners,
    }),
    [setActivatorNodeRef, listeners],
  );

  return (
    <RowContext.Provider value={contextValue}>
      <tr {...props} ref={setNodeRef} style={style} {...attributes} />
    </RowContext.Provider>
  );
}

function App() {
  const { message } = AntdApp.useApp();
  const [rows, setRows] = useState([]);
  const [totalTwd, setTotalTwd] = useState(0);
  const [trend, setTrend] = useState([]);
  const [range, setRange] = useState("24h");
  const [lastUpdatedAt, setLastUpdatedAt] = useState();
  const [syncError, setSyncError] = useState("");
  const [loadingRefresh, setLoadingRefresh] = useState(false);
  const [loadingAddHolding, setLoadingAddHolding] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingReorder, setLoadingReorder] = useState(false);
  const [isTrendExpanded, setIsTrendExpanded] = useState(false);
  const [isPieExpanded, setIsPieExpanded] = useState(false);
  const [activeHoldingTab, setActiveHoldingTab] = useState("all");
  const [isAddHoldingModalOpen, setIsAddHoldingModalOpen] = useState(false);
  const [editingHoldingId, setEditingHoldingId] = useState(null);
  const [editingShares, setEditingShares] = useState(null);
  const [loadingActionById, setLoadingActionById] = useState({});

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  const loadAllData = useCallback(async () => {
    const [portfolio, trendData] = await Promise.all([
      getPortfolioView(),
      getTrend(range),
    ]);

    setRows(portfolio.rows);
    setTotalTwd(portfolio.totalTwd);
    setLastUpdatedAt(portfolio.lastUpdatedAt);
    setSyncError(portfolio.syncStatus === "error" ? portfolio.syncError : "");
    setTrend(trendData);
  }, [range]);

  const setRowLoading = useCallback((id, isLoading) => {
    setLoadingActionById((prev) => ({ ...prev, [id]: isLoading }));
  }, []);

  const handleEditClick = useCallback((record) => {
    setEditingHoldingId(record.id);
    setEditingShares(record.shares);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingHoldingId(null);
    setEditingShares(null);
  }, []);

  const handleSaveShares = useCallback(
    async (record) => {
      const parsedShares = Number(editingShares);
      if (!Number.isFinite(parsedShares) || parsedShares <= 0) {
        message.error("Shares must be a positive number");
        return;
      }

      try {
        setRowLoading(record.id, true);
        await updateHoldingShares({ id: record.id, shares: parsedShares });
        await loadAllData();
        setEditingHoldingId(null);
        setEditingShares(null);
        message.success("股數已更新");
      } catch (error) {
        message.error(error instanceof Error ? error.message : "更新股數失敗");
      } finally {
        setRowLoading(record.id, false);
      }
    },
    [editingShares, loadAllData, message, setRowLoading],
  );

  const handleRemoveHolding = useCallback(
    async (record) => {
      try {
        setRowLoading(record.id, true);
        await removeHolding({ id: record.id });
        await loadAllData();
        if (editingHoldingId === record.id) {
          setEditingHoldingId(null);
          setEditingShares(null);
        }
        message.success("持股已移除");
      } catch (error) {
        message.error(error instanceof Error ? error.message : "移除持股失敗");
      } finally {
        setRowLoading(record.id, false);
      }
    },
    [editingHoldingId, loadAllData, message, setRowLoading],
  );

  const filteredRows = useMemo(() => {
    if (activeHoldingTab === "tw") {
      return rows.filter((row) => row.market === "TW");
    }
    if (activeHoldingTab === "us") {
      return rows.filter((row) => row.market === "US");
    }
    return rows;
  }, [activeHoldingTab, rows]);

  const dragDisabled =
    editingHoldingId !== null || loadingData || loadingReorder;

  const handleDragEnd = useCallback(
    async ({ active, over }) => {
      if (dragDisabled || !over || active.id === over.id) {
        return;
      }

      const currentRows = filteredRows;
      const oldIndex = currentRows.findIndex((row) => row.id === active.id);
      const newIndex = currentRows.findIndex((row) => row.id === over.id);

      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
        return;
      }

      const reorderedTabRows = arrayMove(currentRows, oldIndex, newIndex);

      let orderedIds = [];
      if (activeHoldingTab === "all") {
        orderedIds = reorderedTabRows.map((row) => row.id);
      } else {
        const reorderedIds = reorderedTabRows.map((row) => row.id);
        const reorderedIdSet = new Set(reorderedIds);
        let index = 0;
        const mergedRows = rows.map((row) => {
          if (!reorderedIdSet.has(row.id)) {
            return row;
          }

          const next = reorderedTabRows[index];
          index += 1;
          return next;
        });
        orderedIds = mergedRows.map((row) => row.id);
      }

      try {
        setLoadingReorder(true);
        await reorderHoldings({ orderedIds });
        await loadAllData();
      } catch (error) {
        message.error(
          error instanceof Error ? error.message : "持股排序更新失敗",
        );
        await loadAllData();
      } finally {
        setLoadingReorder(false);
      }
    },
    [activeHoldingTab, dragDisabled, filteredRows, loadAllData, message, rows],
  );

  const tabItems = useMemo(() => {
    const twCount = rows.filter((row) => row.market === "TW").length;
    const usCount = rows.filter((row) => row.market === "US").length;

    return [
      { key: "all", label: `全部 (${rows.length})` },
      { key: "tw", label: `台股 (${twCount})` },
      { key: "us", label: `美股 (${usCount})` },
    ];
  }, [rows]);

  const marketAllocation = useMemo(() => {
    const result = {
      TW: 0,
      US: 0,
    };

    for (const row of rows) {
      if (typeof row.latestValueTwd !== "number") {
        continue;
      }
      if (row.market === "TW") {
        result.TW += row.latestValueTwd;
      } else if (row.market === "US") {
        result.US += row.latestValueTwd;
      }
    }

    return [
      { name: "台股", key: "TW", value: result.TW, color: "#165dff" },
      { name: "美股", key: "US", value: result.US, color: "#f7b500" },
    ].filter((item) => item.value > 0);
  }, [rows]);

  const tableColumns = useMemo(
    () => [
      {
        title: "",
        key: "drag",
        width: 52,
        align: "center",
        render: (_, record) => (
          <DragHandle
            disabled={dragDisabled || Boolean(loadingActionById[record.id])}
          />
        ),
      },
      {
        title: "公司名稱",
        dataIndex: "companyName",
        key: "companyName",
        render: (_, record) => record.companyName || record.symbol,
      },
      {
        title: "代號",
        dataIndex: "symbol",
        key: "symbol",
        render: (value, record) => (
          <Space>
            <Text code>{value}</Text>
            <Tag color={record.market === "TW" ? "blue" : "gold"}>
              {record.market}
            </Tag>
          </Space>
        ),
      },
      {
        title: "股數",
        dataIndex: "shares",
        key: "shares",
        align: "right",
        render: (value, record) => {
          if (editingHoldingId !== record.id) {
            return Number(value).toLocaleString("en-US", {
              maximumFractionDigits: 4,
            });
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
          );
        },
      },
      {
        title: "最新價格",
        dataIndex: "latestPrice",
        key: "latestPrice",
        align: "right",
        render: (value, record) =>
          formatPrice(value, record.latestCurrency || "TWD"),
      },
      {
        title: "現值 (TWD)",
        dataIndex: "latestValueTwd",
        key: "latestValueTwd",
        align: "right",
        render: (value) => formatTwd(value),
      },
      {
        title: "快照時間",
        dataIndex: "latestCapturedAt",
        key: "latestCapturedAt",
        render: (value) => formatDateTime(value),
      },
      {
        title: "操作",
        key: "actions",
        fixed: "right",
        width: 190,
        render: (_, record) => {
          const rowLoading =
            Boolean(loadingActionById[record.id]) || loadingReorder;
          const isEditing = editingHoldingId === record.id;

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
            );
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
              ></Button>
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
                  disabled={
                    editingHoldingId !== null || rowLoading || loadingReorder
                  }
                  icon={<DeleteOutlined />}
                  aria-label="移除持股"
                ></Button>
              </Popconfirm>
            </Space>
          );
        },
      },
    ],
    [
      dragDisabled,
      editingHoldingId,
      editingShares,
      handleCancelEdit,
      handleEditClick,
      handleRemoveHolding,
      handleSaveShares,
      loadingActionById,
      loadingReorder,
    ],
  );

  const DraggableBodyRow = useCallback(
    (props) => <SortableRow {...props} disabled={dragDisabled} />,
    [dragDisabled],
  );

  useEffect(() => {
    const bootstrap = async () => {
      setLoadingData(true);
      try {
        await loadAllData();
      } catch (error) {
        message.error(error instanceof Error ? error.message : "載入資料失敗");
      } finally {
        setLoadingData(false);
      }
    };

    bootstrap();
  }, [loadAllData, message]);

  const handleAddHolding = async (values) => {
    let upsertResult;

    try {
      setLoadingAddHolding(true);
      upsertResult = await upsertHolding(values);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "新增持股失敗");
      return false;
    }

    try {
      await refreshHoldingPrice({ holdingId: upsertResult.id });
      await loadAllData();
      setIsAddHoldingModalOpen(false);
      message.success("持股已儲存並更新價格");
      return true;
    } catch (error) {
      await loadAllData();
      setIsAddHoldingModalOpen(false);
      message.warning(
        `持股已儲存，但抓價失敗，可稍後按「更新價格」補抓：${error instanceof Error ? error.message : "未知錯誤"}`,
      );
      return true;
    } finally {
      setLoadingAddHolding(false);
    }
  };

  const handleRefreshPrices = async () => {
    try {
      setLoadingRefresh(true);
      const result = await refreshPrices();
      await loadAllData();
      message.success(
        `更新完成，已更新 ${result.updatedCount} 檔（${dayjs(result.lastUpdatedAt).format("HH:mm:ss")}）`,
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : "更新價格失敗");
    } finally {
      setLoadingRefresh(false);
    }
  };

  return (
    <Layout className="app-layout">
      <Header className="app-header">
        <div>
          <Title level={3} className="app-title">
            個人股票現值管理
          </Title>
          {/* <Text type="secondary">PWA + IndexedDB，本地儲存持股與快照</Text> */}
        </div>
        <div className="header-actions" />
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
            <div className="asset-summary-panel">
              <div className="asset-summary-value">
                <Statistic
                  title="總現值（TWD）"
                  value={totalTwd}
                  precision={0}
                  formatter={(value) => formatTwd(Number(value))}
                />
              </div>
              <div className="asset-summary-actions">
                <Button
                  type={isTrendExpanded ? "primary" : "default"}
                  onClick={() => setIsTrendExpanded((prev) => !prev)}
                >
                  趨勢
                </Button>
                <Button
                  type={isPieExpanded ? "primary" : "default"}
                  onClick={() => setIsPieExpanded((prev) => !prev)}
                >
                  分配
                </Button>
              </div>
            </div>
          </Col>

          {(isTrendExpanded || isPieExpanded) && (
            <Col xs={24}>
              <div
                className={`expanded-chart-grid ${isTrendExpanded !== isPieExpanded ? "expanded-chart-grid--single" : ""}`}
              >
                {isTrendExpanded && (
                  <div className="expanded-chart-item expanded-chart-item--visible">
                    <Card title="現值變化走勢">
                      <div className="expanded-chart-frame">
                        <TrendChart
                          range={range}
                          onRangeChange={(value) => setRange(value)}
                          data={trend}
                          height="100%"
                        />
                      </div>
                    </Card>
                  </div>
                )}

                {isPieExpanded && (
                  <div className="expanded-chart-item expanded-chart-item--visible">
                    <Card title="台股 / 美股資產比例">
                      {marketAllocation.length === 0 ? (
                        <Empty description="尚無可計算比例的持股資料" />
                      ) : (
                        <div className="expanded-chart-frame">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={marketAllocation}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius="68%"
                                label={({ name, percent }) =>
                                  `${name} ${(percent * 100).toFixed(0)}%`
                                }
                              >
                                {marketAllocation.map((entry) => (
                                  <Cell key={entry.key} fill={entry.color} />
                                ))}
                              </Pie>
                              <RechartsTooltip
                                formatter={(value) => formatTwd(Number(value))}
                              />
                              <Legend />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </Card>
                  </div>
                )}
              </div>
            </Col>
          )}

          <Col xs={24}>
            <Card
              title={
                <Space size={8}>
                  <span>持股列表</span>
                  <Text type="secondary" className="price-updated-at">
                    價格更新於：{formatDateTime(lastUpdatedAt)}
                  </Text>
                </Space>
              }
              extra={
                <Space>
                  <Tooltip title="更新價格">
                    <Button
                      type="primary"
                      onClick={handleRefreshPrices}
                      loading={loadingRefresh}
                      icon={<ReloadOutlined />}
                      aria-label="更新價格"
                    />
                  </Tooltip>
                  <Tooltip title="新增持股">
                    <Button
                      type="primary"
                      onClick={() => setIsAddHoldingModalOpen(true)}
                      disabled={loadingAddHolding}
                      icon={<PlusOutlined />}
                      aria-label="新增持股"
                    />
                  </Tooltip>
                </Space>
              }
            >
              <Tabs
                activeKey={activeHoldingTab}
                onChange={setActiveHoldingTab}
                items={tabItems}
                style={{ marginBottom: 12 }}
              />
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
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
        </Row>

        <Modal
          title="新增持股"
          open={isAddHoldingModalOpen}
          onCancel={() => {
            if (!loadingAddHolding) {
              setIsAddHoldingModalOpen(false);
            }
          }}
          footer={null}
          destroyOnClose
          maskClosable={!loadingAddHolding}
          keyboard={!loadingAddHolding}
          closable={!loadingAddHolding}
        >
          <HoldingForm
            onSubmit={handleAddHolding}
            loading={loadingAddHolding}
            submitText="新增持股"
            layout="vertical"
          />
        </Modal>
      </Content>
    </Layout>
  );
}

export default App;
