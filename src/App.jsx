import {
  Component,
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
  DatePicker,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Layout,
  Modal,
  Popconfirm,
  Progress,
  Radio,
  Row,
  Select,
  Segmented,
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
  LeftOutlined,
  RightOutlined,
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  ExpandOutlined,
  FundProjectionScreenOutlined,
  GoogleOutlined,
  HomeOutlined,
  LogoutOutlined,
  MailOutlined,
  MenuOutlined,
  PlusOutlined,
  PieChartOutlined,
  SettingOutlined,
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
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import HoldingForm from "./components/HoldingForm";
import CashAccountForm from "./components/CashAccountForm";
import MobileFormSheetLayout from "./components/MobileFormSheetLayout";
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
  stopSync,
  syncNow as syncNowPortfolio,
  removeCashAccount,
  getCloudSyncRuntime,
  updateCashAccountBalance,
  updateHoldingTag,
  updateHoldingShares,
  upsertCashAccount,
  upsertHolding,
  getExpenseDashboardView,
  saveIncomeSettings,
  setIncomeOverride,
  removeIncomeOverride,
  upsertExpenseEntry,
  stopRecurringExpense,
  removeExpenseEntry,
  upsertExpenseCategory,
  removeExpenseCategory,
  upsertBudget,
  removeBudget,
} from "./services/portfolioService";
import {
  loginWithEmailPassword,
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
const DEFAULT_EXPENSE_ANALYTICS = {
  monthlyTotalsAllHistory: [],
  kindBreakdown: [],
  payerRanking: [],
  familyBalance: [],
  categoryBreakdown: [],
};

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

const formatRecurringScheduleText = (row) => {
  if (!row) return "--";
  if (row.recurrenceType === "MONTHLY") {
    return `每月 ${row.monthlyDay || "--"} 日扣款`;
  }
  if (row.recurrenceType === "YEARLY") {
    return `每年 ${row.yearlyMonth || "--"} 月${row.yearlyDay ? `${row.yearlyDay} 日` : ""}扣款`;
  }
  return "--";
};

const formatBudgetModeLabel = (mode) =>
  mode === "SPECIAL" ? "特別預算" : "常駐預算";

const formatBudgetCycleLabel = (budgetType) =>
  budgetType === "QUARTERLY"
    ? "季度"
    : budgetType === "YEARLY"
      ? "年度"
      : "月度";

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

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage:
        error instanceof Error ? error.message : "Unknown runtime error",
    };
  }

  componentDidCatch(error) {
    console.error("[App Runtime Error]", error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <Layout className="app-layout">
        <Content className="app-content">
          <Alert
            type="error"
            showIcon
            title="畫面載入失敗"
            description={
              <Space direction="vertical" size={8}>
                <span>{this.state.errorMessage || "發生未知錯誤"}</span>
                <Button onClick={() => window.location.reload()}>
                  重新整理
                </Button>
              </Space>
            }
          />
        </Content>
      </Layout>
    );
  }
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
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState("asset");
  const [isTrendExpanded, setIsTrendExpanded] = useState(false);
  const [isPieExpanded, setIsPieExpanded] = useState(false);
  const [activeAllocationTab, setActiveAllocationTab] = useState("assetType");
  const [activeHoldingTab, setActiveHoldingTab] = useState("all");
  const [isAddHoldingModalOpen, setIsAddHoldingModalOpen] = useState(false);
  const [isAddCashModalOpen, setIsAddCashModalOpen] = useState(false);
  const [isEmailLoginModalOpen, setIsEmailLoginModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isExpenseSheetOpen, setIsExpenseSheetOpen] = useState(false);
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);
  const [isBudgetSheetOpen, setIsBudgetSheetOpen] = useState(false);
  const [isAddHoldingSheetOpen, setIsAddHoldingSheetOpen] = useState(false);
  const [isAddCashSheetOpen, setIsAddCashSheetOpen] = useState(false);
  const [isEmailLoginSheetOpen, setIsEmailLoginSheetOpen] = useState(false);
  const [isUpdateSheetOpen, setIsUpdateSheetOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 768 : false,
  );
  const [loadingAddCashAccount, setLoadingAddCashAccount] = useState(false);
  const [loadingEmailLogin, setLoadingEmailLogin] = useState(false);
  const [loadingExpenseAction, setLoadingExpenseAction] = useState(false);
  const [loadingCategoryAction, setLoadingCategoryAction] = useState(false);
  const [loadingBudgetAction, setLoadingBudgetAction] = useState(false);
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
  const [expenseRows, setExpenseRows] = useState([]);
  const [activeExpenseCategoryTab, setActiveExpenseCategoryTab] =
    useState("all");
  const [expenseMonthOptions, setExpenseMonthOptions] = useState([]);
  const [activeExpenseMonth, setActiveExpenseMonth] = useState(
    dayjs().format("YYYY-MM"),
  );
  const [expenseTotalMode, setExpenseTotalMode] = useState("month");
  const [expenseMonthlyTotalTwd, setExpenseMonthlyTotalTwd] = useState(0);
  const [expenseCumulativeTotalTwd, setExpenseCumulativeTotalTwd] = useState(0);
  const [expenseFirstDate, setExpenseFirstDate] = useState(null);
  const [expenseCategoryRows, setExpenseCategoryRows] = useState([]);
  const [budgetRows, setBudgetRows] = useState([]);
  const [activeBudgetTab, setActiveBudgetTab] = useState("resident");
  const [defaultMonthlyIncomeTwd, setDefaultMonthlyIncomeTwd] = useState(null);
  const [incomeMonthOverrides, setIncomeMonthOverrides] = useState([]);
  const [incomeProgress, setIncomeProgress] = useState({
    month: {
      numerator: 0,
      denominator: null,
      ratio: null,
      hasIncome: false,
      recurringNumerator: 0,
      oneTimeNumerator: 0,
      recurringRatio: null,
      oneTimeRatio: null,
    },
    cumulative: {
      numerator: 0,
      denominator: null,
      ratio: null,
      hasIncome: false,
      recurringNumerator: 0,
      oneTimeNumerator: 0,
      recurringRatio: null,
      oneTimeRatio: null,
    },
  });
  const [newIncomeOverrideMonth, setNewIncomeOverrideMonth] = useState(dayjs());
  const [newIncomeOverrideValue, setNewIncomeOverrideValue] = useState(null);
  const [loadingIncomeSettings, setLoadingIncomeSettings] = useState(false);
  const [expenseRecurringDisplayPercent, setExpenseRecurringDisplayPercent] =
    useState(0);
  const [expenseOneTimeDisplayPercent, setExpenseOneTimeDisplayPercent] =
    useState(0);
  const [expenseMarkerDisplayPercent, setExpenseMarkerDisplayPercent] =
    useState(0);
  const [expenseRateDisplayPercent, setExpenseRateDisplayPercent] =
    useState(0);
  const [showExpenseRateMarkerDisplay, setShowExpenseRateMarkerDisplay] =
    useState(false);
  const [recurringExpenseRows, setRecurringExpenseRows] = useState([]);
  const [expenseAnalyticsAllHistory, setExpenseAnalyticsAllHistory] = useState(
    DEFAULT_EXPENSE_ANALYTICS,
  );
  const [expenseAnalyticsByMonth, setExpenseAnalyticsByMonth] = useState(
    DEFAULT_EXPENSE_ANALYTICS,
  );
  const [expenseTrendRange, setExpenseTrendRange] = useState("6m");
  const [isExpenseChartModalOpen, setIsExpenseChartModalOpen] = useState(false);
  const [activeExpenseChartKey, setActiveExpenseChartKey] = useState("trend");
  const [selectableBudgetOptions, setSelectableBudgetOptions] = useState([]);
  const [editingExpenseEntry, setEditingExpenseEntry] = useState(null);
  const [expenseFormMode, setExpenseFormMode] = useState("normal");
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingBudget, setEditingBudget] = useState(null);
  const [stoppingRecurringById, setStoppingRecurringById] = useState({});
  const [isStopRecurringModalOpen, setIsStopRecurringModalOpen] =
    useState(false);
  const [selectedRecurringToStop, setSelectedRecurringToStop] = useState(null);
  const [stopKeepToday, setStopKeepToday] = useState(true);
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
  const expenseProgressAnimationRef = useRef(null);
  const animationLockedUntilRef = useRef(0);
  const expenseShouldAnimateRef = useRef(false);
  const didRunExpenseInitialAnimationRef = useRef(false);
  const latestTotalTwdRef = useRef(0);
  const latestMarkerWanRef = useRef(0);
  const latestProgressTargetsRef = useRef({
    currentRatio: 0,
    baselineRatio: 0,
    deltaLeftRatio: 0,
    deltaWidthRatio: 0,
  });
  const latestExpenseProgressTargetsRef = useRef({
    recurringPercent: 0,
    oneTimePercent: 0,
    markerPercent: 0,
    ratePercent: 0,
    showMarker: false,
  });
  const [expenseForm] = Form.useForm();
  const [categoryForm] = Form.useForm();
  const [budgetForm] = Form.useForm();
  const [emailLoginForm] = Form.useForm();
  const isAuthDialogSubmitting = loadingEmailLogin || loadingAuthAction;

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
        setDeltaDisplayLeftRatio(
          latestProgressTargetsRef.current.deltaLeftRatio,
        );
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

  const stopExpenseProgressAnimation = useCallback(() => {
    if (expenseProgressAnimationRef.current) {
      expenseProgressAnimationRef.current.pause();
      expenseProgressAnimationRef.current = null;
    }
  }, []);

  const animateExpenseProgress = useCallback(
    (targetValues) => {
      stopExpenseProgressAnimation();
      setExpenseRecurringDisplayPercent(0);
      setExpenseOneTimeDisplayPercent(0);
      setExpenseMarkerDisplayPercent(0);
      setExpenseRateDisplayPercent(0);
      setShowExpenseRateMarkerDisplay(Boolean(targetValues.showMarker));

      if (!targetValues.showMarker) {
        return;
      }

      const animated = {
        recurring: 0,
        oneTime: 0,
        marker: 0,
        rate: 0,
      };

      expenseProgressAnimationRef.current = anime({
        targets: animated,
        recurring: targetValues.recurringPercent,
        oneTime: targetValues.oneTimePercent,
        marker: targetValues.markerPercent,
        rate: targetValues.ratePercent,
        duration: NUMBER_ANIMATION_DURATION_MS,
        easing: "easeOutExpo",
        update: () => {
          setExpenseRecurringDisplayPercent(animated.recurring);
          setExpenseOneTimeDisplayPercent(animated.oneTime);
          setExpenseMarkerDisplayPercent(animated.marker);
          setExpenseRateDisplayPercent(animated.rate);
        },
        complete: () => {
          setExpenseRecurringDisplayPercent(
            latestExpenseProgressTargetsRef.current.recurringPercent,
          );
          setExpenseOneTimeDisplayPercent(
            latestExpenseProgressTargetsRef.current.oneTimePercent,
          );
          setExpenseMarkerDisplayPercent(
            latestExpenseProgressTargetsRef.current.markerPercent,
          );
          setExpenseRateDisplayPercent(
            latestExpenseProgressTargetsRef.current.ratePercent,
          );
          setShowExpenseRateMarkerDisplay(
            latestExpenseProgressTargetsRef.current.showMarker,
          );
        },
      });
    },
    [stopExpenseProgressAnimation],
  );

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

  const refreshCloudRuntime = useCallback(() => {
    const runtime = getCloudSyncRuntime();
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

  const loadExpenseData = useCallback(
    async (monthInput) => {
      const payload = monthInput
        ? { month: monthInput }
        : { month: activeExpenseMonth };
      const view = await getExpenseDashboardView(payload);
      setExpenseRows(view.expenseRows ?? []);
      setExpenseMonthOptions(view.monthOptions ?? []);
      setActiveExpenseMonth(view.activeMonth || dayjs().format("YYYY-MM"));
      setExpenseMonthlyTotalTwd(Number(view.monthlyExpenseTotalTwd) || 0);
      setExpenseCumulativeTotalTwd(Number(view.cumulativeExpenseTotalTwd) || 0);
      setExpenseFirstDate(view.firstExpenseDate || null);
      setExpenseCategoryRows(view.categoryRows ?? []);
      setBudgetRows(view.budgetRows ?? []);
      setDefaultMonthlyIncomeTwd(
        view.incomeSettings?.defaultMonthlyIncomeTwd ?? null,
      );
      setIncomeMonthOverrides(view.incomeSettings?.monthOverrides ?? []);
      setIncomeProgress(
        view.expenseIncomeProgress ?? {
          month: {
            numerator: 0,
            denominator: null,
            ratio: null,
            hasIncome: false,
            recurringNumerator: 0,
            oneTimeNumerator: 0,
            recurringRatio: null,
            oneTimeRatio: null,
          },
          cumulative: {
            numerator: 0,
            denominator: null,
            ratio: null,
            hasIncome: false,
            recurringNumerator: 0,
            oneTimeNumerator: 0,
            recurringRatio: null,
            oneTimeRatio: null,
          },
        },
      );
      setRecurringExpenseRows(view.recurringExpenseRows ?? []);
      setExpenseAnalyticsAllHistory(
        view.expenseAnalyticsAllHistory ??
          view.expenseAnalytics ??
          DEFAULT_EXPENSE_ANALYTICS,
      );
      setExpenseAnalyticsByMonth(
        view.expenseAnalyticsByMonth ?? DEFAULT_EXPENSE_ANALYTICS,
      );
      setSelectableBudgetOptions(view.selectableBudgets ?? []);
    },
    [activeExpenseMonth],
  );

  const handleSubmitExpense = useCallback(async () => {
    try {
      const values = await expenseForm.validateFields();
      setLoadingExpenseAction(true);
      expenseShouldAnimateRef.current = true;
      const isRecurringCreateMode =
        expenseFormMode === "recurring-create" && !editingExpenseEntry;
      await upsertExpenseEntry({
        id: editingExpenseEntry?.id,
        name: values.name,
        payer: values.payer || null,
        expenseKind: values.expenseKind || null,
        amountTwd: values.amountTwd,
        occurredAt:
          values.occurredAt?.format?.("YYYY-MM-DD") || values.occurredAt,
        entryType: isRecurringCreateMode ? "RECURRING" : values.entryType,
        recurrenceType: values.recurrenceType || null,
        monthlyDay: values.monthlyDay || null,
        yearlyMonth: values.yearlyMonth || null,
        yearlyDay: values.yearlyDay || null,
        categoryId: values.categoryId || null,
        budgetId: values.budgetId || null,
      });
      await loadExpenseData();
      await performCloudSync();
      setIsExpenseModalOpen(false);
      setIsExpenseSheetOpen(false);
      setEditingExpenseEntry(null);
      setExpenseFormMode("normal");
      expenseForm.resetFields();
      message.success("支出已儲存");
    } catch (error) {
      if (error?.errorFields) return;
      message.error(error instanceof Error ? error.message : "儲存支出失敗");
    } finally {
      setLoadingExpenseAction(false);
    }
  }, [
    editingExpenseEntry,
    expenseForm,
    expenseFormMode,
    loadExpenseData,
    message,
    performCloudSync,
  ]);

  const handleSubmitCategory = useCallback(async () => {
    try {
      const values = await categoryForm.validateFields();
      setLoadingCategoryAction(true);
      await upsertExpenseCategory({
        id: editingCategory?.id,
        name: values.name,
      });
      await loadExpenseData();
      await performCloudSync();
      setIsCategoryModalOpen(false);
      setIsCategorySheetOpen(false);
      setEditingCategory(null);
      categoryForm.resetFields();
      message.success("分類已儲存");
    } catch (error) {
      if (error?.errorFields) return;
      message.error(error instanceof Error ? error.message : "儲存分類失敗");
    } finally {
      setLoadingCategoryAction(false);
    }
  }, [
    categoryForm,
    editingCategory,
    loadExpenseData,
    message,
    performCloudSync,
  ]);

  const handleSubmitBudget = useCallback(async () => {
    try {
      const values = await budgetForm.validateFields();
      setLoadingBudgetAction(true);
      const budgetMode = values.budgetMode || "RESIDENT";
      await upsertBudget({
        id: editingBudget?.id,
        name: values.name,
        budgetMode,
        budgetType: budgetMode === "RESIDENT" ? values.budgetType : undefined,
        startDate:
          budgetMode === "RESIDENT"
            ? dayjs(values.startDate).startOf("month").format("YYYY-MM-DD")
            : undefined,
        residentPercent:
          budgetMode === "RESIDENT" ? values.residentPercent : undefined,
        specialAmountTwd:
          budgetMode === "SPECIAL" ? values.specialAmountTwd : undefined,
        specialStartDate:
          budgetMode === "SPECIAL"
            ? values.specialStartDate?.format?.("YYYY-MM-DD") ||
              values.specialStartDate
            : undefined,
        specialEndDate:
          budgetMode === "SPECIAL"
            ? values.specialEndDate?.format?.("YYYY-MM-DD") ||
              values.specialEndDate
            : undefined,
      });
      await loadExpenseData();
      await performCloudSync();
      setIsBudgetModalOpen(false);
      setIsBudgetSheetOpen(false);
      setEditingBudget(null);
      budgetForm.resetFields();
      message.success("預算已儲存");
    } catch (error) {
      if (error?.errorFields) return;
      message.error(error instanceof Error ? error.message : "儲存預算失敗");
    } finally {
      setLoadingBudgetAction(false);
    }
  }, [budgetForm, editingBudget, loadExpenseData, message, performCloudSync]);

  const setRowLoading = useCallback((id, isLoading) => {
    setLoadingActionById((prev) => ({ ...prev, [id]: isLoading }));
  }, []);

  const setCashRowLoading = useCallback((id, isLoading) => {
    setLoadingCashActionById((prev) => ({ ...prev, [id]: isLoading }));
  }, []);

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

  const openExpenseForm = useCallback(
    (record = null, options = {}) => {
      setEditingExpenseEntry(record);
      setExpenseFormMode(options.mode || "normal");
      if (isMobileViewport) {
        setIsExpenseSheetOpen(true);
      } else {
        setIsExpenseModalOpen(true);
      }
    },
    [isMobileViewport],
  );

  const openRecurringCreateForm = useCallback(() => {
    openExpenseForm(null, { mode: "recurring-create" });
  }, [openExpenseForm]);

  const openRecurringEditForm = useCallback(
    (record) => {
      openExpenseForm(record, { mode: "normal" });
    },
    [openExpenseForm],
  );

  const openCategoryForm = useCallback(
    (record = null) => {
      setEditingCategory(record);
      if (isMobileViewport) {
        setIsCategorySheetOpen(true);
      } else {
        setIsCategoryModalOpen(true);
      }
    },
    [isMobileViewport],
  );

  const openBudgetForm = useCallback(
    (record = null) => {
      setEditingBudget(record);
      if (isMobileViewport) {
        setIsBudgetSheetOpen(true);
      } else {
        setIsBudgetModalOpen(true);
      }
    },
    [isMobileViewport],
  );

  const handleRemoveExpense = useCallback(
    async (record) => {
      try {
        setLoadingExpenseAction(true);
        expenseShouldAnimateRef.current = true;
        await removeExpenseEntry({ id: record.id });
        await loadExpenseData();
        await performCloudSync();
        message.success("支出已刪除");
      } catch (error) {
        message.error(error instanceof Error ? error.message : "刪除支出失敗");
      } finally {
        setLoadingExpenseAction(false);
      }
    },
    [loadExpenseData, message, performCloudSync],
  );

  const openStopRecurringModal = useCallback((row) => {
    setSelectedRecurringToStop(row);
    setStopKeepToday(true);
    setIsStopRecurringModalOpen(true);
  }, []);

  const closeStopRecurringModal = useCallback(() => {
    const targetId = Number(selectedRecurringToStop?.id);
    if (Number.isInteger(targetId) && stoppingRecurringById[targetId]) {
      return;
    }
    setIsStopRecurringModalOpen(false);
    setSelectedRecurringToStop(null);
    setStopKeepToday(true);
  }, [selectedRecurringToStop, stoppingRecurringById]);

  const confirmStopRecurring = useCallback(async () => {
    const targetId = Number(selectedRecurringToStop?.id);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      message.error("找不到要取消的定期支出");
      return;
    }

    setStoppingRecurringById((prev) => ({ ...prev, [targetId]: true }));
    try {
      expenseShouldAnimateRef.current = true;
      await stopRecurringExpense({ id: targetId, keepToday: stopKeepToday });
      await loadExpenseData();
      await performCloudSync();
      message.success("定期支出已取消");
      setIsStopRecurringModalOpen(false);
      setSelectedRecurringToStop(null);
      setStopKeepToday(true);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "取消定期支出失敗",
      );
    } finally {
      setStoppingRecurringById((prev) => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
    }
  }, [
    loadExpenseData,
    message,
    performCloudSync,
    selectedRecurringToStop,
    stopKeepToday,
  ]);

  const handleRemoveCategory = useCallback(
    async (record) => {
      try {
        setLoadingCategoryAction(true);
        await removeExpenseCategory({ id: record.id });
        await loadExpenseData();
        await performCloudSync();
        message.success("分類已刪除");
      } catch (error) {
        message.error(error instanceof Error ? error.message : "刪除分類失敗");
      } finally {
        setLoadingCategoryAction(false);
      }
    },
    [loadExpenseData, message, performCloudSync],
  );

  const handleRemoveBudget = useCallback(
    async (record) => {
      try {
        setLoadingBudgetAction(true);
        await removeBudget({ id: record.id });
        await loadExpenseData();
        await performCloudSync();
        message.success("預算已刪除");
      } catch (error) {
        message.error(error instanceof Error ? error.message : "刪除預算失敗");
      } finally {
        setLoadingBudgetAction(false);
      }
    },
    [loadExpenseData, message, performCloudSync],
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

  const expenseTableColumns = useMemo(
    () => [
      {
        title: "名稱",
        dataIndex: "name",
        key: "name",
        render: (_, record) => (
          <div>
            <div className="holding-main-text">{record.name}</div>
            <Text type="secondary" className="holding-subline">
              由{record.payerName || "未指定"}支出的
              {record.expenseKindName || "未指定"}開銷
            </Text>
          </div>
        ),
      },
      {
        title: "金額",
        dataIndex: "amountTwd",
        key: "amountTwd",
        align: "right",
        render: (value) => formatTwd(value),
      },
      {
        title: "日期",
        dataIndex: "occurredAt",
        key: "occurredAt",
      },
      {
        title: "類型",
        key: "type",
        render: (_, record) => {
          if (record.entryType === "RECURRING") {
            return record.recurrenceType === "YEARLY"
              ? "定期（年）"
              : "定期（月）";
          }
          return "單筆";
        },
      },
      {
        title: "分類",
        dataIndex: "categoryName",
        key: "categoryName",
        render: (value) => (
          <Tag color={value === "未指定" ? "default" : "processing"}>
            {value || "未指定"}
          </Tag>
        ),
      },
      {
        title: "預算",
        dataIndex: "budgetName",
        key: "budgetName",
        render: (value) => (
          <Tag color={value === "未指定" ? "default" : "gold"}>
            {value || "未指定"}
          </Tag>
        ),
      },
      {
        title: "操作",
        key: "actions",
        render: (_, record) => {
          if (record.isRecurringOccurrence) {
            return <Text type="secondary">由定期規則產生</Text>;
          }
          return (
            <Space>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openExpenseForm(record)}
              />
              <Popconfirm
                title="刪除這筆支出？"
                onConfirm={() => handleRemoveExpense(record)}
                okText="刪除"
                cancelText="取消"
              >
                <Button danger size="small" icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          );
        },
      },
    ],
    [handleRemoveExpense, openExpenseForm],
  );

  const expenseCategoryColumns = useMemo(
    () => [
      {
        title: "分類名稱",
        dataIndex: "name",
        key: "name",
        render: (value) => <Tag color="processing">{value}</Tag>,
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
        render: (_, record) => (
          <Space>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openCategoryForm(record)}
            />
            <Popconfirm
              title="刪除此分類？"
              onConfirm={() => handleRemoveCategory(record)}
              okText="刪除"
              cancelText="取消"
            >
              <Button danger size="small" icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [handleRemoveCategory, openCategoryForm],
  );

  const expenseCategoryTabItems = useMemo(() => {
    const counters = new Map();
    let uncategorizedCount = 0;

    for (const row of expenseRows) {
      const rawName =
        typeof row?.categoryName === "string" ? row.categoryName.trim() : "";
      if (!rawName || rawName === "未指定") {
        uncategorizedCount += 1;
        continue;
      }
      counters.set(rawName, (counters.get(rawName) || 0) + 1);
    }

    const categoryItems = Array.from(counters.entries())
      .sort((a, b) => {
        if (a[1] !== b[1]) {
          return b[1] - a[1];
        }
        return a[0].localeCompare(b[0], "zh-Hant");
      })
      .map(([name, count]) => ({
        key: `cat:${name}`,
        label: `${name} (${count})`,
      }));

    if (uncategorizedCount > 0) {
      categoryItems.push({
        key: "uncategorized",
        label: `未分類 (${uncategorizedCount})`,
      });
    }

    return [
      { key: "all", label: `全部 (${expenseRows.length})` },
      ...categoryItems,
    ];
  }, [expenseRows]);

  const filteredExpenseRowsByCategory = useMemo(() => {
    if (activeExpenseCategoryTab === "all") {
      return expenseRows;
    }
    if (activeExpenseCategoryTab === "uncategorized") {
      return expenseRows.filter((row) => {
        const rawName =
          typeof row?.categoryName === "string" ? row.categoryName.trim() : "";
        return !rawName || rawName === "未指定";
      });
    }
    if (activeExpenseCategoryTab.startsWith("cat:")) {
      const targetCategory = activeExpenseCategoryTab.slice(4);
      return expenseRows.filter((row) => row?.categoryName === targetCategory);
    }
    return expenseRows;
  }, [activeExpenseCategoryTab, expenseRows]);

  useEffect(() => {
    const validKeys = new Set(expenseCategoryTabItems.map((item) => item.key));
    if (!validKeys.has(activeExpenseCategoryTab)) {
      setActiveExpenseCategoryTab("all");
    }
  }, [activeExpenseCategoryTab, expenseCategoryTabItems]);

  const renderBudgetActionButtons = useCallback(
    (record) => (
      <Space>
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={() => openBudgetForm(record)}
        />
        <Popconfirm
          title="刪除此預算？"
          onConfirm={() => handleRemoveBudget(record)}
          okText="刪除"
          cancelText="取消"
        >
          <Button danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    ),
    [handleRemoveBudget, openBudgetForm],
  );

  const residentBudgetRows = useMemo(
    () => budgetRows.filter((row) => row.budgetMode !== "SPECIAL"),
    [budgetRows],
  );

  const specialBudgetRows = useMemo(
    () => budgetRows.filter((row) => row.budgetMode === "SPECIAL"),
    [budgetRows],
  );

  const residentBudgetColumns = useMemo(
    () => [
      { title: "預算名稱", dataIndex: "name", key: "name" },
      {
        title: "預算週期",
        dataIndex: "budgetType",
        key: "budgetType",
        render: (value) => {
          const cycle = formatBudgetCycleLabel(value);
          const color =
            value === "YEARLY" ? "purple" : value === "QUARTERLY" ? "blue" : "green";
          return <Tag color={color}>{cycle}</Tag>;
        },
      },
      {
        title: "分配比例",
        key: "residentPercent",
        render: (_, record) => {
          const percent = Number(record.residentPercent);
          if (!Number.isFinite(percent) || percent <= 0) {
            return <Text type="secondary">待設定</Text>;
          }
          return `${percent}%`;
        },
      },
      {
        title: "操作",
        key: "actions",
        render: (_, record) => renderBudgetActionButtons(record),
      },
    ],
    [renderBudgetActionButtons],
  );

  const specialBudgetColumns = useMemo(
    () => [
      { title: "預算名稱", dataIndex: "name", key: "name" },
      {
        title: "預算金額",
        key: "specialAmountTwd",
        align: "right",
        render: (_, record) => formatTwd(Number(record.specialAmountTwd) || 0),
      },
      {
        title: "預算日期",
        key: "specialDateRange",
        render: (_, record) =>
          record.specialStartDate && record.specialEndDate
            ? `${record.specialStartDate} ~ ${record.specialEndDate}`
            : "--",
      },
      {
        title: "剩餘",
        key: "remaining",
        render: (_, record) => {
          const availableTwd = Number(record.availableTwd || 0);
          const spentTwd = Number(record.spentTwd || 0);
          return (
            <div style={{ minWidth: 220 }}>
              <Progress
                percent={Math.round(Number(record.progressPct || 0))}
                size="small"
                strokeColor={spentTwd > availableTwd ? "#f5222d" : undefined}
              />
              <Text type="secondary">
                {formatTwd(spentTwd)} / {formatTwd(availableTwd)}
              </Text>
            </div>
          );
        },
      },
      {
        title: "操作",
        key: "actions",
        render: (_, record) => renderBudgetActionButtons(record),
      },
    ],
    [renderBudgetActionButtons],
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
        await Promise.all([loadAllData(), loadExpenseData()]);
        refreshCloudRuntime();
        await performCloudSync();
        await Promise.all([loadAllData(), loadExpenseData()]);
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
    };
  }, [loadAllData, loadExpenseData, performCloudSync, refreshCloudRuntime]);

  useEffect(() => {
    const bootstrap = async () => {
      setLoadingData(true);
      try {
        await Promise.all([loadAllData(), loadExpenseData()]);
      } catch (error) {
        message.error(error instanceof Error ? error.message : "載入資料失敗");
      } finally {
        setLoadingData(false);
      }
    };

    bootstrap();
  }, [loadAllData, loadExpenseData, message]);

  useEffect(() => {
    const onCloudUpdated = async () => {
      try {
        await Promise.all([loadAllData(), loadExpenseData()]);
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
  }, [loadAllData, loadExpenseData, refreshCloudRuntime]);

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
      stopExpenseProgressAnimation();
    },
    [
      stopExpenseProgressAnimation,
      stopMarkerValueAnimation,
      stopNumberAnimations,
      stopProgressAnimation,
    ],
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
    if (!isAddCashModalOpen && !isAddCashSheetOpen) {
      return;
    }
    if (loadingBankOptions) {
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
  }, [isAddCashModalOpen, isAddCashSheetOpen, message]);

  useEffect(() => {
    if (!activeExpenseMonth) return;
    loadExpenseData(activeExpenseMonth).catch(() => {});
  }, [activeExpenseMonth, loadExpenseData]);

  useEffect(() => {
    if (!isExpenseModalOpen && !isExpenseSheetOpen) {
      return;
    }
    const isRecurringCreateMode =
      expenseFormMode === "recurring-create" && !editingExpenseEntry;
    expenseForm.setFieldsValue({
      name: editingExpenseEntry?.name ?? "",
      payer:
        editingExpenseEntry?.payer === "共同"
          ? "共同帳戶"
          : (editingExpenseEntry?.payer ?? undefined),
      expenseKind: editingExpenseEntry?.expenseKind ?? undefined,
      amountTwd: editingExpenseEntry?.amountTwd ?? undefined,
      occurredAt: dayjs(
        editingExpenseEntry?.originalOccurredAt ||
          editingExpenseEntry?.occurredAt ||
          dayjs(),
      ),
      entryType: isRecurringCreateMode
        ? "RECURRING"
        : editingExpenseEntry?.entryType || "ONE_TIME",
      recurrenceType: editingExpenseEntry?.recurrenceType || undefined,
      monthlyDay: editingExpenseEntry?.monthlyDay ?? undefined,
      yearlyMonth: editingExpenseEntry?.yearlyMonth ?? undefined,
      yearlyDay: editingExpenseEntry?.yearlyDay ?? undefined,
      categoryId: editingExpenseEntry?.categoryId ?? undefined,
      budgetId: editingExpenseEntry?.budgetId ?? undefined,
    });
  }, [
    editingExpenseEntry,
    expenseFormMode,
    expenseForm,
    isExpenseModalOpen,
    isExpenseSheetOpen,
  ]);

  useEffect(() => {
    if (!isCategoryModalOpen && !isCategorySheetOpen) {
      return;
    }
    categoryForm.setFieldsValue({
      name: editingCategory?.name ?? "",
    });
  }, [categoryForm, editingCategory, isCategoryModalOpen, isCategorySheetOpen]);

  useEffect(() => {
    if (!isBudgetModalOpen && !isBudgetSheetOpen) {
      return;
    }
    const budgetMode = editingBudget?.budgetMode || "RESIDENT";
    budgetForm.setFieldsValue({
      name: editingBudget?.name ?? "",
      budgetMode,
      budgetType: editingBudget?.budgetType ?? "MONTHLY",
      startDate: dayjs(editingBudget?.startDate || dayjs()),
      residentPercent: editingBudget?.residentPercent ?? undefined,
      specialAmountTwd: editingBudget?.specialAmountTwd ?? undefined,
      specialStartDate: editingBudget?.specialStartDate
        ? dayjs(editingBudget.specialStartDate)
        : dayjs(),
      specialEndDate: editingBudget?.specialEndDate
        ? dayjs(editingBudget.specialEndDate)
        : dayjs(),
    });
  }, [budgetForm, editingBudget, isBudgetModalOpen, isBudgetSheetOpen]);

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
      setIsAddHoldingSheetOpen(false);
      message.success("持股已儲存並更新價格");
      return true;
    } catch (error) {
      await loadAllData();
      setIsAddHoldingModalOpen(false);
      setIsAddHoldingSheetOpen(false);
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
      setIsAddCashSheetOpen(false);
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
      return "離線（無法同步）";
    }
    if (cloudSyncStatus === "error") {
      return `同步失敗${cloudSyncError ? `：${cloudSyncError}` : ""}`;
    }
    return "即時同步中";
  }, [authUser, cloudSyncError, cloudSyncStatus]);

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

  const updateMenuItems = useMemo(
    () => [
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
    [priceUpdatedRelativeText],
  );

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

  const handleGoogleLogin = useCallback(async () => {
    try {
      setLoadingAuthAction(true);
      await loginWithGoogle();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Google 登入失敗");
    } finally {
      setLoadingAuthAction(false);
    }
  }, [message]);

  const handleGoogleLoginFromAuthDialog = useCallback(async () => {
    try {
      await handleGoogleLogin();
      setIsEmailLoginModalOpen(false);
      setIsEmailLoginSheetOpen(false);
      emailLoginForm.resetFields();
    } catch {
      // error toast handled in handleGoogleLogin
    }
  }, [emailLoginForm, handleGoogleLogin]);

  const handleEmailLoginSubmit = useCallback(async () => {
    try {
      const values = await emailLoginForm.validateFields();
      setLoadingEmailLogin(true);
      await loginWithEmailPassword({
        email: values.email,
        password: values.password,
      });
      setIsEmailLoginModalOpen(false);
      setIsEmailLoginSheetOpen(false);
      emailLoginForm.resetFields();
      message.success("Email 登入成功");
    } catch (error) {
      if (error?.errorFields) {
        return;
      }
      message.error(error instanceof Error ? error.message : "Email 登入失敗");
    } finally {
      setLoadingEmailLogin(false);
    }
  }, [emailLoginForm, message]);

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
      await Promise.all([loadAllData(), loadExpenseData()]);
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
    loadExpenseData,
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

  const getSheetPopupContainer = useCallback(
    (trigger) =>
      trigger?.closest?.(".form-bottom-sheet .ant-drawer-body") ||
      document.body,
    [],
  );

  const expenseFormNode = (
    <Form
      form={expenseForm}
      name={isMobileViewport ? "expense_mobile_form" : "expense_form"}
      layout="vertical"
      initialValues={{ entryType: "ONE_TIME", occurredAt: dayjs() }}
      autoComplete={isMobileViewport ? "off" : undefined}
      data-lpignore={isMobileViewport ? "true" : undefined}
    >
      <Form.Item
        label="支出名稱"
        name="name"
        rules={[{ required: true, message: "請輸入支出名稱" }]}
      >
        <Input
          autoComplete={isMobileViewport ? "new-password" : undefined}
          autoCorrect={isMobileViewport ? "off" : undefined}
          autoCapitalize={isMobileViewport ? "none" : undefined}
          spellCheck={isMobileViewport ? false : undefined}
          data-lpignore={isMobileViewport ? "true" : undefined}
        />
      </Form.Item>
      <Form.Item label="支出人" name="payer">
        <Select
          allowClear
          getPopupContainer={getSheetPopupContainer}
          options={[
            { label: "Po", value: "Po" },
            { label: "Wei", value: "Wei" },
            { label: "共同帳戶", value: "共同帳戶" },
          ]}
        />
      </Form.Item>
      <Form.Item label="種類" name="expenseKind">
        <Select
          allowClear
          getPopupContainer={getSheetPopupContainer}
          options={[
            { label: "家庭", value: "家庭" },
            { label: "個人", value: "個人" },
          ]}
        />
      </Form.Item>
      <Form.Item
        label="支出金額 (TWD)"
        name="amountTwd"
        rules={[{ required: true, message: "請輸入支出金額" }]}
      >
        <InputNumber
          min={1}
          step={100}
          precision={0}
          style={{ width: "100%" }}
        />
      </Form.Item>
      <Form.Item
        label="支出日期"
        name="occurredAt"
        rules={[{ required: true, message: "請選擇支出日期" }]}
      >
        <DatePicker
          style={{ width: "100%" }}
          getPopupContainer={getSheetPopupContainer}
        />
      </Form.Item>
      <Form.Item
        label="類型"
        name="entryType"
        rules={[{ required: true, message: "請選擇支出類型" }]}
      >
        <Select
          disabled={expenseFormMode === "recurring-create"}
          getPopupContainer={getSheetPopupContainer}
          options={[
            { label: "單筆支出", value: "ONE_TIME" },
            { label: "定期支出", value: "RECURRING" },
          ]}
        />
      </Form.Item>
      <Form.Item
        noStyle
        shouldUpdate={(prev, next) =>
          prev.entryType !== next.entryType ||
          prev.recurrenceType !== next.recurrenceType
        }
      >
        {({ getFieldValue }) => {
          if (getFieldValue("entryType") !== "RECURRING") return null;
          return (
            <>
              <Form.Item
                label="頻率"
                name="recurrenceType"
                rules={[{ required: true, message: "請選擇定期頻率" }]}
              >
                <Select
                  getPopupContainer={getSheetPopupContainer}
                  options={[
                    { label: "每月", value: "MONTHLY" },
                    { label: "每年", value: "YEARLY" },
                  ]}
                />
              </Form.Item>
              {getFieldValue("recurrenceType") === "MONTHLY" ? (
                <Form.Item
                  label="每月幾號"
                  name="monthlyDay"
                  rules={[{ required: true, message: "請輸入每月幾號" }]}
                >
                  <InputNumber min={1} max={31} style={{ width: "100%" }} />
                </Form.Item>
              ) : null}
              {getFieldValue("recurrenceType") === "YEARLY" ? (
                <Space style={{ width: "100%" }} size={12}>
                  <Form.Item
                    label="每年幾月"
                    name="yearlyMonth"
                    rules={[{ required: true, message: "請輸入月份" }]}
                    style={{ flex: 1 }}
                  >
                    <InputNumber min={1} max={12} style={{ width: "100%" }} />
                  </Form.Item>
                  <Form.Item
                    label="每年幾號"
                    name="yearlyDay"
                    rules={[{ required: true, message: "請輸入日期" }]}
                    style={{ flex: 1 }}
                  >
                    <InputNumber min={1} max={31} style={{ width: "100%" }} />
                  </Form.Item>
                </Space>
              ) : null}
            </>
          );
        }}
      </Form.Item>
      <Form.Item label="分類" name="categoryId">
        <Select
          allowClear
          getPopupContainer={getSheetPopupContainer}
          options={expenseCategoryRows.map((item) => ({
            label: item.name,
            value: item.id,
          }))}
        />
      </Form.Item>
      <Form.Item label="預算" name="budgetId">
        <Select
          allowClear
          getPopupContainer={getSheetPopupContainer}
          options={selectableBudgetOptions.map((item) => ({
            label: item.name,
            value: item.id,
          }))}
        />
      </Form.Item>
    </Form>
  );

  const categoryFormNode = (
    <Form
      form={categoryForm}
      name={isMobileViewport ? "category_mobile_form" : "category_form"}
      layout="vertical"
      autoComplete={isMobileViewport ? "off" : undefined}
      data-lpignore={isMobileViewport ? "true" : undefined}
    >
      <Form.Item
        label="分類名稱"
        name="name"
        rules={[{ required: true, message: "請輸入分類名稱" }]}
      >
        <Input />
      </Form.Item>
    </Form>
  );

  const budgetFormNode = (
    <Form
      form={budgetForm}
      name={isMobileViewport ? "budget_mobile_form" : "budget_form"}
      layout="vertical"
      initialValues={{
        budgetMode: "RESIDENT",
        budgetType: "MONTHLY",
        startDate: dayjs(),
        specialStartDate: dayjs(),
        specialEndDate: dayjs(),
      }}
      autoComplete={isMobileViewport ? "off" : undefined}
      data-lpignore={isMobileViewport ? "true" : undefined}
    >
      <Form.Item
        label="預算名稱"
        name="name"
        rules={[{ required: true, message: "請輸入預算名稱" }]}
      >
        <Input />
      </Form.Item>
      <Form.Item
        label="預算模式"
        name="budgetMode"
        rules={[{ required: true, message: "請選擇預算模式" }]}
      >
        <Select
          getPopupContainer={getSheetPopupContainer}
          options={[
            { label: "常駐預算", value: "RESIDENT" },
            { label: "特別預算", value: "SPECIAL" },
          ]}
        />
      </Form.Item>
      <Form.Item shouldUpdate noStyle>
        {({ getFieldValue }) => {
          const mode = getFieldValue("budgetMode") || "RESIDENT";
          if (mode === "SPECIAL") {
            return (
              <>
                <Form.Item
                  label="固定金額"
                  name="specialAmountTwd"
                  rules={[{ required: true, message: "請輸入預算金額" }]}
                >
                  <InputNumber
                    min={1}
                    step={100}
                    precision={0}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
                <Form.Item
                  label="開始日"
                  name="specialStartDate"
                  rules={[{ required: true, message: "請選擇開始日" }]}
                >
                  <DatePicker
                    style={{ width: "100%" }}
                    getPopupContainer={getSheetPopupContainer}
                  />
                </Form.Item>
                <Form.Item
                  label="結束日"
                  name="specialEndDate"
                  dependencies={["specialStartDate"]}
                  rules={[
                    { required: true, message: "請選擇結束日" },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        const start = getFieldValue("specialStartDate");
                        if (!start || !value) return Promise.resolve();
                        if (dayjs(value).isBefore(dayjs(start), "day")) {
                          return Promise.reject(
                            new Error("結束日需晚於或等於開始日"),
                          );
                        }
                        return Promise.resolve();
                      },
                    }),
                  ]}
                >
                  <DatePicker
                    style={{ width: "100%" }}
                    getPopupContainer={getSheetPopupContainer}
                  />
                </Form.Item>
              </>
            );
          }

          return (
            <>
              <Form.Item
                label="預算類型"
                name="budgetType"
                rules={[{ required: true, message: "請選擇預算類型" }]}
              >
                <Select
                  getPopupContainer={getSheetPopupContainer}
                  options={[
                    { label: "月度預算", value: "MONTHLY" },
                    { label: "季度預算", value: "QUARTERLY" },
                    { label: "年度預算", value: "YEARLY" },
                  ]}
                />
              </Form.Item>
              <Form.Item
                label="起始月份"
                name="startDate"
                rules={[{ required: true, message: "請選擇起始日" }]}
              >
                <DatePicker
                  picker="month"
                  style={{ width: "100%" }}
                  getPopupContainer={getSheetPopupContainer}
                />
              </Form.Item>
              <Form.Item
                label="每月收入占比 (%)"
                name="residentPercent"
                rules={[{ required: true, message: "請輸入百分比" }]}
              >
                <InputNumber min={0.01} step={1} precision={2} style={{ width: "100%" }} />
              </Form.Item>
            </>
          );
        }}
      </Form.Item>
    </Form>
  );

  const emailLoginFormNode = (
    <Form form={emailLoginForm} layout="vertical">
      <Form.Item
        label="Email"
        name="email"
        rules={[
          { required: true, message: "請輸入 Email" },
          { type: "email", message: "Email 格式不正確" },
        ]}
      >
        <Input placeholder="you@example.com" autoComplete="email" />
      </Form.Item>
      <Form.Item
        label="密碼"
        name="password"
        rules={[{ required: true, message: "請輸入密碼" }]}
      >
        <Input.Password
          placeholder="Password"
          autoComplete="current-password"
        />
      </Form.Item>
    </Form>
  );

  const authLoginContentNode = (
    <>
      {emailLoginFormNode}
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Button
          type="primary"
          block
          loading={loadingEmailLogin}
          disabled={loadingAuthAction}
          onClick={handleEmailLoginSubmit}
        >
          信箱登入
        </Button>
        <Divider plain style={{ margin: "4px 0" }}>
          或
        </Divider>
        <Button
          block
          icon={<GoogleOutlined />}
          loading={loadingAuthAction}
          disabled={loadingEmailLogin}
          onClick={handleGoogleLoginFromAuthDialog}
        >
          使用 Google 登入
        </Button>
      </Space>
    </>
  );

  const expenseMonthNavOptions = useMemo(() => {
    if (!Array.isArray(expenseMonthOptions)) {
      return [];
    }
    return expenseMonthOptions;
  }, [expenseMonthOptions]);

  const safeActiveExpenseMonth = useMemo(() => {
    if (expenseMonthNavOptions.length === 0) {
      return undefined;
    }
    if (expenseMonthNavOptions.includes(activeExpenseMonth)) {
      return activeExpenseMonth;
    }
    return expenseMonthNavOptions[expenseMonthNavOptions.length - 1];
  }, [activeExpenseMonth, expenseMonthNavOptions]);

  const expenseMonthTitle = useMemo(() => {
    if (!safeActiveExpenseMonth) {
      return "-- 總支出";
    }
    const [year, month] = safeActiveExpenseMonth.split("-");
    return `${year}/${Number(month)} 總支出`;
  }, [safeActiveExpenseMonth]);

  const expenseSummaryValue =
    expenseTotalMode === "cumulative"
      ? expenseCumulativeTotalTwd
      : expenseMonthlyTotalTwd;
  const activeIncomeProgress =
    expenseTotalMode === "cumulative"
      ? incomeProgress?.cumulative
      : incomeProgress?.month;
  const expenseRecurringSegmentPercent = useMemo(() => {
    const ratio = Number(activeIncomeProgress?.recurringRatio);
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return 0;
    }
    return Math.min(100, ratio * 100);
  }, [activeIncomeProgress]);
  const expenseOneTimeSegmentPercent = useMemo(() => {
    const ratio = Number(activeIncomeProgress?.oneTimeRatio);
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return 0;
    }
    return Math.min(100, ratio * 100);
  }, [activeIncomeProgress]);
  const expenseRateRawPercent = useMemo(() => {
    const ratio = Number(activeIncomeProgress?.ratio);
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return 0;
    }
    return ratio * 100;
  }, [activeIncomeProgress]);
  const expenseRateMarkerLeftPercent = useMemo(
    () => Math.min(100, Math.max(0, expenseRateRawPercent)),
    [expenseRateRawPercent],
  );
  const expenseRateMarkerLabel = useMemo(
    () => `${Math.max(0, expenseRateDisplayPercent).toFixed(1)}%`,
    [expenseRateDisplayPercent],
  );
  const expenseIncomeProgressMetaLeftText = useMemo(() => {
    const recurringRatio = Number(activeIncomeProgress?.recurringRatio);
    const oneTimeRatio = Number(activeIncomeProgress?.oneTimeRatio);
    const recurringText = Number.isFinite(recurringRatio)
      ? `${Math.max(0, recurringRatio * 100).toFixed(1)}%`
      : "--";
    const oneTimeText = Number.isFinite(oneTimeRatio)
      ? `${Math.max(0, oneTimeRatio * 100).toFixed(1)}%`
      : "--";
    if (!activeIncomeProgress?.hasIncome) {
      return `尚未設定收入（定期支出 ${recurringText}｜單筆支出 ${oneTimeText}）`;
    }
    return `定期支出 ${recurringText}｜單筆支出 ${oneTimeText}`;
  }, [activeIncomeProgress, expenseTotalMode]);
  const expenseIncomeProgressMetaRightText = useMemo(() => {
    const numerator = Number(activeIncomeProgress?.numerator);
    const denominator = Number(activeIncomeProgress?.denominator);
    const expenseText = Number.isFinite(numerator) ? formatTwd(numerator) : "--";
    const incomeText = Number.isFinite(denominator)
      ? formatTwd(denominator)
      : "--";
    return `花費 ${expenseText} / 收入 ${incomeText}`;
  }, [activeIncomeProgress]);
  const showExpenseRateMarker = Boolean(activeIncomeProgress?.hasIncome);
  const showExpenseSegmentDividerDisplay =
    expenseRecurringDisplayPercent > 0 && expenseOneTimeDisplayPercent > 0;
  useEffect(() => {
    const targets = {
      recurringPercent: Math.min(100, Math.max(0, expenseRecurringSegmentPercent)),
      oneTimePercent: Math.min(100, Math.max(0, expenseOneTimeSegmentPercent)),
      markerPercent: Math.min(100, Math.max(0, expenseRateMarkerLeftPercent)),
      ratePercent: Math.max(0, expenseRateRawPercent),
      showMarker: Boolean(showExpenseRateMarker),
    };
    latestExpenseProgressTargetsRef.current = targets;

    const shouldAnimateNow =
      !didRunExpenseInitialAnimationRef.current || expenseShouldAnimateRef.current;
    if (shouldAnimateNow) {
      didRunExpenseInitialAnimationRef.current = true;
      expenseShouldAnimateRef.current = false;
      animateExpenseProgress(targets);
      return;
    }

    stopExpenseProgressAnimation();
    setExpenseRecurringDisplayPercent(targets.recurringPercent);
    setExpenseOneTimeDisplayPercent(targets.oneTimePercent);
    setExpenseMarkerDisplayPercent(targets.markerPercent);
    setExpenseRateDisplayPercent(targets.ratePercent);
    setShowExpenseRateMarkerDisplay(targets.showMarker);
  }, [
    animateExpenseProgress,
    expenseOneTimeSegmentPercent,
    expenseRateMarkerLeftPercent,
    expenseRateRawPercent,
    expenseRecurringSegmentPercent,
    showExpenseRateMarker,
    stopExpenseProgressAnimation,
  ]);
  const expenseActiveMonthIndex = useMemo(
    () =>
      safeActiveExpenseMonth
        ? expenseMonthNavOptions.indexOf(safeActiveExpenseMonth)
        : -1,
    [expenseMonthNavOptions, safeActiveExpenseMonth],
  );
  const canGoPrevExpenseMonth = expenseActiveMonthIndex > 0;
  const canGoNextExpenseMonth =
    expenseActiveMonthIndex >= 0 &&
    expenseActiveMonthIndex < expenseMonthNavOptions.length - 1;
  const activeBudgetCards = useMemo(
    () =>
      (budgetRows || []).filter(
        (budget) => Boolean(budget?.isConfigured) && Boolean(budget?.isActive),
      ),
    [budgetRows],
  );

  const handleAddIncomeOverride = useCallback(async () => {
    const monthValue = dayjs(newIncomeOverrideMonth).format("YYYY-MM");
    const incomeValue = Number(newIncomeOverrideValue);
    if (!Number.isFinite(incomeValue) || incomeValue <= 0) {
      message.error("請輸入有效的覆寫收入金額");
      return;
    }
    try {
      setLoadingIncomeSettings(true);
      expenseShouldAnimateRef.current = true;
      await setIncomeOverride({ month: monthValue, incomeTwd: incomeValue });
      await loadExpenseData();
      await performCloudSync();
      setNewIncomeOverrideValue(null);
      message.success("月份收入覆寫已新增");
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "新增月份收入覆寫失敗",
      );
    } finally {
      setLoadingIncomeSettings(false);
    }
  }, [
    loadExpenseData,
    message,
    newIncomeOverrideMonth,
    newIncomeOverrideValue,
    performCloudSync,
  ]);

  const handleRemoveIncomeOverride = useCallback(
    async (month) => {
      try {
        setLoadingIncomeSettings(true);
        expenseShouldAnimateRef.current = true;
        await removeIncomeOverride({ month });
        await loadExpenseData();
        await performCloudSync();
        message.success("月份收入覆寫已刪除");
      } catch (error) {
        message.error(
          error instanceof Error ? error.message : "刪除月份收入覆寫失敗",
        );
      } finally {
        setLoadingIncomeSettings(false);
      }
    },
    [loadExpenseData, message, performCloudSync],
  );

  const handleSaveIncomeSettings = useCallback(async () => {
    try {
      setLoadingIncomeSettings(true);
      expenseShouldAnimateRef.current = true;
      await saveIncomeSettings({
        defaultMonthlyIncomeTwd,
        monthOverrides: incomeMonthOverrides,
      });
      await loadExpenseData();
      await performCloudSync();
      message.success("收入設定已儲存");
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "儲存收入設定失敗",
      );
    } finally {
      setLoadingIncomeSettings(false);
    }
  }, [
    defaultMonthlyIncomeTwd,
    incomeMonthOverrides,
    loadExpenseData,
    message,
    performCloudSync,
  ]);

  const effectiveExpenseAnalytics = useMemo(
    () =>
      expenseTotalMode === "cumulative"
        ? expenseAnalyticsAllHistory
        : expenseAnalyticsByMonth,
    [expenseAnalyticsAllHistory, expenseAnalyticsByMonth, expenseTotalMode],
  );

  const trendMonths = useMemo(() => {
    const source = Array.isArray(
      effectiveExpenseAnalytics?.monthlyTotalsAllHistory,
    )
      ? effectiveExpenseAnalytics.monthlyTotalsAllHistory
      : [];
    const size = expenseTrendRange === "1y" ? 12 : 6;
    return source.slice(-size).map((item) => ({
      ...item,
      monthLabel: dayjs(`${item.month}-01`).format("YY/MM"),
    }));
  }, [effectiveExpenseAnalytics, expenseTrendRange]);

  const kindAnalysisData = useMemo(
    () =>
      (effectiveExpenseAnalytics?.kindBreakdown ?? [])
        .filter((item) => Number(item.value) > 0)
        .map((item) => ({
          name: item.key,
          value: Number(item.value) || 0,
          color:
            item.key === "家庭"
              ? "#1677ff"
              : item.key === "個人"
                ? "#52c41a"
                : "#8c8c8c",
        })),
    [effectiveExpenseAnalytics],
  );

  const payerRankingData = useMemo(
    () =>
      (effectiveExpenseAnalytics?.payerRanking ?? []).map((item) => ({
        name: item.label,
        value: Number(item.value) || 0,
      })),
    [effectiveExpenseAnalytics],
  );

  const familyBalanceData = useMemo(
    () =>
      (effectiveExpenseAnalytics?.familyBalance ?? [])
        .filter((item) => item.key === "po_family" || item.key === "wei_family")
        .filter((item) => Number(item.value) > 0)
        .map((item) => ({
          name: item.label,
          value: Number(item.value) || 0,
          color:
            item.key === "po_family"
              ? "#fa8c16"
              : item.key === "wei_family"
                ? "#13c2c2"
                : "#8c8c8c",
        })),
    [effectiveExpenseAnalytics],
  );

  const categoryAnalysisData = useMemo(
    () =>
      (effectiveExpenseAnalytics?.categoryBreakdown ?? [])
        .filter((item) => Number(item.value) > 0)
        .slice(0, 8)
        .map((item, index) => ({
          name: item.name,
          value: Number(item.value) || 0,
          color: [
            "#1677ff",
            "#52c41a",
            "#faad14",
            "#eb2f96",
            "#13c2c2",
            "#722ed1",
            "#fa8c16",
            "#2f54eb",
          ][index % 8],
        })),
    [effectiveExpenseAnalytics],
  );

  const expenseChartPreviewSummary = useMemo(() => {
    const latestTrend = trendMonths[trendMonths.length - 1];
    const familyValue =
      kindAnalysisData.find((item) => item.name === "家庭")?.value || 0;
    const personalValue =
      kindAnalysisData.find((item) => item.name === "個人")?.value || 0;
    const payerRankingMap = new Map(
      (effectiveExpenseAnalytics?.payerRanking ?? []).map((item) => [
        item.key,
        Number(item.value) || 0,
      ]),
    );
    const familyBalanceMap = new Map(
      (effectiveExpenseAnalytics?.familyBalance ?? []).map((item) => [
        item.key,
        Number(item.value) || 0,
      ]),
    );
    const weiPersonal = payerRankingMap.get("wei_personal") || 0;
    const poPersonal = payerRankingMap.get("po_personal") || 0;
    const familyTotal = payerRankingMap.get("family_total") || 0;
    const poFamily = familyBalanceMap.get("po_family") || 0;
    const weiFamily = familyBalanceMap.get("wei_family") || 0;
    const topCategory = categoryAnalysisData[0];
    const kindTotal = familyValue + personalValue;
    const familyBalanceTotal = poFamily + weiFamily;
    const categoryTotal = categoryAnalysisData.reduce(
      (sum, item) => sum + (Number(item.value) || 0),
      0,
    );

    const formatPercent = (value, total) =>
      total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "--";

    return {
      trend: latestTrend
        ? `最新：${formatTwd(latestTrend.totalTwd)}`
        : "尚無資料",
      kind: `家庭 ${formatPercent(familyValue, kindTotal)} / 個人 ${formatPercent(personalValue, kindTotal)}`,
      ranking: `Wei ${formatTwd(weiPersonal)} · Po ${formatTwd(poPersonal)} · 家庭 ${formatTwd(familyTotal)}`,
      family_balance: `Po ${formatPercent(poFamily, familyBalanceTotal)} / Wei ${formatPercent(weiFamily, familyBalanceTotal)}`,
      category: topCategory
        ? `${topCategory.name}：${formatPercent(Number(topCategory.value) || 0, categoryTotal)}`
        : "尚無資料",
    };
  }, [
    categoryAnalysisData,
    effectiveExpenseAnalytics,
    kindAnalysisData,
    trendMonths,
  ]);

  const expenseChartCards = useMemo(
    () => [
      { key: "kind", title: "家庭/個人比例" },
      { key: "ranking", title: "支出人排行" },
      { key: "family_balance", title: "家庭開銷平衡" },
      { key: "category", title: "類別分析" },
    ],
    [],
  );

  const renderExpenseChartPreview = useCallback(
    (chartKey) => {
      if (chartKey === "trend") {
        if (trendMonths.length === 0)
          return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={trendMonths}
              margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="monthLabel" tick={{ fontSize: 10 }} />
              <YAxis hide />
              <RechartsTooltip
                formatter={(value) => formatTwd(Number(value))}
              />
              <Line
                type="monotone"
                dataKey="totalTwd"
                stroke="#1677ff"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        );
      }
      if (chartKey === "kind") {
        if (kindAnalysisData.length === 0)
          return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={kindAnalysisData}
                dataKey="value"
                nameKey="name"
                innerRadius="35%"
                outerRadius="70%"
              >
                {kindAnalysisData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip
                formatter={(value) => formatTwd(Number(value))}
              />
            </PieChart>
          </ResponsiveContainer>
        );
      }
      if (chartKey === "ranking") {
        const hasValue = payerRankingData.some((item) => item.value > 0);
        if (!hasValue) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={payerRankingData}
              layout="vertical"
              margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={68}
                tick={{ fontSize: 10 }}
              />
              <RechartsTooltip
                formatter={(value) => formatTwd(Number(value))}
              />
              <Bar dataKey="value" fill="#1677ff" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );
      }
      if (chartKey === "family_balance") {
        if (familyBalanceData.length === 0)
          return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={familyBalanceData}
                dataKey="value"
                nameKey="name"
                innerRadius="35%"
                outerRadius="70%"
              >
                {familyBalanceData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip
                formatter={(value) => formatTwd(Number(value))}
              />
            </PieChart>
          </ResponsiveContainer>
        );
      }
      if (categoryAnalysisData.length === 0)
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={categoryAnalysisData}
              dataKey="value"
              nameKey="name"
              innerRadius="35%"
              outerRadius="70%"
            >
              {categoryAnalysisData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <RechartsTooltip formatter={(value) => formatTwd(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
      );
    },
    [
      categoryAnalysisData,
      familyBalanceData,
      kindAnalysisData,
      payerRankingData,
      trendMonths,
    ],
  );

  const renderExpenseChartModalContent = useCallback(
    (chartKey) => {
      if (chartKey === "trend") {
        if (trendMonths.length === 0)
          return <Empty description="尚無支出資料" />;
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={trendMonths}
              margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="monthLabel" />
              <YAxis
                tickFormatter={(value) =>
                  `${Math.round(Number(value) / 10000)}萬`
                }
              />
              <RechartsTooltip
                formatter={(value) => formatTwd(Number(value))}
              />
              <Line
                type="monotone"
                dataKey="totalTwd"
                stroke="#1677ff"
                strokeWidth={3}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        );
      }
      if (chartKey === "kind") {
        if (kindAnalysisData.length === 0)
          return <Empty description="尚無支出資料" />;
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={kindAnalysisData}
                dataKey="value"
                nameKey="name"
                outerRadius="72%"
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
              >
                {kindAnalysisData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip
                formatter={(value) => formatTwd(Number(value))}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );
      }
      if (chartKey === "ranking") {
        const hasValue = payerRankingData.some((item) => item.value > 0);
        if (!hasValue) return <Empty description="尚無支出資料" />;
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={payerRankingData}
              layout="vertical"
              margin={{ top: 8, right: 24, left: 36, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(value) =>
                  `${Math.round(Number(value) / 1000)}k`
                }
              />
              <YAxis type="category" dataKey="name" width={88} />
              <RechartsTooltip
                formatter={(value) => formatTwd(Number(value))}
              />
              <Bar dataKey="value" fill="#1677ff" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );
      }
      if (chartKey === "family_balance") {
        if (familyBalanceData.length === 0)
          return <Empty description="尚無家庭開銷資料" />;
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={familyBalanceData}
                dataKey="value"
                nameKey="name"
                outerRadius="72%"
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
              >
                {familyBalanceData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip
                formatter={(value) => formatTwd(Number(value))}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );
      }
      if (categoryAnalysisData.length === 0)
        return <Empty description="尚無分類資料" />;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={categoryAnalysisData}
              dataKey="value"
              nameKey="name"
              outerRadius="72%"
              label={({ name, percent }) =>
                `${name} ${(percent * 100).toFixed(0)}%`
              }
            >
              {categoryAnalysisData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <RechartsTooltip formatter={(value) => formatTwd(Number(value))} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      );
    },
    [
      categoryAnalysisData,
      familyBalanceData,
      kindAnalysisData,
      payerRankingData,
      trendMonths,
    ],
  );

  const activeExpenseChartTitle = useMemo(
    () =>
      expenseChartCards.find((item) => item.key === activeExpenseChartKey)
        ?.title || "支出圖表",
    [activeExpenseChartKey, expenseChartCards],
  );

  return (
    <AppErrorBoundary>
      <Layout className="app-layout">
        <Header className="app-header">
          <div className="header-spacer">
            {authUser && !isMobileViewport && (
              <Segmented
                size="middle"
                value={activeMainTab}
                onChange={setActiveMainTab}
                options={[
                  { label: "資產總覽", value: "asset", icon: <HomeOutlined /> },
                  {
                    label: "支出分析",
                    value: "expense",
                    icon: <FundProjectionScreenOutlined />,
                  },
                  {
                    label: "設定",
                    value: "settings",
                    icon: <SettingOutlined />,
                  },
                ]}
              />
            )}
          </div>
          <img
            src={`${import.meta.env.BASE_URL}vite.svg`}
            alt="My Stock logo"
            className="header-logo"
          />
          <div className="header-auth">
            {authUser && (
              <Space size={8}>
                <div className="header-sync-meta">
                  <Text
                    type={cloudSyncStatus === "error" ? "danger" : "secondary"}
                  >
                    <CloudSyncOutlined style={{ marginRight: 6 }} />
                    {authReady ? cloudSyncText : "讀取登入狀態中..."}
                  </Text>
                </div>
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
              </Space>
            )}
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
              title="上次同步發生錯誤"
              description={syncError}
              style={{ marginBottom: 16 }}
            />
          )}
          {!authUser ? (
            <Card style={{ maxWidth: 420, margin: "24px auto 0" }} title="登入">
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Text type="secondary">請先登入以查看資產與支出內容。</Text>
                {authLoginContentNode}
              </Space>
            </Card>
          ) : activeMainTab === "asset" ? (
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
                                      <Cell
                                        key={entry.key}
                                        fill={entry.color}
                                      />
                                    ))}
                                  </Pie>
                                  <RechartsTooltip
                                    formatter={(value) =>
                                      formatTwd(Number(value))
                                    }
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
                      {isMobileViewport ? (
                        <Button
                          type="text"
                          size="small"
                          className="title-add-btn"
                          onClick={() => {
                            if (isMobileViewport) {
                              setIsAddHoldingSheetOpen(true);
                            } else {
                              setIsAddHoldingModalOpen(true);
                            }
                          }}
                          disabled={loadingAddHolding}
                          icon={<PlusOutlined />}
                          aria-label="新增持股"
                        />
                      ) : (
                        <Tooltip title="新增持股">
                          <Button
                            type="text"
                            size="small"
                            className="title-add-btn"
                            onClick={() => {
                              if (isMobileViewport) {
                                setIsAddHoldingSheetOpen(true);
                              } else {
                                setIsAddHoldingModalOpen(true);
                              }
                            }}
                            disabled={loadingAddHolding}
                            icon={<PlusOutlined />}
                            aria-label="新增持股"
                          />
                        </Tooltip>
                      )}
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
                          {isMobileViewport ? (
                            <Button
                              type="primary"
                              icon={<DownOutlined />}
                              aria-label="選擇更新市場"
                              disabled={loadingRefresh}
                              onClick={() => setIsUpdateSheetOpen(true)}
                            />
                          ) : (
                            <Dropdown
                              trigger={["click"]}
                              disabled={loadingRefresh}
                              classNames={{ root: "price-update-menu" }}
                              menu={{
                                items: updateMenuItems,
                                onClick: ({ key }) => {
                                  if (key === "TW" || key === "US") {
                                    handleRefreshPrices(key);
                                  }
                                },
                              }}
                            >
                              <Button
                                type="primary"
                                icon={<DownOutlined />}
                                aria-label="選擇更新市場"
                              />
                            </Dropdown>
                          )}
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
                      {isMobileViewport ? (
                        <Button
                          type="text"
                          size="small"
                          className="title-add-btn"
                          onClick={() => {
                            if (isMobileViewport) {
                              setIsAddCashSheetOpen(true);
                            } else {
                              setIsAddCashModalOpen(true);
                            }
                          }}
                          disabled={loadingAddCashAccount}
                          icon={<PlusOutlined />}
                          aria-label="新增銀行帳戶"
                        />
                      ) : (
                        <Tooltip title="新增銀行帳戶">
                          <Button
                            type="text"
                            size="small"
                            className="title-add-btn"
                            onClick={() => {
                              if (isMobileViewport) {
                                setIsAddCashSheetOpen(true);
                              } else {
                                setIsAddCashModalOpen(true);
                              }
                            }}
                            disabled={loadingAddCashAccount}
                            icon={<PlusOutlined />}
                            aria-label="新增銀行帳戶"
                          />
                        </Tooltip>
                      )}
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
          ) : (
            <Row gutter={[16, 16]}>
              {activeMainTab === "expense" && (
                <>
                  <Col xs={24}>
                    <div className="expense-summary-panel expense-summary-panel--plain">
                      <Segmented
                        className="expense-summary-toggle"
                        size="small"
                        value={expenseTotalMode}
                        options={[
                          { label: "月份", value: "month" },
                          { label: "累計", value: "cumulative" },
                        ]}
                        onChange={(value) => {
                          expenseShouldAnimateRef.current = true;
                          setExpenseTotalMode(value);
                        }}
                      />
                      <div className="expense-summary-title">
                        <div className="expense-summary-meta">
                          {expenseTotalMode === "month" ? (
                            <div className="expense-month-nav">
                              <Button
                                type="text"
                                size="small"
                                icon={<LeftOutlined />}
                                className="expense-month-nav-btn"
                                aria-label="上個月份"
                                disabled={!canGoPrevExpenseMonth}
                                onClick={() => {
                                  if (!canGoPrevExpenseMonth) return;
                                  expenseShouldAnimateRef.current = true;
                                  setActiveExpenseMonth(
                                    expenseMonthNavOptions[
                                      expenseActiveMonthIndex - 1
                                    ],
                                  );
                                }}
                              />
                              <div className="expense-month-nav-title">
                                <Text strong>{expenseMonthTitle}</Text>
                              </div>
                              <Button
                                type="text"
                                size="small"
                                icon={<RightOutlined />}
                                className="expense-month-nav-btn"
                                aria-label="下個月份"
                                disabled={!canGoNextExpenseMonth}
                                onClick={() => {
                                  if (!canGoNextExpenseMonth) return;
                                  expenseShouldAnimateRef.current = true;
                                  setActiveExpenseMonth(
                                    expenseMonthNavOptions[
                                      expenseActiveMonthIndex + 1
                                    ],
                                  );
                                }}
                              />
                            </div>
                          ) : (
                            <Text strong>累計總支出</Text>
                          )}
                        </div>
                      </div>
                      <div className="expense-summary-value">
                        <div className="expense-summary-value-main">
                          <Statistic
                            value={expenseSummaryValue}
                            formatter={(value) => formatTwd(Number(value))}
                          />
                          {expenseTotalMode === "cumulative" ? (
                            <Tooltip title="查看支出走勢">
                              <Button
                                type="text"
                                size="small"
                                icon={<AreaChartOutlined />}
                                className="expense-summary-trend-btn"
                                aria-label="查看支出走勢"
                                onClick={() => {
                                  setActiveExpenseChartKey("trend");
                                  setIsExpenseChartModalOpen(true);
                                }}
                              />
                            </Tooltip>
                          ) : null}
                        </div>
                        <div className="expense-income-progress">
                          <div className="expense-income-segmented-track">
                              <div className="expense-income-segmented-track-fill">
                                <div
                                  className="expense-income-segment expense-income-segment--recurring"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      expenseRecurringDisplayPercent,
                                    )}%`,
                                  }}
                                />
                                <div
                                  className="expense-income-segment expense-income-segment--onetime"
                                  style={{
                                    left: `${Math.min(
                                      100,
                                      expenseRecurringDisplayPercent,
                                    )}%`,
                                    width: `${Math.min(
                                      100,
                                      expenseOneTimeDisplayPercent,
                                    )}%`,
                                  }}
                                />
                                {showExpenseSegmentDividerDisplay ? (
                                  <span
                                    className="expense-income-segment-divider"
                                    style={{
                                      left: `${Math.min(
                                        100,
                                        expenseRecurringDisplayPercent,
                                      )}%`,
                                    }}
                                  />
                                ) : null}
                              </div>
                              {showExpenseRateMarkerDisplay ? (
                                <span
                                  className={[
                                    "expense-rate-marker",
                                    expenseMarkerDisplayPercent <= 5
                                      ? "expense-rate-marker--edge-left"
                                      : "",
                                    expenseMarkerDisplayPercent >= 95
                                      ? "expense-rate-marker--edge-right"
                                      : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  style={{
                                    left: `${expenseMarkerDisplayPercent}%`,
                                  }}
                                >
                                  <span className="expense-rate-marker-label">
                                    {expenseRateMarkerLabel}
                                  </span>
                                  <span className="expense-rate-marker-caret" />
                                </span>
                              ) : null}
                            </div>
                          <div className="expense-income-progress-meta-row">
                            <Text
                              type="secondary"
                              className="expense-income-progress-meta-left"
                            >
                              {expenseIncomeProgressMetaLeftText}
                            </Text>
                            <Text
                              type="secondary"
                              className="expense-income-progress-meta-right"
                            >
                              {expenseIncomeProgressMetaRightText}
                            </Text>
                          </div>
                        </div>
                        {expenseTotalMode === "cumulative" && (
                          <Text
                            type="secondary"
                            className="expense-summary-subtext"
                          >
                            {expenseFirstDate
                              ? `自 ${dayjs(expenseFirstDate).format("YYYY/MM/DD")} 起`
                              : "尚無支出資料"}
                          </Text>
                        )}
                      </div>
                    </div>
                  </Col>
                  <Col xs={24}>
                    <section className="expense-analytics-section">
                      <Text strong className="expense-analytics-title">
                        支出圖表
                      </Text>
                      <div className="expense-analytics-row">
                        {expenseChartCards.map((chart) => (
                          <Card
                            key={chart.key}
                            size="small"
                            className="expense-analytics-card"
                          >
                            <div className="expense-analytics-card-head">
                              <Text strong className="active-recurring-title">
                                {chart.title}
                              </Text>
                              <Space
                                size={4}
                                className="active-recurring-card-actions"
                              >
                                {chart.key === "trend" ? (
                                  <Segmented
                                    size="small"
                                    value={expenseTrendRange}
                                    options={[
                                      { label: "近六個月", value: "6m" },
                                      { label: "近一年", value: "1y" },
                                    ]}
                                    onChange={(value) =>
                                      setExpenseTrendRange(value)
                                    }
                                  />
                                ) : null}
                                <Tooltip title="展開圖表">
                                  <Button
                                    type="text"
                                    size="small"
                                    icon={<ExpandOutlined />}
                                    className="active-recurring-stop-btn"
                                    aria-label={`展開${chart.title}`}
                                    onClick={() => {
                                      setActiveExpenseChartKey(chart.key);
                                      setIsExpenseChartModalOpen(true);
                                    }}
                                  />
                                </Tooltip>
                              </Space>
                            </div>
                            <div className="expense-analytics-card-body">
                              <div className="expense-chart-preview">
                                {renderExpenseChartPreview(chart.key)}
                              </div>
                              <Text
                                type="secondary"
                                className="expense-chart-preview-summary"
                              >
                                {expenseChartPreviewSummary[chart.key] ||
                                  "尚無資料"}
                              </Text>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </section>
                  </Col>
                  <Col xs={24}>
                    <section className="active-budgets-section">
                      <Text strong className="active-budgets-title">
                        目前生效預算
                      </Text>
                      {activeBudgetCards.length === 0 ? (
                        <Text type="secondary">目前沒有生效中的預算</Text>
                      ) : (
                        <div className="active-budgets-row">
                          {activeBudgetCards.map((budget) => (
                            <Card
                              key={budget.id}
                              size="small"
                              className="active-budget-card"
                            >
                              <div className="active-budget-head">
                                <Text
                                  type="secondary"
                                  className="active-budget-name"
                                  title={budget.name}
                                >
                                  {budget.name}
                                </Text>
                                <Tag
                                  className="active-budget-mode-tag"
                                  color={
                                    budget.budgetMode === "SPECIAL"
                                      ? "orange"
                                      : "blue"
                                  }
                                >
                                  {formatBudgetModeLabel(budget.budgetMode)}
                                </Tag>
                              </div>
                              <div
                                className={`active-budget-remaining ${
                                  Number(budget.spentTwd || 0) >
                                  Number(budget.availableTwd || 0)
                                    ? "active-budget-remaining--over"
                                    : ""
                                }`}
                              >
                                <span className="active-budget-remaining-prefix">
                                  已使用
                                </span>
                                <span className="active-budget-remaining-value">
                                  {`${(() => {
                                    const spent = Number(budget.spentTwd || 0);
                                    const available = Number(
                                      budget.availableTwd || 0,
                                    );
                                    if (
                                      !Number.isFinite(spent) ||
                                      !Number.isFinite(available) ||
                                      available <= 0
                                    ) {
                                      return 0;
                                    }
                                    return (spent / available) * 100;
                                  })().toFixed(1)}%`}
                                </span>
                              </div>
                              <Progress
                                percent={Math.round(
                                  Number(budget.progressPct || 0),
                                )}
                                size="small"
                                showInfo={false}
                                strokeColor={
                                  Number(budget.spentTwd || 0) >
                                  Number(budget.availableTwd || 0)
                                    ? "#f5222d"
                                    : undefined
                                }
                              />
                              <Text
                                type="secondary"
                                className="active-budget-meta"
                              >
                                {formatTwd(Number(budget.spentTwd) || 0)} /{" "}
                                {formatTwd(Number(budget.availableTwd) || 0)}
                                {budget.budgetMode === "SPECIAL" &&
                                budget.specialStartDate &&
                                budget.specialEndDate
                                  ? `（${dayjs(budget.specialStartDate).format("YYYY/MM/DD")}~${dayjs(
                                      budget.specialEndDate,
                                    ).format("YYYY/MM/DD")}）`
                                  : ""}
                              </Text>
                              {budget.budgetMode === "RESIDENT" &&
                              budget.isConfigured &&
                              budget.hasCarryInApplied ? (
                                <Text
                                  type="secondary"
                                  className="active-budget-carry"
                                >
                                  帶入{" "}
                                  {formatTwd(Number(budget.carryInTwd) || 0)}
                                </Text>
                              ) : null}
                            </Card>
                          ))}
                        </div>
                      )}
                    </section>
                  </Col>
                  <Col xs={24}>
                    <section className="active-recurring-section">
                      <Space size={8} className="active-recurring-title-wrap">
                        <Text strong className="active-recurring-title">
                          當前定期支出
                        </Text>
                        {isMobileViewport ? (
                          <Button
                            type="text"
                            size="small"
                            className="title-add-btn"
                            icon={<PlusOutlined />}
                            onClick={openRecurringCreateForm}
                            aria-label="新增定期支出"
                          />
                        ) : (
                          <Tooltip title="新增定期支出">
                            <Button
                              type="text"
                              size="small"
                              className="title-add-btn"
                              icon={<PlusOutlined />}
                              onClick={openRecurringCreateForm}
                              aria-label="新增定期支出"
                            />
                          </Tooltip>
                        )}
                      </Space>
                      {recurringExpenseRows.length === 0 ? (
                        <Text type="secondary">目前沒有定期支出</Text>
                      ) : (
                        <div className="active-recurring-row">
                          {recurringExpenseRows.map((item) => (
                            <Card
                              key={item.id}
                              size="small"
                              className="active-recurring-card"
                            >
                              <div className="active-recurring-card-head">
                                <Text
                                  type="secondary"
                                  className="active-budget-name"
                                  title={item.name}
                                >
                                  {item.name}
                                </Text>
                                <Space
                                  size={4}
                                  className="active-recurring-card-actions"
                                >
                                  <Tooltip title="編輯定期支出">
                                    <Button
                                      type="text"
                                      size="small"
                                      icon={<EditOutlined />}
                                      className="active-recurring-stop-btn"
                                      onClick={() =>
                                        openRecurringEditForm(item)
                                      }
                                      aria-label="編輯定期支出"
                                    />
                                  </Tooltip>
                                  <Tooltip title="取消定期支出">
                                    <Button
                                      type="text"
                                      size="small"
                                      icon={<DeleteOutlined />}
                                      className="active-recurring-stop-btn"
                                      loading={Boolean(
                                        stoppingRecurringById[item.id],
                                      )}
                                      onClick={() =>
                                        openStopRecurringModal(item)
                                      }
                                      aria-label="取消定期支出"
                                    />
                                  </Tooltip>
                                </Space>
                              </div>
                              <div className="active-recurring-amount">
                                <span className="active-budget-remaining-value">
                                  {formatTwd(Number(item.amountTwd) || 0)}
                                </span>
                                <span className="active-budget-remaining-prefix">
                                  /
                                  {item.recurrenceType === "YEARLY"
                                    ? "每年"
                                    : item.recurrenceType === "MONTHLY"
                                      ? "每月"
                                      : "--"}
                                </span>
                              </div>
                              <Text
                                type="secondary"
                                className="active-budget-meta"
                              >
                                {formatRecurringScheduleText(item)}
                                {item.recurrenceUntil
                                  ? `（至 ${dayjs(item.recurrenceUntil).format("YYYY/MM/DD")}）`
                                  : ""}
                              </Text>
                            </Card>
                          ))}
                        </div>
                      )}
                    </section>
                  </Col>
                  <Col xs={24}>
                    <Card
                      title={
                        <Space size={8}>
                          <span>支出列表</span>
                          {isMobileViewport ? (
                            <Button
                              type="text"
                              size="small"
                              className="title-add-btn"
                              icon={<PlusOutlined />}
                              onClick={() => openExpenseForm()}
                            />
                          ) : (
                            <Tooltip title="新增支出">
                              <Button
                                type="text"
                                size="small"
                                className="title-add-btn"
                                icon={<PlusOutlined />}
                                onClick={() => openExpenseForm()}
                              />
                            </Tooltip>
                          )}
                        </Space>
                      }
                    >
                      <Tabs
                        className="expense-category-tabs"
                        activeKey={activeExpenseCategoryTab}
                        onChange={setActiveExpenseCategoryTab}
                        items={expenseCategoryTabItems}
                        style={{ marginBottom: 12 }}
                      />
                      <Table
                        rowKey={(record) => `${record.id}-${record.occurredAt}`}
                        dataSource={filteredExpenseRowsByCategory}
                        columns={expenseTableColumns}
                        pagination={false}
                        locale={{ emptyText: "尚無支出紀錄" }}
                        scroll={{ x: 860 }}
                      />
                    </Card>
                  </Col>
                </>
              )}
              {activeMainTab === "settings" && (
                <>
                  <Col xs={24}>
                    <Card title="收入設定">
                      <Space
                        direction="vertical"
                        size={12}
                        style={{ width: "100%" }}
                      >
                        <div className="income-settings-row">
                          <Text type="secondary">預設每月收入 (TWD)</Text>
                          <InputNumber
                            min={0}
                            step={1000}
                            precision={0}
                            style={{ width: isMobileViewport ? "100%" : 240 }}
                            value={defaultMonthlyIncomeTwd ?? undefined}
                            placeholder="未設定"
                            onChange={(value) =>
                              setDefaultMonthlyIncomeTwd(
                                typeof value === "number" ? value : null,
                              )
                            }
                          />
                        </div>
                        <div className="income-settings-row">
                          <Text type="secondary">新增月份覆寫</Text>
                          <Space wrap>
                            <DatePicker
                              picker="month"
                              value={dayjs(newIncomeOverrideMonth)}
                              onChange={(value) =>
                                setNewIncomeOverrideMonth(value || dayjs())
                              }
                              getPopupContainer={getSheetPopupContainer}
                            />
                            <InputNumber
                              min={1}
                              step={1000}
                              precision={0}
                              value={newIncomeOverrideValue ?? undefined}
                              placeholder="收入金額"
                              onChange={(value) =>
                                setNewIncomeOverrideValue(
                                  typeof value === "number" ? value : null,
                                )
                              }
                            />
                            <Button
                              onClick={handleAddIncomeOverride}
                              loading={loadingIncomeSettings}
                            >
                              新增覆寫
                            </Button>
                          </Space>
                        </div>
                        <Table
                          rowKey="month"
                          size="small"
                          pagination={false}
                          dataSource={incomeMonthOverrides}
                          locale={{ emptyText: "尚無月份覆寫" }}
                          columns={[
                            {
                              title: "月份",
                              dataIndex: "month",
                              key: "month",
                            },
                            {
                              title: "收入 (TWD)",
                              dataIndex: "incomeTwd",
                              key: "incomeTwd",
                              align: "right",
                              render: (value) => formatTwd(value),
                            },
                            {
                              title: "操作",
                              key: "actions",
                              width: 90,
                              render: (_, record) => (
                                <Button
                                  danger
                                  size="small"
                                  icon={<DeleteOutlined />}
                                  loading={loadingIncomeSettings}
                                  onClick={() =>
                                    handleRemoveIncomeOverride(record.month)
                                  }
                                />
                              ),
                            },
                          ]}
                        />
                        <div className="income-settings-actions">
                          <Button
                            type="primary"
                            onClick={handleSaveIncomeSettings}
                            loading={loadingIncomeSettings}
                          >
                            儲存收入設定
                          </Button>
                        </div>
                      </Space>
                    </Card>
                  </Col>
                  <Col xs={24} lg={24}>
                    <Card
                      title={
                        <Space size={8}>
                          <span>類別列表</span>
                          {isMobileViewport ? (
                            <Button
                              type="text"
                              size="small"
                              className="title-add-btn"
                              icon={<PlusOutlined />}
                              onClick={() => openCategoryForm()}
                            />
                          ) : (
                            <Tooltip title="新增類別">
                              <Button
                                type="text"
                                size="small"
                                className="title-add-btn"
                                icon={<PlusOutlined />}
                                onClick={() => openCategoryForm()}
                              />
                            </Tooltip>
                          )}
                        </Space>
                      }
                    >
                      <Table
                        rowKey="id"
                        dataSource={expenseCategoryRows}
                        columns={expenseCategoryColumns}
                        pagination={false}
                        locale={{ emptyText: "尚無分類" }}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} lg={24}>
                    <Card
                      title={
                        <Space size={8}>
                          <span>預算列表</span>
                          {isMobileViewport ? (
                            <Button
                              type="text"
                              size="small"
                              className="title-add-btn"
                              icon={<PlusOutlined />}
                              onClick={() => openBudgetForm()}
                            />
                          ) : (
                            <Tooltip title="新增預算">
                              <Button
                                type="text"
                                size="small"
                                className="title-add-btn"
                                icon={<PlusOutlined />}
                                onClick={() => openBudgetForm()}
                              />
                            </Tooltip>
                          )}
                        </Space>
                      }
                    >
                      <Tabs
                        className="settings-budget-tabs"
                        activeKey={activeBudgetTab}
                        onChange={setActiveBudgetTab}
                        items={[
                          {
                            key: "resident",
                            label: "常駐預算",
                            children: (
                              <Table
                                rowKey="id"
                                dataSource={residentBudgetRows}
                                columns={residentBudgetColumns}
                                pagination={false}
                                locale={{ emptyText: "尚無常駐預算" }}
                                scroll={{ x: 720 }}
                              />
                            ),
                          },
                          {
                            key: "special",
                            label: "特別預算",
                            children: (
                              <Table
                                rowKey="id"
                                dataSource={specialBudgetRows}
                                columns={specialBudgetColumns}
                                pagination={false}
                                locale={{ emptyText: "尚無特別預算" }}
                                scroll={{ x: 820 }}
                              />
                            ),
                          },
                        ]}
                      />
                    </Card>
                  </Col>
                </>
              )}
            </Row>
          )}

          {authUser && (
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <Text type="secondary" className="cloud-last-sync-time">
                {cloudLastSyncedText}
              </Text>
            </div>
          )}

          {authUser && isMobileViewport && (
            <div className="mobile-main-tabbar">
              <Button
                type={activeMainTab === "asset" ? "primary" : "default"}
                icon={<HomeOutlined />}
                onClick={() => setActiveMainTab("asset")}
              >
                資產總覽
              </Button>
              <Button
                type={activeMainTab === "expense" ? "primary" : "default"}
                icon={<DollarOutlined />}
                onClick={() => setActiveMainTab("expense")}
              >
                支出分析
              </Button>
              <Button
                type={activeMainTab === "settings" ? "primary" : "default"}
                icon={<SettingOutlined />}
                onClick={() => setActiveMainTab("settings")}
              >
                設定
              </Button>
            </div>
          )}

          <Drawer
            placement="bottom"
            title="登入"
            open={isMobileViewport && isEmailLoginSheetOpen}
            onClose={() => {
              if (!isAuthDialogSubmitting) {
                setIsEmailLoginSheetOpen(false);
              }
            }}
            size="90vh"
            closable={!isAuthDialogSubmitting}
            maskClosable={!isAuthDialogSubmitting}
            keyboard={!isAuthDialogSubmitting}
            destroyOnHidden
            className="form-bottom-sheet"
            styles={{ body: { padding: 16 } }}
          >
            {authLoginContentNode}
          </Drawer>

          <Modal
            title={activeExpenseChartTitle}
            open={isExpenseChartModalOpen}
            onCancel={() => setIsExpenseChartModalOpen(false)}
            footer={null}
            width={isMobileViewport ? "94vw" : 960}
            destroyOnHidden
          >
            <div className="expense-chart-modal-body">
              {activeExpenseChartKey === "trend" ? (
                <div className="expense-chart-modal-toolbar">
                  <Segmented
                    size="middle"
                    value={expenseTrendRange}
                    options={[
                      { label: "近六個月", value: "6m" },
                      { label: "近一年", value: "1y" },
                    ]}
                    onChange={(value) => setExpenseTrendRange(value)}
                  />
                </div>
              ) : null}
              <div className="expense-chart-modal-content">
                {renderExpenseChartModalContent(activeExpenseChartKey)}
              </div>
            </div>
          </Modal>

          <Modal
            title="取消定期支出"
            open={isStopRecurringModalOpen}
            onCancel={closeStopRecurringModal}
            onOk={confirmStopRecurring}
            okText="確認取消"
            cancelText="取消"
            confirmLoading={Boolean(
              Number.isInteger(Number(selectedRecurringToStop?.id))
                ? stoppingRecurringById[Number(selectedRecurringToStop?.id)]
                : false,
            )}
          >
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Text type="secondary">
                已發生的紀錄會保留，未來將不再產生這筆定期支出。
              </Text>
              <Radio.Group
                value={stopKeepToday}
                onChange={(event) =>
                  setStopKeepToday(Boolean(event.target.value))
                }
              >
                <Space direction="vertical">
                  <Radio value>保留今天，從明天起停止</Radio>
                  <Radio value={false}>連今天一起停止</Radio>
                </Space>
              </Radio.Group>
            </Space>
          </Modal>

          <Modal
            title="登入"
            open={!isMobileViewport && isEmailLoginModalOpen}
            onCancel={() => {
              if (!isAuthDialogSubmitting) {
                setIsEmailLoginModalOpen(false);
              }
            }}
            footer={null}
            destroyOnHidden
            mask={{ closable: !isAuthDialogSubmitting }}
            keyboard={!isAuthDialogSubmitting}
            closable={!isAuthDialogSubmitting}
          >
            {authLoginContentNode}
          </Modal>

          <Drawer
            placement="bottom"
            open={isMobileViewport && isUpdateSheetOpen}
            onClose={() => setIsUpdateSheetOpen(false)}
            size="90vh"
            closable={false}
            maskClosable
            destroyOnHidden={false}
            className="update-sheet"
            styles={{ body: { padding: 16 } }}
          >
            <div className="update-sheet-actions">
              <Button
                block
                onClick={() => {
                  setIsUpdateSheetOpen(false);
                  handleRefreshPrices("TW");
                }}
                disabled={loadingRefresh}
                loading={loadingRefresh}
              >
                更新台股
              </Button>
              <Button
                block
                onClick={() => {
                  setIsUpdateSheetOpen(false);
                  handleRefreshPrices("US");
                }}
                disabled={loadingRefresh}
                loading={loadingRefresh}
              >
                更新美股
              </Button>
            </div>
            <div className="update-sheet-footer">
              上次更新價格於 {priceUpdatedRelativeText}
            </div>
          </Drawer>

          <MobileFormSheetLayout
            title="新增持股"
            open={isMobileViewport && isAddHoldingSheetOpen}
            onClose={() => setIsAddHoldingSheetOpen(false)}
            loading={loadingAddHolding}
            submitText="新增持股"
            submitFormId="mobile-holding-form"
            className="holding-sheet"
          >
            <HoldingForm
              onSubmit={handleAddHolding}
              layout="vertical"
              formId="mobile-holding-form"
              popupContainer={getSheetPopupContainer}
              disableAutofill
              holdingTagOptions={holdingTagOptions}
            />
          </MobileFormSheetLayout>

          <MobileFormSheetLayout
            title="新增銀行帳戶"
            open={isMobileViewport && isAddCashSheetOpen}
            onClose={() => setIsAddCashSheetOpen(false)}
            loading={loadingAddCashAccount}
            submitText="新增銀行帳戶"
            submitFormId="mobile-cash-form"
            className="cash-sheet"
          >
            <CashAccountForm
              onSubmit={handleAddCashAccount}
              loadingBankOptions={loadingBankOptions}
              bankOptions={bankOptions}
              formId="mobile-cash-form"
              popupContainer={getSheetPopupContainer}
              disableAutofill
            />
          </MobileFormSheetLayout>

          <Modal
            title="新增持股"
            open={!isMobileViewport && isAddHoldingModalOpen}
            onCancel={() => {
              if (!loadingAddHolding) {
                setIsAddHoldingModalOpen(false);
              }
            }}
            footer={[
              <Button
                key="cancel"
                onClick={() => setIsAddHoldingModalOpen(false)}
                disabled={loadingAddHolding}
              >
                取消
              </Button>,
              <Button
                key="submit"
                type="primary"
                htmlType="submit"
                form="desktop-holding-form"
                loading={loadingAddHolding}
              >
                新增持股
              </Button>,
            ]}
            destroyOnHidden
            mask={{ closable: !loadingAddHolding }}
            keyboard={!loadingAddHolding}
            closable={!loadingAddHolding}
          >
            <HoldingForm
              onSubmit={handleAddHolding}
              layout="vertical"
              formId="desktop-holding-form"
              popupContainer={getSheetPopupContainer}
              holdingTagOptions={holdingTagOptions}
            />
          </Modal>

          <Modal
            title="新增銀行帳戶"
            open={!isMobileViewport && isAddCashModalOpen}
            onCancel={() => {
              if (!loadingAddCashAccount) {
                setIsAddCashModalOpen(false);
              }
            }}
            footer={[
              <Button
                key="cancel"
                onClick={() => setIsAddCashModalOpen(false)}
                disabled={loadingAddCashAccount}
              >
                取消
              </Button>,
              <Button
                key="submit"
                type="primary"
                htmlType="submit"
                form="desktop-cash-form"
                loading={loadingAddCashAccount}
              >
                新增銀行帳戶
              </Button>,
            ]}
            destroyOnHidden
            mask={{ closable: !loadingAddCashAccount }}
            keyboard={!loadingAddCashAccount}
            closable={!loadingAddCashAccount}
          >
            <CashAccountForm
              onSubmit={handleAddCashAccount}
              loadingBankOptions={loadingBankOptions}
              bankOptions={bankOptions}
              formId="desktop-cash-form"
              popupContainer={getSheetPopupContainer}
            />
          </Modal>

          <MobileFormSheetLayout
            title={
              expenseFormMode === "recurring-create"
                ? "新增定期支出"
                : editingExpenseEntry
                  ? "編輯支出"
                  : "新增支出"
            }
            open={isMobileViewport && isExpenseSheetOpen}
            onClose={() => {
              setIsExpenseSheetOpen(false);
              setEditingExpenseEntry(null);
              setExpenseFormMode("normal");
              expenseForm.resetFields();
            }}
            loading={loadingExpenseAction}
            submitText="儲存"
            onSubmit={handleSubmitExpense}
          >
            {expenseFormNode}
          </MobileFormSheetLayout>

          <MobileFormSheetLayout
            title={editingCategory ? "編輯分類" : "新增分類"}
            open={isMobileViewport && isCategorySheetOpen}
            onClose={() => {
              setIsCategorySheetOpen(false);
              setEditingCategory(null);
              categoryForm.resetFields();
            }}
            loading={loadingCategoryAction}
            submitText="儲存"
            onSubmit={handleSubmitCategory}
          >
            {categoryFormNode}
          </MobileFormSheetLayout>

          <MobileFormSheetLayout
            title={editingBudget ? "編輯預算" : "新增預算"}
            open={isMobileViewport && isBudgetSheetOpen}
            onClose={() => {
              setIsBudgetSheetOpen(false);
              setEditingBudget(null);
              budgetForm.resetFields();
            }}
            loading={loadingBudgetAction}
            submitText="儲存"
            onSubmit={handleSubmitBudget}
          >
            {budgetFormNode}
          </MobileFormSheetLayout>

          <Modal
            title={
              expenseFormMode === "recurring-create"
                ? "新增定期支出"
                : editingExpenseEntry
                  ? "編輯支出"
                  : "新增支出"
            }
            open={!isMobileViewport && isExpenseModalOpen}
            onCancel={() => {
              if (!loadingExpenseAction) {
                setIsExpenseModalOpen(false);
                setEditingExpenseEntry(null);
                setExpenseFormMode("normal");
                expenseForm.resetFields();
              }
            }}
            onOk={handleSubmitExpense}
            confirmLoading={loadingExpenseAction}
            okText="儲存"
            destroyOnHidden
          >
            {expenseFormNode}
          </Modal>

          <Modal
            title={editingCategory ? "編輯分類" : "新增分類"}
            open={!isMobileViewport && isCategoryModalOpen}
            onCancel={() => {
              if (!loadingCategoryAction) {
                setIsCategoryModalOpen(false);
                setEditingCategory(null);
                categoryForm.resetFields();
              }
            }}
            onOk={handleSubmitCategory}
            confirmLoading={loadingCategoryAction}
            okText="儲存"
            destroyOnHidden
          >
            {categoryFormNode}
          </Modal>

          <Modal
            title={editingBudget ? "編輯預算" : "新增預算"}
            open={!isMobileViewport && isBudgetModalOpen}
            onCancel={() => {
              if (!loadingBudgetAction) {
                setIsBudgetModalOpen(false);
                setEditingBudget(null);
                budgetForm.resetFields();
              }
            }}
            onOk={handleSubmitBudget}
            confirmLoading={loadingBudgetAction}
            okText="儲存"
            destroyOnHidden
          >
            {budgetFormNode}
          </Modal>
        </Content>
      </Layout>
    </AppErrorBoundary>
  );
}

export default App;
