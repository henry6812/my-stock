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
  Dropdown,
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
  DownOutlined,
  DeleteOutlined,
  EditOutlined,
  GoogleOutlined,
  LogoutOutlined,
  MenuOutlined,
  PlusOutlined,
  PieChartOutlined,
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
import anime from "animejs/lib/anime.es.js";
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
const NUMBER_ANIMATION_DURATION_MS = 2000;
const PROGRESS_UNIT_TWD = 10000000;
const PROGRESS_MIN_MAX_TWD = 30000000;

const formatSignedPrice = (value, currency = "TWD") => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 4,
    signDisplay: "always",
  }).format(value);
};

const formatSignedTwd = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    signDisplay: "always",
  }).format(Math.round(value));
};

const formatChangePercent = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

const floorToTenThousand = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed / 10000) * 10000;
};

const formatStopLabel = (value) => {
  if (value === 0) {
    return "0";
  }
  return `${Math.round(value / 10000)}萬`;
};

const filterRowsByHoldingTab = (targetRows, tab) => {
  if (tab === "tw") {
    return targetRows.filter((row) => row.market === "TW");
  }
  if (tab === "us") {
    return targetRows.filter((row) => row.market === "US");
  }
  return targetRows;
};

const clampRatio = (value) => Math.min(1, Math.max(0, value));

const getProgressDisplayTargets = (currentTotal, baselineTotal) => {
  const flooredCurrent = floorToTenThousand(currentTotal);
  const flooredBaseline = floorToTenThousand(baselineTotal);
  const maxValue = Math.max(
    flooredCurrent,
    flooredBaseline,
    PROGRESS_MIN_MAX_TWD,
  );
  const progressMax =
    Math.ceil(maxValue / PROGRESS_UNIT_TWD) * PROGRESS_UNIT_TWD || 0;

  if (progressMax <= 0) {
    return {
      currentRatio: 0,
      baselineRatio: 0,
      deltaLeftRatio: 0,
      deltaWidthRatio: 0,
    };
  }

  const currentRatio = clampRatio(flooredCurrent / progressMax);
  const baselineRatio = clampRatio(flooredBaseline / progressMax);

  return {
    currentRatio,
    baselineRatio,
    deltaLeftRatio: Math.min(currentRatio, baselineRatio),
    deltaWidthRatio: Math.abs(currentRatio - baselineRatio),
  };
};

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
  const [displayTotalTwd, setDisplayTotalTwd] = useState(0);
  const [baselineTotalTwd, setBaselineTotalTwd] = useState(0);
  const [totalChangeTwd, setTotalChangeTwd] = useState(undefined);
  const [totalChangePct, setTotalChangePct] = useState(null);
  const [trend, setTrend] = useState([]);
  const [range, setRange] = useState("24h");
  const [lastUpdatedAt, setLastUpdatedAt] = useState();
  const [nowTick, setNowTick] = useState(Date.now());
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
  const [rowAnimationValues, setRowAnimationValues] = useState({});
  const [progressDisplayRatio, setProgressDisplayRatio] = useState(0);
  const [baselineDisplayRatio, setBaselineDisplayRatio] = useState(0);
  const [deltaDisplayLeftRatio, setDeltaDisplayLeftRatio] = useState(0);
  const [deltaDisplayWidthRatio, setDeltaDisplayWidthRatio] = useState(0);
  const [markerDisplayWan, setMarkerDisplayWan] = useState(0);
  const pullStartYRef = useRef(0);
  const pullingRef = useRef(false);
  const activeHoldingTabRef = useRef("all");
  const shouldAnimateNumbersRef = useRef(false);
  const didRunInitialAnimationRef = useRef(false);
  const totalAnimationRef = useRef(null);
  const rowAnimationTargetRef = useRef([]);
  const rowAnimationInstanceRef = useRef(null);
  const progressAnimationRef = useRef(null);
  const markerValueAnimationRef = useRef(null);
  const animationLockedUntilRef = useRef(0);
  const latestTotalTwdRef = useRef(0);
  const latestMarkerWanRef = useRef(0);
  const latestProgressTargetsRef = useRef({
    currentRatio: 0,
    baselineRatio: 0,
    deltaLeftRatio: 0,
    deltaWidthRatio: 0,
  });

  const isNumberAnimationLocked = useCallback(
    () => Date.now() < animationLockedUntilRef.current,
    [],
  );

  const beginNumberAnimationLock = useCallback(() => {
    animationLockedUntilRef.current = Date.now() + NUMBER_ANIMATION_DURATION_MS;
  }, []);

  const stopNumberAnimations = useCallback(
    (reason = "auto") => {
      const canStop =
        reason === "manual" || reason === "force" || !isNumberAnimationLocked();
      if (!canStop) {
        return false;
      }

      if (totalAnimationRef.current) {
        totalAnimationRef.current.pause();
        totalAnimationRef.current = null;
      }
      if (rowAnimationInstanceRef.current) {
        rowAnimationInstanceRef.current.pause();
        rowAnimationInstanceRef.current = null;
      }
      animationLockedUntilRef.current = 0;
      return true;
    },
    [isNumberAnimationLocked],
  );

  const stopProgressAnimation = useCallback(
    (reason = "auto") => {
      const canStop =
        reason === "manual" || reason === "force" || !isNumberAnimationLocked();
      if (!canStop) {
        return false;
      }

      if (progressAnimationRef.current) {
        progressAnimationRef.current.pause();
        progressAnimationRef.current = null;
      }
      return true;
    },
    [isNumberAnimationLocked],
  );

  const stopMarkerValueAnimation = useCallback(
    (reason = "auto") => {
      const canStop =
        reason === "manual" || reason === "force" || !isNumberAnimationLocked();
      if (!canStop) {
        return false;
      }

      if (markerValueAnimationRef.current) {
        markerValueAnimationRef.current.pause();
        markerValueAnimationRef.current = null;
      }
      return true;
    },
    [isNumberAnimationLocked],
  );

  const animateTotalValue = useCallback((targetValue) => {
    const parsedTarget = Number(targetValue);
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      setDisplayTotalTwd(Number.isFinite(parsedTarget) ? parsedTarget : 0);
      return;
    }

    const target = { value: parsedTarget * 0.99999 };
    setDisplayTotalTwd(target.value);
    totalAnimationRef.current = anime({
      targets: target,
      value: parsedTarget,
      duration: NUMBER_ANIMATION_DURATION_MS,
      easing: "easeOutExpo",
      update: () => {
        setDisplayTotalTwd(target.value);
      },
      complete: () => {
        setDisplayTotalTwd(latestTotalTwdRef.current);
      },
    });
  }, []);

  const animateVisibleRows = useCallback((visibleRows) => {
    if (!Array.isArray(visibleRows) || visibleRows.length === 0) {
      setRowAnimationValues({});
      return;
    }

    const targets = visibleRows
      .map((row) => {
        const next = { id: row.id };
        if (
          typeof row.latestPrice === "number" &&
          Number.isFinite(row.latestPrice) &&
          row.latestPrice > 0
        ) {
          next.latestPrice = row.latestPrice * 0.9;
          next.targetLatestPrice = row.latestPrice;
        }
        if (
          typeof row.latestValueTwd === "number" &&
          Number.isFinite(row.latestValueTwd) &&
          row.latestValueTwd > 0
        ) {
          next.latestValueTwd = row.latestValueTwd * 0.9;
          next.targetLatestValueTwd = row.latestValueTwd;
        }
        return next;
      })
      .filter(
        (item) =>
          typeof item.latestPrice === "number" ||
          typeof item.latestValueTwd === "number",
      );

    if (targets.length === 0) {
      setRowAnimationValues({});
      return;
    }

    rowAnimationTargetRef.current = targets;
    setRowAnimationValues(
      targets.reduce((acc, item) => {
        acc[item.id] = {
          latestPrice: item.latestPrice,
          latestValueTwd: item.latestValueTwd,
        };
        return acc;
      }, {}),
    );

    rowAnimationInstanceRef.current = anime({
      targets,
      duration: NUMBER_ANIMATION_DURATION_MS,
      easing: "easeOutExpo",
      latestPrice: (target) =>
        typeof target.targetLatestPrice === "number"
          ? target.targetLatestPrice
          : target.latestPrice,
      latestValueTwd: (target) =>
        typeof target.targetLatestValueTwd === "number"
          ? target.targetLatestValueTwd
          : target.latestValueTwd,
      update: () => {
        setRowAnimationValues(
          rowAnimationTargetRef.current.reduce((acc, item) => {
            acc[item.id] = {
              latestPrice: item.latestPrice,
              latestValueTwd: item.latestValueTwd,
            };
            return acc;
          }, {}),
        );
      },
      complete: () => {
        setRowAnimationValues({});
      },
    });
  }, []);

  const animateProgress = useCallback((targetRatios) => {
    const target = {
      current: 0,
      baseline: 0,
      deltaLeft: 0,
      deltaWidth: 0,
    };
    setProgressDisplayRatio(0);
    setBaselineDisplayRatio(0);
    setDeltaDisplayLeftRatio(0);
    setDeltaDisplayWidthRatio(0);

    progressAnimationRef.current = anime({
      targets: target,
      current: targetRatios.currentRatio,
      baseline: targetRatios.baselineRatio,
      deltaLeft: targetRatios.deltaLeftRatio,
      deltaWidth: targetRatios.deltaWidthRatio,
      duration: NUMBER_ANIMATION_DURATION_MS,
      easing: "easeOutExpo",
      update: () => {
        setProgressDisplayRatio(target.current);
        setBaselineDisplayRatio(target.baseline);
        setDeltaDisplayLeftRatio(target.deltaLeft);
        setDeltaDisplayWidthRatio(target.deltaWidth);
      },
      complete: () => {
        setProgressDisplayRatio(latestProgressTargetsRef.current.currentRatio);
        setBaselineDisplayRatio(latestProgressTargetsRef.current.baselineRatio);
        setDeltaDisplayLeftRatio(latestProgressTargetsRef.current.deltaLeftRatio);
        setDeltaDisplayWidthRatio(
          latestProgressTargetsRef.current.deltaWidthRatio,
        );
      },
    });
  }, []);

  const animateMarkerValue = useCallback((targetWan) => {
    const safeTargetWan =
      Number.isFinite(targetWan) && targetWan > 0 ? Math.floor(targetWan) : 0;

    if (safeTargetWan === 0) {
      setMarkerDisplayWan(0);
      return;
    }

    const target = { wan: 0 };
    setMarkerDisplayWan(0);

    markerValueAnimationRef.current = anime({
      targets: target,
      wan: safeTargetWan,
      duration: NUMBER_ANIMATION_DURATION_MS,
      easing: "easeOutExpo",
      update: () => {
        setMarkerDisplayWan(Math.floor(target.wan));
      },
      complete: () => {
        setMarkerDisplayWan(latestMarkerWanRef.current);
      },
    });
  }, []);

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
    latestTotalTwdRef.current = portfolio.totalTwd;
    setBaselineTotalTwd(portfolio.baselineTotalTwd ?? 0);
    setTotalChangeTwd(portfolio.totalChangeTwd);
    setTotalChangePct(portfolio.totalChangePct ?? null);
    setLastUpdatedAt(portfolio.lastUpdatedAt);
    setSyncError(portfolio.syncStatus === "error" ? portfolio.syncError : "");
    setTrend(trendData);
    const progressTargets = getProgressDisplayTargets(
      portfolio.totalTwd,
      portfolio.baselineTotalTwd ?? 0,
    );
    const targetMarkerWan = Math.floor(
      floorToTenThousand(portfolio.totalTwd) / 10000,
    );
    latestMarkerWanRef.current = Number.isFinite(targetMarkerWan)
      ? Math.max(0, targetMarkerWan)
      : 0;
    latestProgressTargetsRef.current = progressTargets;

    const shouldAnimateNow =
      !didRunInitialAnimationRef.current || shouldAnimateNumbersRef.current;
    if (shouldAnimateNow) {
      didRunInitialAnimationRef.current = true;
      shouldAnimateNumbersRef.current = false;
      stopNumberAnimations("manual");
      stopProgressAnimation("manual");
      stopMarkerValueAnimation("manual");
      beginNumberAnimationLock();
      animateTotalValue(portfolio.totalTwd);
      animateProgress(progressTargets);
      animateMarkerValue(latestMarkerWanRef.current);
      animateVisibleRows(
        filterRowsByHoldingTab(
          Array.isArray(portfolio.rows) ? portfolio.rows : [],
          activeHoldingTabRef.current,
        ),
      );
    } else {
      if (!isNumberAnimationLocked()) {
        stopNumberAnimations("auto");
        stopProgressAnimation("auto");
        stopMarkerValueAnimation("auto");
        setDisplayTotalTwd(portfolio.totalTwd);
        setRowAnimationValues({});
        setProgressDisplayRatio(progressTargets.currentRatio);
        setBaselineDisplayRatio(progressTargets.baselineRatio);
        setDeltaDisplayLeftRatio(progressTargets.deltaLeftRatio);
        setDeltaDisplayWidthRatio(progressTargets.deltaWidthRatio);
        setMarkerDisplayWan(latestMarkerWanRef.current);
      }
    }

    console.groupCollapsed(
      `[NetWorth Diagnostics] ${dayjs().format("YYYY/MM/DD HH:mm:ss")}`,
    );
    console.info("Current Total (TWD):", portfolio.totalTwd);
    console.info("Current Stock Total (TWD):", portfolio.stockTotalTwd);
    console.info("Current Cash Total (TWD):", portfolio.totalCashTwd);
    console.info("Baseline At (UTC ISO):", portfolio.baselineAt);
    console.info("Baseline Total (TWD):", portfolio.baselineTotalTwd);
    console.info(
      "Baseline Stock Total (TWD):",
      portfolio.baselineStockTotalTwd,
    );
    console.info("Baseline Cash Total (TWD):", portfolio.baselineCashTotalTwd);
    console.info("Total Change (TWD):", portfolio.totalChangeTwd);
    console.info("Total Change (%):", portfolio.totalChangePct);
    console.groupEnd();
  }, [
    animateProgress,
    animateMarkerValue,
    animateTotalValue,
    animateVisibleRows,
    beginNumberAnimationLock,
    isNumberAnimationLocked,
    range,
    stopMarkerValueAnimation,
    stopNumberAnimations,
    stopProgressAnimation,
  ]);

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

  const performCloudSync = useCallback(
    async ({ throwOnError = false } = {}) => {
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
    },
    [authUser, refreshCloudRuntime],
  );

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
          await updateHoldingTag({
            id: record.id,
            assetTag: editingHoldingTag,
          });
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
    [
      editingCashBalance,
      loadAllData,
      message,
      performCloudSync,
      setCashRowLoading,
    ],
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
        message.error(
          error instanceof Error ? error.message : "移除銀行帳戶失敗",
        );
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
    return filterRowsByHoldingTab(rows, activeHoldingTab);
  }, [activeHoldingTab, rows]);

  useEffect(() => {
    activeHoldingTabRef.current = activeHoldingTab;
  }, [activeHoldingTab]);

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
    () =>
      activeAllocationTab === "market" ? marketAllocation : assetTypeAllocation,
    [activeAllocationTab, assetTypeAllocation, marketAllocation],
  );

  const getDeltaClassName = useCallback((value) => {
    if (typeof value !== "number" || Number.isNaN(value) || value === 0) {
      return "cell-delta cell-delta--flat";
    }
    return value > 0
      ? "cell-delta cell-delta--up"
      : "cell-delta cell-delta--down";
  }, []);

  const renderPriceDelta = useCallback(
    (record) => {
      if (!record.hasPreviousSnapshot) {
        return <div className="cell-delta cell-delta--flat">--</div>;
      }

      const delta = record.priceChange;
      if (typeof delta !== "number" || Number.isNaN(delta)) {
        return <div className="cell-delta cell-delta--flat">--</div>;
      }

      if (delta === 0) {
        return <div className="cell-delta cell-delta--flat">0.00 (0.00%)</div>;
      }

      const arrow = delta > 0 ? "▲" : "▼";
      return (
        <div className={getDeltaClassName(delta)}>
          {arrow} {formatSignedPrice(delta, record.latestCurrency || "TWD")} (
          {formatChangePercent(record.priceChangePct)})
        </div>
      );
    },
    [getDeltaClassName],
  );

  const renderValueDelta = useCallback(
    (record) => {
      if (!record.hasPreviousSnapshot) {
        return <div className="cell-delta cell-delta--flat">--</div>;
      }

      const delta = record.valueChangeTwd;
      if (typeof delta !== "number" || Number.isNaN(delta)) {
        return <div className="cell-delta cell-delta--flat">--</div>;
      }

      if (delta === 0) {
        return <div className="cell-delta cell-delta--flat">0.00 (0.00%)</div>;
      }

      const arrow = delta > 0 ? "▲" : "▼";
      return (
        <div className={getDeltaClassName(delta)}>
          {arrow} {formatSignedTwd(delta)} (
          {formatChangePercent(record.valueChangePct)})
        </div>
      );
    },
    [getDeltaClassName],
  );

  const tableColumns = useMemo(() => {
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
        render: (value, record) => {
          const animatedValue = rowAnimationValues[record.id]?.latestPrice;
          const displayValue =
            typeof animatedValue === "number" && Number.isFinite(animatedValue)
              ? animatedValue
              : value;
          return (
            <div className="cell-with-delta">
              <div className="cell-main-value">
                {formatPrice(displayValue, record.latestCurrency || "TWD")}
              </div>
              {renderPriceDelta(record)}
            </div>
          );
        },
      },
      {
        title: "現值 (TWD)",
        dataIndex: "latestValueTwd",
        key: "latestValueTwd",
        align: "right",
        render: (value, record) => {
          const animatedValue = rowAnimationValues[record.id]?.latestValueTwd;
          const displayValue =
            typeof animatedValue === "number" && Number.isFinite(animatedValue)
              ? animatedValue
              : value;
          return (
            <div className="cell-with-delta">
              <div className="cell-main-value">{formatTwd(displayValue)}</div>
              {renderValueDelta(record)}
            </div>
          );
        },
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
  }, [
    dragDisabled,
    editingHoldingId,
    editingHoldingTag,
    editingShares,
    handleCancelEdit,
    handleEditClick,
    handleRemoveHolding,
    renderPriceDelta,
    handleSaveShares,
    holdingTagOptions,
    isMobileViewport,
    loadingActionById,
    loadingReorder,
    rowAnimationValues,
    renderValueDelta,
  ]);

  const cashTableColumns = useMemo(
    () => [
      {
        title: "帳戶",
        key: "account",
        width: "25%",
        render: (_, record) => (
          <div>
            <div className="holding-main-text">
              {record.bankCode
                ? `${record.bankName} (${record.bankCode})`
                : record.bankName}
            </div>
            <Text type="secondary" className="holding-subline">
              {record.accountAlias}
            </Text>
          </div>
        ),
      },
      {
        title: "現金餘額 (TWD)",
        dataIndex: "balanceTwd",
        key: "balanceTwd",
        width: "25%",
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
        width: "25%",
        render: (value) => formatDateTime(value),
      },
      {
        title: "操作",
        key: "actions",
        width: "25%",
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
        setCloudSyncError(
          error instanceof Error ? error.message : "同步初始化失敗",
        );
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
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(
    () => () => {
      stopNumberAnimations("force");
      stopProgressAnimation("force");
      stopMarkerValueAnimation("force");
    },
    [stopMarkerValueAnimation, stopNumberAnimations, stopProgressAnimation],
  );

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

  const handleRefreshPrices = async (market = "ALL") => {
    const targetMarket =
      market === "TW" || market === "US" || market === "ALL" ? market : "ALL";
    try {
      setLoadingRefresh(true);
      const result = await refreshPrices({ market: targetMarket });
      shouldAnimateNumbersRef.current = true;
      await loadAllData();
      await performCloudSync();
      if (result.targetCount === 0) {
        if (targetMarket === "TW") {
          message.info("目前沒有可更新的台股持股");
        } else if (targetMarket === "US") {
          message.info("目前沒有可更新的美股持股");
        } else {
          message.info("目前沒有可更新的持股");
        }
        return;
      }

      const updatedLabel = `${result.updatedCount}/${result.targetCount} 檔`;
      if (targetMarket === "TW") {
        message.success(
          `台股更新完成，已更新 ${updatedLabel}（${dayjs(result.lastUpdatedAt).format("HH:mm:ss")}）`,
        );
      } else if (targetMarket === "US") {
        message.success(
          `美股更新完成，已更新 ${updatedLabel}（${dayjs(result.lastUpdatedAt).format("HH:mm:ss")}）`,
        );
      } else {
        message.success(
          `更新完成，已更新 ${updatedLabel}（${dayjs(result.lastUpdatedAt).format("HH:mm:ss")}）`,
        );
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "更新價格失敗");
    } finally {
      setLoadingRefresh(false);
    }
  };

  const handleAddCashAccount = async (values) => {
    const selected = bankOptions.find(
      (item) => item.bankName === values.bankName,
    );

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
      message.error(
        error instanceof Error ? error.message : "新增銀行帳戶失敗",
      );
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

  const priceUpdatedRelativeText = useMemo(() => {
    if (!lastUpdatedAt) {
      return "尚未更新";
    }

    const updatedMs = dayjs(lastUpdatedAt).valueOf();
    if (!Number.isFinite(updatedMs)) {
      return "尚未更新";
    }

    const diffMinutes = Math.max(0, Math.floor((nowTick - updatedMs) / 60000));
    if (diffMinutes < 60) {
      return `${diffMinutes}m 前`;
    }
    if (diffMinutes < 1440) {
      return `${Math.floor(diffMinutes / 60)}h 前`;
    }

    const days = Math.floor(diffMinutes / 1440);
    const hours = Math.floor((diffMinutes % 1440) / 60);
    return `${days}d ${hours}h 前`;
  }, [lastUpdatedAt, nowTick]);

  const flooredCurrentTwd = useMemo(
    () => floorToTenThousand(totalTwd),
    [totalTwd],
  );
  const flooredBaselineTwd = useMemo(
    () => floorToTenThousand(baselineTotalTwd),
    [baselineTotalTwd],
  );
  const currentMarkerWanLabel = useMemo(
    () => `${Math.max(0, markerDisplayWan).toLocaleString("zh-TW")} 萬`,
    [markerDisplayWan],
  );

  const progressMaxTwd = useMemo(() => {
    const unit = 10000000;
    const maxValue = Math.max(flooredCurrentTwd, flooredBaselineTwd, 30000000);
    return Math.ceil(maxValue / unit) * unit;
  }, [flooredBaselineTwd, flooredCurrentTwd]);

  const progressStops = useMemo(() => {
    const unit = 10000000;
    const stops = [];
    for (let value = 0; value <= progressMaxTwd; value += unit) {
      stops.push(value);
    }
    return stops;
  }, [progressMaxTwd]);

  const visibleProgressStops = useMemo(() => {
    if (!isMobileViewport || progressStops.length <= 5) {
      return progressStops;
    }
    return progressStops.filter(
      (_, index) =>
        index === 0 || index === progressStops.length - 1 || index % 2 === 0,
    );
  }, [isMobileViewport, progressStops]);

  const currentRatio = useMemo(() => {
    if (progressMaxTwd <= 0) {
      return 0;
    }
    return Math.min(1, Math.max(0, flooredCurrentTwd / progressMaxTwd));
  }, [flooredCurrentTwd, progressMaxTwd]);

  const baselineRatio = useMemo(() => {
    if (progressMaxTwd <= 0) {
      return 0;
    }
    return Math.min(1, Math.max(0, flooredBaselineTwd / progressMaxTwd));
  }, [flooredBaselineTwd, progressMaxTwd]);

  const isMarkerOverlap = useMemo(
    () => Math.abs(currentRatio - baselineRatio) <= 0.02,
    [baselineRatio, currentRatio],
  );
  const deltaSegmentLeftRatio = useMemo(
    () => Math.min(currentRatio, baselineRatio),
    [baselineRatio, currentRatio],
  );
  const deltaSegmentWidthRatio = useMemo(
    () => Math.abs(currentRatio - baselineRatio),
    [baselineRatio, currentRatio],
  );
  const deltaSegmentClassName = useMemo(() => {
    if (deltaSegmentWidthRatio === 0) {
      return "";
    }
    return currentRatio >= baselineRatio
      ? "networth-delta-segment networth-delta-segment--up"
      : "networth-delta-segment networth-delta-segment--down";
  }, [baselineRatio, currentRatio, deltaSegmentWidthRatio]);

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
  }, [
    authUser,
    isPullRefreshing,
    loadAllData,
    message,
    performCloudSync,
    refreshCloudRuntime,
  ]);

  const handleTouchStart = useCallback(
    (event) => {
      if (isPullRefreshing || event.touches.length !== 1) {
        return;
      }
      if (window.scrollY > 0) {
        pullingRef.current = false;
        return;
      }
      pullStartYRef.current = event.touches[0].clientY;
      pullingRef.current = true;
    },
    [isPullRefreshing],
  );

  const handleTouchMove = useCallback(
    (event) => {
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
    },
    [isPullRefreshing],
  );

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
          style={{
            height: isPullRefreshing ? PULL_REFRESH_TRIGGER : pullDistance,
          }}
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
                  value={displayTotalTwd}
                  precision={0}
                  formatter={(value) => formatTwd(Number(value))}
                />
                <Text
                  className={`asset-total-delta ${
                    typeof totalChangeTwd === "number"
                      ? getDeltaClassName(totalChangeTwd)
                      : "cell-delta cell-delta--flat"
                  }`}
                >
                  {typeof totalChangeTwd !== "number"
                    ? "--"
                    : totalChangeTwd === 0
                      ? "0.00 (0.00%)"
                      : `${totalChangeTwd > 0 ? "▲" : "▼"} ${formatSignedTwd(totalChangeTwd)} (${formatChangePercent(totalChangePct)})`}
                </Text>
                <div className="networth-progress-wrap">
                  <div className="networth-progress-scale">
                    {visibleProgressStops.map((stop) => (
                      <span
                        key={`stop-${stop}`}
                        className="networth-progress-scale-label"
                        style={{
                          left:
                            progressMaxTwd > 0
                              ? `${(stop / progressMaxTwd) * 100}%`
                              : "0%",
                        }}
                      >
                        {formatStopLabel(stop)}
                      </span>
                    ))}
                  </div>
                  <div className="networth-progress-track">
                    <div
                      className="networth-progress-fill"
                      style={{ width: `${progressDisplayRatio * 100}%` }}
                    />
                    {deltaSegmentClassName ? (
                      <div
                        className={deltaSegmentClassName}
                        style={{
                          left: `${deltaDisplayLeftRatio * 100}%`,
                          width: `${deltaDisplayWidthRatio * 100}%`,
                        }}
                      />
                    ) : null}
                    {progressStops
                      .filter((stop) => stop > 0)
                      .map((stop) => (
                        <span
                          key={`track-stop-${stop}`}
                          className="networth-track-stop-line"
                          style={{
                            left:
                              progressMaxTwd > 0
                                ? `${(stop / progressMaxTwd) * 100}%`
                                : "0%",
                          }}
                        />
                      ))}
                    <Tooltip
                      title={`昨日23:59：${formatTwd(flooredBaselineTwd)}`}
                    >
                      <div
                        className={`networth-marker networth-marker--baseline ${isMarkerOverlap ? "networth-marker--offset" : ""}`}
                        style={{ left: `${baselineDisplayRatio * 100}%` }}
                      >
                        <span className="networth-marker-line" />
                      </div>
                    </Tooltip>
                    <div
                      className="networth-marker networth-marker--current"
                      style={{ left: `${progressDisplayRatio * 100}%` }}
                    >
                      <span className="networth-marker-caret" />
                      <span className="networth-marker-line" />
                      <span className="networth-marker-value">
                        {currentMarkerWanLabel}
                      </span>
                    </div>
                  </div>
                </div>
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
              className="holdings-card"
              title={
                <Space size={8}>
                  <span>持股列表</span>
                  <Tooltip title="新增持股">
                    <Button
                      type="text"
                      size="small"
                      className="title-add-btn"
                      onClick={() => setIsAddHoldingModalOpen(true)}
                      disabled={loadingAddHolding}
                      icon={<PlusOutlined />}
                      aria-label="新增持股"
                    />
                  </Tooltip>
                </Space>
              }
              extra={
                <div className="price-update-extra">
                  <Space>
                    <Space.Compact>
                      <Button
                        type="primary"
                        onClick={() => handleRefreshPrices("ALL")}
                        loading={loadingRefresh}
                        aria-label="更新價格（全部）"
                      >
                        更新價格
                      </Button>
                      <Dropdown
                        trigger={["click"]}
                        disabled={loadingRefresh}
                        overlayClassName="price-update-menu"
                        menu={{
                          items: [
                            { key: "TW", label: "更新台股" },
                            { key: "US", label: "更新美股" },
                            { type: "divider" },
                            {
                              key: "lastUpdatedInfo",
                              disabled: true,
                              label: (
                                <span className="price-update-menu-meta">
                                  上次更新價格於 {priceUpdatedRelativeText}
                                </span>
                              ),
                            },
                          ],
                          onClick: ({ key }) => handleRefreshPrices(key),
                        }}
                      >
                        <Button
                          type="primary"
                          icon={<DownOutlined />}
                          aria-label="選擇更新市場"
                        />
                      </Dropdown>
                    </Space.Compact>
                  </Space>
                </div>
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
              title={
                <Space size={8}>
                  <span>銀行現金資產</span>
                  <Tooltip title="新增銀行帳戶">
                    <Button
                      type="text"
                      size="small"
                      className="title-add-btn"
                      onClick={() => setIsAddCashModalOpen(true)}
                      disabled={loadingAddCashAccount}
                      icon={<PlusOutlined />}
                      aria-label="新增銀行帳戶"
                    />
                  </Tooltip>
                </Space>
              }
            >
              <Table
                rowKey="id"
                dataSource={cashRows}
                columns={cashTableColumns}
                pagination={false}
                tableLayout="fixed"
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
