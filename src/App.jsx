import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tooltip,
  Tag,
  Typography,
} from "antd";
import {
  AreaChartOutlined,
  CloudSyncOutlined,
  DeleteOutlined,
  EditOutlined,
  GoogleOutlined,
  LogoutOutlined,
  MenuOutlined,
  PlusOutlined,
  PieChartOutlined,
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
import CashAccountForm from "./components/CashAccountForm";
import TrendChart from "./components/TrendChart";
import {
  getPortfolioView,
  getTrend,
  initSync,
  refreshPrices,
  refreshHoldingPrice,
  getHoldingTagOptions,
  removeHolding,
  reorderHoldings,
  setCurrentUser,
  stopSync,
  syncNow as syncNowPortfolio,
  removeCashAccount,
  getCloudSyncRuntime,
  updateCashAccountBalance,
  updateHoldingTag,
  updateHoldingShares,
  upsertCashAccount,
  upsertHolding,
} from "./services/portfolioService";
import {
  loginWithGoogle,
  logoutGoogle,
  observeAuthState,
} from "./services/firebase/authService";
import { CLOUD_SYNC_UPDATED_EVENT } from "./services/firebase/cloudSyncService";
import { getBankDirectory } from "./services/bankProviders/twBankDirectoryProvider";
import { formatDateTime, formatPrice, formatTwd } from "./utils/formatters";
import "./App.css";

const { Header, Content } = Layout;
const { Text } = Typography;
const PULL_REFRESH_MAX = 96;
const PULL_REFRESH_TRIGGER = 68;

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
  const [cashRows, setCashRows] = useState([]);
  const [totalTwd, setTotalTwd] = useState(0);
  const [stockTotalTwd, setStockTotalTwd] = useState(0);
  const [totalCashTwd, setTotalCashTwd] = useState(0);
  const [trend, setTrend] = useState([]);
  const [range, setRange] = useState("24h");
  const [lastUpdatedAt, setLastUpdatedAt] = useState();
  const [syncError, setSyncError] = useState("");
  const [loadingRefresh, setLoadingRefresh] = useState(false);
  const [loadingAddHolding, setLoadingAddHolding] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingReorder, setLoadingReorder] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [loadingAuthAction, setLoadingAuthAction] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState("idle");
  const [cloudSyncError, setCloudSyncError] = useState("");
  const [cloudLastSyncedAt, setCloudLastSyncedAt] = useState();
  const [cloudOutboxPending, setCloudOutboxPending] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [isTrendExpanded, setIsTrendExpanded] = useState(false);
  const [isPieExpanded, setIsPieExpanded] = useState(false);
  const [activeAllocationTab, setActiveAllocationTab] = useState("assetType");
  const [activeHoldingTab, setActiveHoldingTab] = useState("all");
  const [isAddHoldingModalOpen, setIsAddHoldingModalOpen] = useState(false);
  const [isAddCashModalOpen, setIsAddCashModalOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 768 : false,
  );
  const [loadingAddCashAccount, setLoadingAddCashAccount] = useState(false);
  const [loadingBankOptions, setLoadingBankOptions] = useState(false);
  const [bankOptions, setBankOptions] = useState([]);
  const [holdingTagOptions, setHoldingTagOptions] = useState([
    { value: "STOCK", label: "個股" },
    { value: "ETF", label: "ETF" },
    { value: "BOND", label: "債券" },
  ]);
  const [editingHoldingId, setEditingHoldingId] = useState(null);
  const [editingShares, setEditingShares] = useState(null);
  const [editingHoldingTag, setEditingHoldingTag] = useState(null);
  const [loadingActionById, setLoadingActionById] = useState({});
  const [editingCashAccountId, setEditingCashAccountId] = useState(null);
  const [editingCashBalance, setEditingCashBalance] = useState(null);
  const [loadingCashActionById, setLoadingCashActionById] = useState({});
  const pullStartYRef = useRef(0);
  const pullingRef = useRef(false);

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
    setCashRows(portfolio.cashRows ?? []);
    setTotalTwd(portfolio.totalTwd);
    setStockTotalTwd(portfolio.stockTotalTwd ?? portfolio.totalTwd ?? 0);
    setTotalCashTwd(portfolio.totalCashTwd ?? 0);
    setLastUpdatedAt(portfolio.lastUpdatedAt);
    setSyncError(portfolio.syncStatus === "error" ? portfolio.syncError : "");
    setTrend(trendData);
  }, [range]);

  const setRowLoading = useCallback((id, isLoading) => {
    setLoadingActionById((prev) => ({ ...prev, [id]: isLoading }));
  }, []);

  const setCashRowLoading = useCallback((id, isLoading) => {
    setLoadingCashActionById((prev) => ({ ...prev, [id]: isLoading }));
  }, []);

  const refreshCloudRuntime = useCallback(() => {
    const runtime = getCloudSyncRuntime();
    setCloudOutboxPending(runtime.outboxPending ?? 0);
    if (runtime.lastError) {
      setCloudSyncStatus("error");
      setCloudSyncError(runtime.lastError);
      return runtime;
    }
    if (!authUser) {
      setCloudSyncStatus("idle");
      setCloudSyncError("");
      return runtime;
    }
    if (!runtime.connected) {
      setCloudSyncStatus("offline");
      setCloudSyncError("");
      return runtime;
    }
    if (!runtime.listenersReady) {
      setCloudSyncStatus("syncing");
      setCloudSyncError("");
      return runtime;
    }
    setCloudSyncStatus("success");
    setCloudSyncError("");
    return runtime;
  }, [authUser]);

  const performCloudSync = useCallback(async ({ throwOnError = false } = {}) => {
    if (!authUser) {
      return {
        pushed: 0,
        pulled: 0,
        durationMs: 0,
        triggeredFullResync: false,
      };
    }

    try {
      setCloudSyncStatus("syncing");
      setCloudSyncError("");
      const result = await syncNowPortfolio();
      refreshCloudRuntime();
      setCloudLastSyncedAt(new Date().toISOString());
      return result;
    } catch (error) {
      setCloudSyncStatus("error");
      setCloudSyncError(error instanceof Error ? error.message : "同步失敗");
      if (throwOnError) {
        throw error;
      }
      return {
        pushed: 0,
        pulled: 0,
        durationMs: 0,
        triggeredFullResync: false,
      };
    }
  }, [authUser, refreshCloudRuntime]);

  const handleEditClick = useCallback((record) => {
    setEditingHoldingId(record.id);
    setEditingShares(record.shares);
    setEditingHoldingTag(record.assetTag || "STOCK");
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingHoldingId(null);
    setEditingShares(null);
    setEditingHoldingTag(null);
  }, []);

  const handleCashEditClick = useCallback((record) => {
    setEditingCashAccountId(record.id);
    setEditingCashBalance(record.balanceTwd);
  }, []);

  const handleCashCancelEdit = useCallback(() => {
    setEditingCashAccountId(null);
    setEditingCashBalance(null);
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
        if (editingHoldingTag) {
          await updateHoldingTag({ id: record.id, assetTag: editingHoldingTag });
        }
        await loadAllData();
        await performCloudSync();
        setEditingHoldingId(null);
        setEditingShares(null);
        setEditingHoldingTag(null);
        message.success("股數已更新");
      } catch (error) {
        message.error(error instanceof Error ? error.message : "更新股數失敗");
      } finally {
        setRowLoading(record.id, false);
      }
    },
    [
      editingHoldingTag,
      editingShares,
      loadAllData,
      message,
      performCloudSync,
      setRowLoading,
    ],
  );

  const handleRemoveHolding = useCallback(
    async (record) => {
      try {
        setRowLoading(record.id, true);
        await removeHolding({ id: record.id });
        await loadAllData();
        await performCloudSync();
        if (editingHoldingId === record.id) {
          setEditingHoldingId(null);
          setEditingShares(null);
          setEditingHoldingTag(null);
        }
        message.success("持股已移除");
      } catch (error) {
        message.error(error instanceof Error ? error.message : "移除持股失敗");
      } finally {
        setRowLoading(record.id, false);
      }
    },
    [editingHoldingId, loadAllData, message, performCloudSync, setRowLoading],
  );

  const handleSaveCashBalance = useCallback(
    async (record) => {
      const parsedBalance = Number(editingCashBalance);
      if (!Number.isFinite(parsedBalance) || parsedBalance < 0) {
        message.error("Balance must be a non-negative number");
        return;
      }

      try {
        setCashRowLoading(record.id, true);
        await updateCashAccountBalance({
          id: record.id,
          balanceTwd: parsedBalance,
        });
        await loadAllData();
        await performCloudSync();
        setEditingCashAccountId(null);
        setEditingCashBalance(null);
        message.success("現金餘額已更新");
      } catch (error) {
        message.error(error instanceof Error ? error.message : "更新餘額失敗");
      } finally {
        setCashRowLoading(record.id, false);
      }
    },
    [editingCashBalance, loadAllData, message, performCloudSync, setCashRowLoading],
  );

  const handleRemoveCashAccount = useCallback(
    async (record) => {
      try {
        setCashRowLoading(record.id, true);
        await removeCashAccount({ id: record.id });
        await loadAllData();
        await performCloudSync();
        if (editingCashAccountId === record.id) {
          setEditingCashAccountId(null);
          setEditingCashBalance(null);
        }
        message.success("銀行帳戶已移除");
      } catch (error) {
        message.error(error instanceof Error ? error.message : "移除銀行帳戶失敗");
      } finally {
        setCashRowLoading(record.id, false);
      }
    },
    [
      editingCashAccountId,
      loadAllData,
      message,
      performCloudSync,
      setCashRowLoading,
    ],
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
        await performCloudSync();
      } catch (error) {
        message.error(
          error instanceof Error ? error.message : "持股排序更新失敗",
        );
        await loadAllData();
      } finally {
        setLoadingReorder(false);
      }
    },
    [
      activeHoldingTab,
      dragDisabled,
      filteredRows,
      loadAllData,
      message,
      performCloudSync,
      rows,
    ],
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

  const assetTypeAllocation = useMemo(() => {
    const result = {
      STOCK: 0,
      ETF: 0,
      BOND: 0,
      CASH: 0,
    };

    for (const row of rows) {
      if (typeof row.latestValueTwd !== "number" || row.latestValueTwd <= 0) {
        continue;
      }
      const tag = (row.assetTag || "STOCK").toUpperCase();
      if (tag === "ETF") {
        result.ETF += row.latestValueTwd;
      } else if (tag === "BOND") {
        result.BOND += row.latestValueTwd;
      } else {
        result.STOCK += row.latestValueTwd;
      }
    }

    for (const cashRow of cashRows) {
      const value = Number(cashRow.balanceTwd);
      if (Number.isFinite(value) && value > 0) {
        result.CASH += value;
      }
    }

    return [
      { name: "個股", key: "STOCK", value: result.STOCK, color: "#165dff" },
      { name: "ETF", key: "ETF", value: result.ETF, color: "#36b37e" },
      { name: "債券", key: "BOND", value: result.BOND, color: "#f7b500" },
      { name: "現金", key: "CASH", value: result.CASH, color: "#8c8c8c" },
    ].filter((item) => item.value > 0);
  }, [cashRows, rows]);

  const allocationChartData = useMemo(
    () => (activeAllocationTab === "market" ? marketAllocation : assetTypeAllocation),
    [activeAllocationTab, assetTypeAllocation, marketAllocation],
  );

  const tableColumns = useMemo(
    () => {
      const columns = [
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
        title: "標的",
        key: "target",
        render: (_, record) => (
          <div>
            <div className="holding-main-text">
              {record.companyName || record.symbol}
            </div>
            <Text type="secondary" className="holding-subline">
              {record.symbol}/{record.market === "TW" ? "台股" : "美股"}
            </Text>
          </div>
        ),
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
        title: "分類",
        dataIndex: "assetTag",
        key: "assetTag",
        width: 120,
        render: (value, record) => {
          if (editingHoldingId === record.id) {
            return (
              <Select
                size="small"
                value={editingHoldingTag || value || "STOCK"}
                options={holdingTagOptions}
                onChange={(next) => setEditingHoldingTag(next)}
                style={{ width: 110 }}
              />
            );
          }

          const label =
            holdingTagOptions.find((item) => item.value === value)?.label ||
            record.assetTagLabel ||
            value ||
            "個股";
          return <Tag color="geekblue">{label}</Tag>;
        },
      },
      {
        title: "操作",
        key: "actions",
        fixed: isMobileViewport ? undefined : "right",
        width: isMobileViewport ? undefined : 190,
        align: "left",
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
    ];

      return isMobileViewport
        ? columns.filter((column) => column.key !== "drag")
        : columns;
    },
    [
      dragDisabled,
      editingHoldingId,
      editingHoldingTag,
      editingShares,
      handleCancelEdit,
      handleEditClick,
      handleRemoveHolding,
      handleSaveShares,
      holdingTagOptions,
      isMobileViewport,
      loadingActionById,
      loadingReorder,
    ],
  );

  const cashTableColumns = useMemo(
    () => [
      {
        title: "銀行",
        dataIndex: "bankName",
        key: "bankName",
        render: (_, record) =>
          record.bankCode ? `${record.bankName} (${record.bankCode})` : record.bankName,
      },
      {
        title: "帳戶別名",
        dataIndex: "accountAlias",
        key: "accountAlias",
      },
      {
        title: "現金餘額 (TWD)",
        dataIndex: "balanceTwd",
        key: "balanceTwd",
        align: "right",
        render: (value, record) => {
          if (editingCashAccountId !== record.id) {
            return formatTwd(value);
          }
          return (
            <InputNumber
              min={0}
              step={1000}
              precision={0}
              value={editingCashBalance ?? value}
              onChange={(next) => setEditingCashBalance(next)}
              style={{ width: 160 }}
            />
          );
        },
      },
      {
        title: "更新時間",
        dataIndex: "updatedAt",
        key: "updatedAt",
        render: (value) => formatDateTime(value),
      },
      {
        title: "操作",
        key: "actions",
        width: 180,
        render: (_, record) => {
          const rowLoading = Boolean(loadingCashActionById[record.id]);
          const isEditing = editingCashAccountId === record.id;

          if (isEditing) {
            return (
              <Space>
                <Button
                  type="primary"
                  size="small"
                  loading={rowLoading}
                  onClick={() => handleSaveCashBalance(record)}
                >
                  儲存
                </Button>
                <Button
                  size="small"
                  disabled={rowLoading}
                  onClick={handleCashCancelEdit}
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
                loading={rowLoading}
                onClick={() => handleCashEditClick(record)}
                icon={<EditOutlined />}
                aria-label="編輯現金餘額"
              />
              <Popconfirm
                title="移除此銀行帳戶？"
                description="刪除後不會再列入總現值。"
                okText="刪除"
                cancelText="取消"
                onConfirm={() => handleRemoveCashAccount(record)}
                okButtonProps={{ danger: true, loading: rowLoading }}
              >
                <Button
                  danger
                  size="small"
                  disabled={rowLoading}
                  icon={<DeleteOutlined />}
                  aria-label="移除銀行帳戶"
                />
              </Popconfirm>
            </Space>
          );
        },
      },
    ],
    [
      editingCashAccountId,
      editingCashBalance,
      handleCashCancelEdit,
      handleCashEditClick,
      handleRemoveCashAccount,
      handleSaveCashBalance,
      loadingCashActionById,
    ],
  );

  const DraggableBodyRow = useCallback(
    (props) => <SortableRow {...props} disabled={dragDisabled} />,
    [dragDisabled],
  );

  useEffect(() => {
    let alive = true;

    const unsubscribe = observeAuthState(async (user) => {
      if (!alive) {
        return;
      }

      setAuthUser(user);
      setCurrentUser(user?.uid ?? null);

      if (!user) {
        stopSync();
        setCloudSyncStatus("idle");
        setCloudSyncError("");
        setCloudLastSyncedAt(undefined);
        setAuthReady(true);
        return;
      }

      try {
        setCloudSyncStatus("syncing");
        setCloudSyncError("");
        await initSync(user.uid);
        await loadAllData();
        refreshCloudRuntime();
        await performCloudSync();
        await loadAllData();
        if (!alive) {
          return;
        }
        refreshCloudRuntime();
        setCloudLastSyncedAt(new Date().toISOString());
      } catch (error) {
        if (!alive) {
          return;
        }
        setCloudSyncStatus("error");
        setCloudSyncError(error instanceof Error ? error.message : "同步初始化失敗");
      } finally {
        if (alive) {
          setAuthReady(true);
        }
      }
    });

    return () => {
      alive = false;
      unsubscribe();
      stopSync();
      setCurrentUser(null);
    };
  }, [loadAllData, performCloudSync, refreshCloudRuntime]);

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

  useEffect(() => {
    const onCloudUpdated = async () => {
      try {
        await loadAllData();
        refreshCloudRuntime();
        setCloudLastSyncedAt(new Date().toISOString());
      } catch {
        // Keep UI stable; runtime state will surface errors.
      }
    };

    window.addEventListener(CLOUD_SYNC_UPDATED_EVENT, onCloudUpdated);
    return () => {
      window.removeEventListener(CLOUD_SYNC_UPDATED_EVENT, onCloudUpdated);
    };
  }, [loadAllData, refreshCloudRuntime]);

  useEffect(() => {
    const onResize = () => {
      setIsMobileViewport(window.innerWidth <= 768);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    const loadHoldingTags = async () => {
      try {
        const options = await getHoldingTagOptions();
        if (Array.isArray(options) && options.length > 0) {
          setHoldingTagOptions(
            options.map((item) => ({
              value: item.value,
              label: item.label,
            })),
          );
        }
      } catch {
        // Keep built-in default options.
      }
    };

    loadHoldingTags();
  }, []);

  useEffect(() => {
    if (!authUser) {
      setCloudOutboxPending(0);
      return undefined;
    }

    refreshCloudRuntime();
    const timer = window.setInterval(() => {
      refreshCloudRuntime();
    }, 2000);

    return () => {
      window.clearInterval(timer);
    };
  }, [authUser, refreshCloudRuntime]);

  useEffect(() => {
    if (!isAddCashModalOpen) {
      return;
    }

    const loadBankOptions = async () => {
      try {
        setLoadingBankOptions(true);
        const directory = await getBankDirectory();
        setBankOptions(directory);
      } catch (error) {
        message.warning(
          error instanceof Error
            ? `銀行名單載入失敗，仍可手動輸入：${error.message}`
            : "銀行名單載入失敗，仍可手動輸入",
        );
      } finally {
        setLoadingBankOptions(false);
      }
    };

    loadBankOptions();
  }, [isAddCashModalOpen, message]);

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
      await performCloudSync();
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
      await performCloudSync();
      message.success(
        `更新完成，已更新 ${result.updatedCount} 檔（${dayjs(result.lastUpdatedAt).format("HH:mm:ss")}）`,
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : "更新價格失敗");
    } finally {
      setLoadingRefresh(false);
    }
  };

  const handleAddCashAccount = async (values) => {
    const selected = bankOptions.find((item) => item.bankName === values.bankName);

    try {
      setLoadingAddCashAccount(true);
      await upsertCashAccount({
        bankCode: selected?.bankCode,
        bankName: values.bankName,
        accountAlias: values.accountAlias,
        balanceTwd: values.balanceTwd,
      });
      await loadAllData();
      await performCloudSync();
      setIsAddCashModalOpen(false);
      message.success("銀行現金帳戶已儲存");
      return true;
    } catch (error) {
      message.error(error instanceof Error ? error.message : "新增銀行帳戶失敗");
      return false;
    } finally {
      setLoadingAddCashAccount(false);
    }
  };

  const cloudSyncText = useMemo(() => {
    if (!authUser) {
      return "未登入（僅本機）";
    }
    if (cloudSyncStatus === "syncing") {
      return "即時同步連線中...";
    }
    if (cloudSyncStatus === "offline") {
      return `離線（待同步 ${cloudOutboxPending}）`;
    }
    if (cloudSyncStatus === "error") {
      return `同步失敗${cloudSyncError ? `：${cloudSyncError}` : ""}`;
    }
    if (cloudOutboxPending > 0) {
      return `即時同步中（待同步 ${cloudOutboxPending}）`;
    }
    return "即時同步中";
  }, [authUser, cloudOutboxPending, cloudSyncError, cloudSyncStatus]);

  const cloudLastSyncedText = useMemo(() => {
    if (!authUser) {
      return "";
    }
    return `雲端狀態更新時間：${formatDateTime(cloudLastSyncedAt)}（重新整理可重建同步）`;
  }, [authUser, cloudLastSyncedAt]);

  const handleGoogleLogin = async () => {
    try {
      setLoadingAuthAction(true);
      await loginWithGoogle();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Google 登入失敗");
    } finally {
      setLoadingAuthAction(false);
    }
  };

  const handleGoogleLogout = async () => {
    try {
      setLoadingAuthAction(true);
      await logoutGoogle();
      message.success("已登出 Google");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "登出失敗");
    } finally {
      setLoadingAuthAction(false);
    }
  };

  const handlePullRefresh = useCallback(async () => {
    if (isPullRefreshing) {
      return;
    }

    try {
      setIsPullRefreshing(true);
      setPullDistance(PULL_REFRESH_TRIGGER);
      if (authUser) {
        await initSync(authUser.uid);
        await performCloudSync();
      }
      await loadAllData();
      refreshCloudRuntime();
      setCloudLastSyncedAt(new Date().toISOString());
      message.success("已重新連線並更新資料");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "重新整理失敗");
    } finally {
      pullingRef.current = false;
      pullStartYRef.current = 0;
      setPullDistance(0);
      setIsPullRefreshing(false);
    }
  }, [authUser, isPullRefreshing, loadAllData, message, performCloudSync, refreshCloudRuntime]);

  const handleTouchStart = useCallback((event) => {
    if (isPullRefreshing || event.touches.length !== 1) {
      return;
    }
    if (window.scrollY > 0) {
      pullingRef.current = false;
      return;
    }
    pullStartYRef.current = event.touches[0].clientY;
    pullingRef.current = true;
  }, [isPullRefreshing]);

  const handleTouchMove = useCallback((event) => {
    if (!pullingRef.current || isPullRefreshing) {
      return;
    }
    const delta = event.touches[0].clientY - pullStartYRef.current;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }
    if (window.scrollY > 0) {
      setPullDistance(0);
      return;
    }
    const next = Math.min(PULL_REFRESH_MAX, Math.round(delta * 0.55));
    setPullDistance(next);
    event.preventDefault();
  }, [isPullRefreshing]);

  const handleTouchEnd = useCallback(() => {
    if (!pullingRef.current || isPullRefreshing) {
      return;
    }
    if (pullDistance >= PULL_REFRESH_TRIGGER) {
      handlePullRefresh();
      return;
    }
    pullingRef.current = false;
    pullStartYRef.current = 0;
    setPullDistance(0);
  }, [handlePullRefresh, isPullRefreshing, pullDistance]);

  return (
    <Layout className="app-layout">
      <Header className="app-header">
        <div className="header-spacer" />
        <img
          src={`${import.meta.env.BASE_URL}vite.svg`}
          alt="My Stock logo"
          className="header-logo"
        />
        <div className="header-auth">
          <Space size={8}>
            <div className="header-sync-meta">
              <Text type={cloudSyncStatus === "error" ? "danger" : "secondary"}>
                <CloudSyncOutlined style={{ marginRight: 6 }} />
                {authReady ? cloudSyncText : "讀取登入狀態中..."}
              </Text>
            </div>
            {authUser ? (
              <Space size={6}>
                <Tooltip title={authUser.email || "Google 帳號"}>
                  <Button
                    size="small"
                    icon={<LogoutOutlined />}
                    onClick={handleGoogleLogout}
                    loading={loadingAuthAction}
                    aria-label="Google 登出"
                  />
                </Tooltip>
              </Space>
            ) : (
              <Button
                size="small"
                icon={<GoogleOutlined />}
                onClick={handleGoogleLogin}
                loading={loadingAuthAction}
              >
                Google 登入
              </Button>
            )}
          </Space>
        </div>
      </Header>

      <Content
        className="app-content"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div
          className={`pull-refresh-indicator ${isPullRefreshing ? "is-refreshing" : ""}`}
          style={{ height: isPullRefreshing ? PULL_REFRESH_TRIGGER : pullDistance }}
        >
          <Text type="secondary">
            {isPullRefreshing
              ? "重新連線中..."
              : pullDistance >= PULL_REFRESH_TRIGGER
                ? "放開以重新連線"
                : "下拉可重新連線"}
          </Text>
        </div>
        {syncError && (
          <Alert
            type="error"
            showIcon
            message="上次同步發生錯誤"
            description={syncError}
            style={{ marginBottom: 16 }}
          />
        )}
        {!authUser && authReady && (
          <Alert
            type="info"
            showIcon
            message="目前為本機模式"
            description="登入 Google 後可將持股與快照同步到你的其他裝置。"
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
                <Text type="secondary" className="asset-total-breakdown">
                  股票 {formatTwd(stockTotalTwd)} + 現金 {formatTwd(totalCashTwd)}
                </Text>
              </div>
              <div className="asset-summary-actions">
                <Button
                  type={isTrendExpanded ? "primary" : "default"}
                  onClick={() => setIsTrendExpanded((prev) => !prev)}
                  icon={<AreaChartOutlined />}
                >
                  趨勢
                </Button>
                <Button
                  type={isPieExpanded ? "primary" : "default"}
                  onClick={() =>
                    setIsPieExpanded((prev) => {
                      const next = !prev;
                      if (next) {
                        setActiveAllocationTab("assetType");
                      }
                      return next;
                    })
                  }
                  icon={<PieChartOutlined />}
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
                    <Card title="資產分配">
                      <Tabs
                        className="allocation-tabs"
                        activeKey={activeAllocationTab}
                        onChange={setActiveAllocationTab}
                        items={[
                          { key: "assetType", label: "資產類型比例" },
                          { key: "market", label: "台股 / 美股比例" },
                        ]}
                      />
                      {allocationChartData.length === 0 ? (
                        <Empty
                          description={
                            activeAllocationTab === "market"
                              ? "尚無可計算台股 / 美股比例的持股資料"
                              : "尚無可計算資產類型比例的資料"
                          }
                        />
                      ) : (
                        <div className="expanded-chart-frame">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={allocationChartData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius="68%"
                                label={({ name, percent }) =>
                                  `${name} ${(percent * 100).toFixed(0)}%`
                                }
                              >
                                {allocationChartData.map((entry) => (
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
                    scroll={{ x: isMobileViewport ? 860 : 980 }}
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
            <Card
              title="銀行現金資產"
              extra={
                <Tooltip title="新增銀行帳戶">
                  <Button
                    type="primary"
                    onClick={() => setIsAddCashModalOpen(true)}
                    disabled={loadingAddCashAccount}
                    icon={<PlusOutlined />}
                    aria-label="新增銀行帳戶"
                  />
                </Tooltip>
              }
            >
              <Table
                rowKey="id"
                dataSource={cashRows}
                columns={cashTableColumns}
                pagination={false}
                scroll={{ x: 860 }}
                locale={{
                  emptyText: "尚未新增銀行現金帳戶",
                }}
              />
            </Card>
          </Col>
        </Row>

        {authUser && (
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <Text type="secondary" className="cloud-last-sync-time">
              {cloudLastSyncedText}
            </Text>
          </div>
        )}

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
            holdingTagOptions={holdingTagOptions}
          />
        </Modal>

        <Modal
          title="新增銀行帳戶"
          open={isAddCashModalOpen}
          onCancel={() => {
            if (!loadingAddCashAccount) {
              setIsAddCashModalOpen(false);
            }
          }}
          footer={null}
          destroyOnClose
          maskClosable={!loadingAddCashAccount}
          keyboard={!loadingAddCashAccount}
          closable={!loadingAddCashAccount}
        >
          <CashAccountForm
            onSubmit={handleAddCashAccount}
            loading={loadingAddCashAccount}
            loadingBankOptions={loadingBankOptions}
            bankOptions={bankOptions}
            submitText="新增銀行帳戶"
          />
        </Modal>
      </Content>
    </Layout>
  );
}

export default App;
