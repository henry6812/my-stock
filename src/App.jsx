import {
  Component,
  Fragment,
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
  AutoComplete,
  App as AntdApp,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Drawer,
  Dropdown,
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
  Spin,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tooltip,
  Tag,
  Typography,
} from "antd";
import {
  ArrowDown,
  Bank,
  CandlestickChart,
  Clock,
  CloudCheck,
  CloudSync,
  CloudXmark,
  Coins,
  CoinsSwap,
  Download,
  EditPencil,
  Globe,
  Google,
  GraphUp,
  Group,
  HomeSimple,
  HomeUser,
  Journal,
  Label,
  LogOut,
  Menu,
  NavArrowDown,
  NavArrowRight,
  PercentageCircle,
  Plus,
  Refresh,
  Repeat,
  Settings,
  Star,
  StatsReport,
  Trash,
  Wallet,
  WifiOff,
} from "iconoir-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LoadingOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import anime from "animejs/lib/anime.es.js";
import { flushSync } from "react-dom";
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
import QuickExpenseSheet from "./components/QuickExpenseSheet";
import ExpenseTemplateForm from "./components/ExpenseTemplateForm";
import RecurringOverview from "./components/RecurringOverview";
import EmptyState from "./components/EmptyState";
import SectionTitle from "./components/SectionTitle";
import MobileIncomeSettings from "./components/MobileIncomeSettings";
import MobileSwipeRow from "./components/MobileSwipeRow";
import {
  swipeDeleteAction,
  swipeEditAction,
} from "./components/swipeActionItems";
import HoverTooltip from "./components/HoverTooltip";
import AllocationBreakdown from "./components/AllocationBreakdown";
import { describeAllocation } from "./utils/allocation";
import CollapsibleGroups from "./components/CollapsibleGroups";
import BudgetOverview from "./components/BudgetOverview";
import BudgetDetailSheet from "./components/BudgetDetailSheet";
import StockDetailSheet from "./components/StockDetailSheet";
import { buildStockDetailHolding, isInteractiveTarget } from "./utils/stockDetail";
import { isFromPortal } from "./utils/portalEvent";
import CategoryIcon from "./components/CategoryIcon";
import CategoryIconPicker from "./components/CategoryIconPicker";
import ExpenseDayList, {
  UpcomingExpenseList,
} from "./components/ExpenseDayList";
import {
  getPortfolioView,
  getTrend,
  initSync,
  refreshPrices,
  refreshHoldingPrice,
  getHolderOptions,
  getHolderUsageSummary,
  getHoldingTagOptions,
  removeHolding,
  stopSync,
  syncNow as syncNowPortfolio,
  removeCashAccount,
  getCloudSyncRuntime,
  updateCashAccountBalance,
  updateCashAccountHolder,
  updateHoldingTag,
  updateHoldingHolder,
  updateHoldingShares,
  upsertCashAccount,
  exportBackupData,
  upsertHolding,
  getExpenseDashboardView,
  saveHolderOptions,
  saveIncomeSettings,
  setIncomeOverride,
  removeIncomeOverride,
  upsertExpenseEntry,
  stopRecurringExpense,
  removeExpenseEntry,
  upsertExpenseCategory,
  removeExpenseCategory,
  upsertExpenseTemplate,
  removeExpenseTemplate,
  reorderExpenseTemplates,
  setExpenseCategoryQuickPick,
  upsertBudget,
  removeBudget,
  repairNumericFields,
} from "./services/portfolioService";
import {
  loginWithEmailPassword,
  loginWithGoogle,
  logoutGoogle,
  observeAuthState,
} from "./services/firebase/authService";
import { CLOUD_SYNC_UPDATED_EVENT } from "./services/firebase/cloudSyncService";
import { coalesceAsync } from "./utils/coalesce";
import { getBankDirectory } from "./services/bankProviders/twBankDirectoryProvider";
import {
  formatAxisTwd,
  formatDate,
  formatDateTime,
  formatPrice,
  formatRelativeTime,
  formatTwd,
} from "./utils/formatters";
import { parseNumericLike } from "./utils/number";
import {
  PULL_REFRESH_MAX,
  PULL_REFRESH_TRIGGER,
  NUMBER_ANIMATION_DURATION_MS,
  DEFAULT_EXPENSE_ANALYTICS,
  getHolderTagStyle as getHolderTagStyleFor,
  getStableChartColor,
  createHolderDraftRow,
  createHolderDraftRows,
  HOLDER_TAB_ALL,
  HOLDER_TAB_UNSET,
  getHolderTabKey,
  formatSignedPrice,
  formatSignedTwd,
  formatChangePercent,
  formatBudgetModeLabel,
  formatBudgetCycleLabel,
  createCashCsvContent,
  createExpensesCsvContent,
  createHoldingsCsvContent,
  filterRowsByHolderTab,
} from "./utils/portfolioView";
import { getBootPhase } from "./utils/bootPhase";
import { prefersReducedMotion } from "./utils/motion";
import { getAssetAnimationPlan } from "./utils/netWorthJar";
import AssetSummaryHero from "./components/AssetSummaryHero";
import ExpenseSummaryCard from "./components/ExpenseSummaryCard";
import { toUserMessage } from "./utils/userMessage";
import { CHART_NEUTRAL, CHART_PALETTE, COLORS } from "./theme/tokens";
import { BUDGET_LEVEL_COLORS, getBudgetStatus } from "./utils/budgetStatus";
import { sortBudgetsByUrgency } from "./utils/budgetView";
import {
  filterNameSuggestions,
  pickQuickCategories,
  sanitizeSuggestions,
} from "./utils/expenseSuggestions";
import { applyTemplateToFormValues } from "./utils/expenseTemplates";
import { describeRecurrenceStart } from "./utils/recurrence";
import { groupHoldingsByHolder } from "./utils/holdingGroups";
import useBodyScrollLock from "./hooks/useBodyScrollLock";
import { applyPwaUpdate, onPwaNeedRefresh } from "./pwaUpdate";
import {
  getMainTabDirection,
  runDirectionalTransition,
} from "./utils/viewTransition";
import "./App.css";

const { Header, Content } = Layout;
const { Text } = Typography;

const downloadTextFile = (content, filename, type) => {
  if (typeof document === "undefined") {
    return;
  }
  const blob = new Blob([content], { type });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => {
    URL.revokeObjectURL(downloadUrl);
  }, 0);
};

// animejs ignores the CSS prefers-reduced-motion rule, so honour it here:
// a 0ms tween jumps straight to the final number.
const getNumberAnimationDuration = () =>
  prefersReducedMotion() ? 0 : NUMBER_ANIMATION_DURATION_MS;

// Per-device convenience: prefill a new expense with the last payer / kind /
// category used. Not synced — storage can be missing or throw, so fail soft.
const LAST_EXPENSE_DEFAULTS_KEY = "my-stock:last-expense-defaults";
const TEMPLATE_FORM_ID = "expense-template-form";

const readLastExpenseDefaults = () => {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LAST_EXPENSE_DEFAULTS_KEY) || "{}",
    );
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeLastExpenseDefaults = (defaults) => {
  try {
    window.localStorage.setItem(
      LAST_EXPENSE_DEFAULTS_KEY,
      JSON.stringify(defaults),
    );
  } catch {
    // Storage unavailable (private mode etc.) — nothing to remember.
  }
};

const RowContext = createContext({
  listeners: undefined,
  setActivatorNodeRef: undefined,
});

// Header sync status: the icon carries the state too, since the text next to
// it is cut short on narrow screens.
const SYNC_STATUS_ICONS = {
  syncing: CloudSync,
  offline: WifiOff,
  error: CloudXmark,
};

function SyncStatusIcon({ status, ...props }) {
  const Icon = SYNC_STATUS_ICONS[status] ?? CloudCheck;
  return <Icon {...props} />;
}

function DragHandle({ disabled }) {
  const { listeners, setActivatorNodeRef } = useContext(RowContext);

  return (
    <Button
      type="text"
      size="small"
      icon={<Menu />}
      ref={setActivatorNodeRef}
      {...listeners}
      disabled={disabled}
      aria-label="拖曳排序"
      className="drag-handle"
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
      ? { position: "relative", zIndex: 999, background: COLORS.surface }
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
      errorMessage: toUserMessage(error, "畫面發生未預期的錯誤"),
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
  const { message, notification, modal } = AntdApp.useApp();
  // Swipe 刪除 / 移除 on mobile asks first, as the desktop Popconfirm does.
  const confirmDestructive = useCallback(
    ({ title, content, okText = "刪除", onOk }) => {
      modal.confirm({
        title,
        content,
        okText,
        cancelText: "取消",
        okButtonProps: { danger: true },
        onOk,
      });
    },
    [modal],
  );
  const [rows, setRows] = useState([]);
  const [cashRows, setCashRows] = useState([]);
  const [totalTwd, setTotalTwd] = useState(0);
  const [displayTotalTwd, setDisplayTotalTwd] = useState(0);
  const [baselineTotalTwd, setBaselineTotalTwd] = useState(0);
  const [totalChangeTwd, setTotalChangeTwd] = useState(undefined);
  const [totalChangePct, setTotalChangePct] = useState(null);
  const [priceDataStale, setPriceDataStale] = useState(false);
  const [latestPriceCapturedAt, setLatestPriceCapturedAt] = useState(null);
  const [trend, setTrend] = useState([]);
  const [range, setRange] = useState("24h");
  const [lastUpdatedAt, setLastUpdatedAt] = useState();
  const [nowTick, setNowTick] = useState(Date.now());
  const [syncError, setSyncError] = useState("");
  const [loadingRefresh, setLoadingRefresh] = useState(false);
  const [loadingAddHolding, setLoadingAddHolding] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [loadingAuthAction, setLoadingAuthAction] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState("idle");
  const [cloudSyncError, setCloudSyncError] = useState("");
  const [cloudLastSyncedAt, setCloudLastSyncedAt] = useState();
  const [cloudReadOnly, setCloudReadOnly] = useState(true);
  const [cloudReadOnlyReason, setCloudReadOnlyReason] = useState("");
  const isWriteDisabled = !authUser || !authReady || cloudReadOnly;
  // 'loading' while auth resolves / the first cloud sync runs, so a returning
  // user never sees the stale local cache before their real data loads.
  const bootPhase = getBootPhase({ authReady, authUser });
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState("asset");
  // Main tab switches slide in the direction of travel (View Transitions API);
  // flushSync makes React commit inside the transition's update callback, and
  // scrolling there means the incoming tab is captured already at the top.
  const switchMainTab = (nextTab) => {
    runDirectionalTransition(getMainTabDirection(activeMainTab, nextTab), () => {
      flushSync(() => setActiveMainTab(nextTab));
      window.scrollTo(0, 0);
    });
  };
  // Which 資產分析 chart is open in its modal (null = none).
  const [activeAssetChartKey, setActiveAssetChartKey] = useState(null);
  const [activeHoldingTab, setActiveHoldingTab] = useState(HOLDER_TAB_ALL);
  const [activeCashHolderTab, setActiveCashHolderTab] = useState(HOLDER_TAB_ALL);
  const [isAddHoldingModalOpen, setIsAddHoldingModalOpen] = useState(false);
  const [isAddCashModalOpen, setIsAddCashModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isExpenseSheetOpen, setIsExpenseSheetOpen] = useState(false);
  const [isQuickExpenseOpen, setIsQuickExpenseOpen] = useState(false);
  // Mobile: the budget whose current-cycle detail sheet is open.
  const [budgetDetailId, setBudgetDetailId] = useState(null);
  const [stockDetailId, setStockDetailId] = useState(null);
  // Bumped on every open so QuickExpenseSheet remounts with fresh state.
  const [quickExpenseKey, setQuickExpenseKey] = useState(0);
  const [quickExpenseDefaults, setQuickExpenseDefaults] = useState({});
  const [expenseTemplateRows, setExpenseTemplateRows] = useState([]);
  const [isTemplateFormOpen, setIsTemplateFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  // Bumped on every open so ExpenseTemplateForm remounts with fresh values.
  const [templateFormKey, setTemplateFormKey] = useState(0);
  const [loadingTemplateAction, setLoadingTemplateAction] = useState(false);
  const [loadingTemplateReorder, setLoadingTemplateReorder] = useState(false);
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);
  const [isBudgetSheetOpen, setIsBudgetSheetOpen] = useState(false);
  const [isAddHoldingSheetOpen, setIsAddHoldingSheetOpen] = useState(false);
  const [isAddCashSheetOpen, setIsAddCashSheetOpen] = useState(false);
  const [isUpdateSheetOpen, setIsUpdateSheetOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 768 : false,
  );
  // The 更新價格 market sheet is a bare Drawer; the other mobile sheets lock
  // the page themselves (MobileFormSheetLayout, QuickExpenseSheet, …).
  useBodyScrollLock(isMobileViewport && isUpdateSheetOpen);
  const [loadingAddCashAccount, setLoadingAddCashAccount] = useState(false);
  const [loadingEmailLogin, setLoadingEmailLogin] = useState(false);
  const [loadingExpenseAction, setLoadingExpenseAction] = useState(false);
  const [loadingCategoryAction, setLoadingCategoryAction] = useState(false);
  const [quickPickLoadingId, setQuickPickLoadingId] = useState(null);
  const [loadingBudgetAction, setLoadingBudgetAction] = useState(false);
  const [loadingBankOptions, setLoadingBankOptions] = useState(false);
  const [bankOptions, setBankOptions] = useState([]);
  const [holdingTagOptions, setHoldingTagOptions] = useState([
    { value: "STOCK", label: "個股" },
    { value: "ETF", label: "ETF" },
    { value: "BOND", label: "債券" },
  ]);
  const [holderOptions, setHolderOptions] = useState(["Po", "Wei"]);
  const getHolderTagStyle = useCallback(
    (holder) => getHolderTagStyleFor(holder, holderOptions),
    [holderOptions],
  );
  const [holderDraftRows, setHolderDraftRows] = useState(() =>
    createHolderDraftRows(["Po", "Wei"]),
  );
  const [loadingHolderSettings, setLoadingHolderSettings] = useState(false);
  const [editingHoldingId, setEditingHoldingId] = useState(null);
  const [editingShares, setEditingShares] = useState(null);
  const [editingHoldingTag, setEditingHoldingTag] = useState(null);
  const [editingHoldingHolder, setEditingHoldingHolder] = useState(null);
  const [loadingActionById, setLoadingActionById] = useState({});
  const [editingCashAccountId, setEditingCashAccountId] = useState(null);
  const [editingCashBalance, setEditingCashBalance] = useState(null);
  const [editingCashHolder, setEditingCashHolder] = useState(null);
  const [loadingCashActionById, setLoadingCashActionById] = useState({});
  const [expenseRows, setExpenseRows] = useState([]);
  const [showExpenseMoreFields, setShowExpenseMoreFields] = useState(false);
  const [inlineCategoryName, setInlineCategoryName] = useState("");
  const [loadingInlineCategory, setLoadingInlineCategory] = useState(false);
  const [activeExpenseCategoryTab, setActiveExpenseCategoryTab] =
    useState("all");
  const [expenseMonthOptions, setExpenseMonthOptions] = useState([]);
  const [activeExpenseMonth, setActiveExpenseMonth] = useState(
    dayjs().format("YYYY-MM"),
  );
  // Mirror of the selected month so no-arg reloads (cloud sync / bootstrap)
  // always read the latest selection instead of a stale closure value.
  const activeExpenseMonthRef = useRef(activeExpenseMonth);
  activeExpenseMonthRef.current = activeExpenseMonth;
  const [expenseTotalMode, setExpenseTotalMode] = useState("month");
  // Recurring charges later this month: listed but not in the month total.
  const [expenseMonthlySummaries, setExpenseMonthlySummaries] = useState([]);
  const [expenseCategoryRows, setExpenseCategoryRows] = useState([]);
  const [expenseNameSuggestions, setExpenseNameSuggestions] = useState([]);
  const [categoryUsageOrder, setCategoryUsageOrder] = useState([]);
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
  // Bumped whenever the expense summary should replay its tower entrance.
  const [expensePlayKey, setExpensePlayKey] = useState(0);
  const [recurringExpenseRows, setRecurringExpenseRows] = useState([]);
  const [recurringSummary, setRecurringSummary] = useState({
    count: 0,
    monthlyEquivalentTwd: 0,
  });
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
  const shouldShowStopOptions = Boolean(
    selectedRecurringToStop?.hasOccurrenceToday,
  );
  const [rowAnimationValues, setRowAnimationValues] = useState({});
  // Bumped whenever the asset summary should replay its entrance animation.
  const [assetPlayKey, setAssetPlayKey] = useState(0);
  const pullStartYRef = useRef(0);
  const pullingRef = useRef(false);
  const activeHoldingTabRef = useRef(HOLDER_TAB_ALL);
  // True while the first realtime snapshots are being applied after sign-in.
  const initialSyncInFlightRef = useRef(false);
  const shouldAnimateNumbersRef = useRef(false);
  // Ensures the "auto-refresh on open if stale" runs at most once per session.
  const autoRefreshAttemptedRef = useRef(false);
  // Set when the one-shot auto refresh fails (fully or partly) so the summary
  // can say so instead of silently showing yesterday's prices.
  const [autoRefreshIssue, setAutoRefreshIssue] = useState(null);
  const didRunInitialAnimationRef = useRef(false);
  const loadRequestSeqRef = useRef(0);
  const totalAnimationRef = useRef(null);
  const rowAnimationTargetRef = useRef([]);
  const rowAnimationInstanceRef = useRef(null);
  const animationLockedUntilRef = useRef(0);
  // Quick-sheet values handed to the full expense form ("完整表單"); applied
  // by the form's open effect after its own defaults.
  const pendingExpenseDraftRef = useRef(null);
  // What the last 常用支出 chip put into the full form (see
  // applyTemplateToFormValues); reset whenever the form opens.
  const appliedTemplateStateRef = useRef(null);
  // While a template reorder is writing, realtime echoes of each row would
  // reload a half-applied order; the drag handler reloads once at the end.
  const templateReorderInFlightRef = useRef(false);
  const latestTotalTwdRef = useRef(0);
  const [expenseForm] = Form.useForm();
  const [categoryForm] = Form.useForm();
  const watchedCategoryName = Form.useWatch("name", categoryForm);
  const [budgetForm] = Form.useForm();
  const [emailLoginForm] = Form.useForm();

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

  const animateTotalValue = useCallback((targetValue) => {
    const parsedTarget = parseNumericLike(targetValue, {
      fallback: Number.NaN,
      context: "animateTotalValue.targetValue",
    });
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      setDisplayTotalTwd(Number.isFinite(parsedTarget) ? parsedTarget : 0);
      return false;
    }

    const target = { value: parsedTarget * 0.99999 };
    setDisplayTotalTwd(target.value);
    const instance = anime({
      targets: target,
      value: parsedTarget,
      duration: getNumberAnimationDuration(),
      easing: "easeOutExpo",
      update: () => {
        setDisplayTotalTwd(target.value);
      },
      complete: () => {
        if (totalAnimationRef.current === instance) {
          totalAnimationRef.current = null;
        }
        setDisplayTotalTwd(latestTotalTwdRef.current);
      },
    });
    totalAnimationRef.current = instance;
    return true;
  }, []);

  const animateVisibleRows = useCallback((visibleRows) => {
    if (!Array.isArray(visibleRows) || visibleRows.length === 0) {
      setRowAnimationValues({});
      return false;
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
      return false;
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

    const instance = anime({
      targets,
      duration: getNumberAnimationDuration(),
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
        if (rowAnimationInstanceRef.current === instance) {
          rowAnimationInstanceRef.current = null;
        }
        setRowAnimationValues({});
      },
    });
    rowAnimationInstanceRef.current = instance;
    return true;
  }, []);

  // PointerSensor covers mouse + touch (the handle sets touch-action: none so
  // a touch drag doesn't scroll the page); KeyboardSensor lets the focused
  // handle be moved with Space + arrow keys.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const loadAllData = useCallback(async () => {
    const requestId = loadRequestSeqRef.current + 1;
    loadRequestSeqRef.current = requestId;

    const [portfolio, trendData] = await Promise.all([
      getPortfolioView(),
      getTrend(range),
    ]);
    if (requestId !== loadRequestSeqRef.current) {
      return;
    }
    const normalizedTotalTwd = parseNumericLike(portfolio.totalTwd, {
      fallback: 0,
      context: "loadAllData.portfolio.totalTwd",
    });
    const normalizedBaselineTotalTwd = parseNumericLike(
      portfolio.baselineTotalTwd,
      {
        fallback: 0,
        context: "loadAllData.portfolio.baselineTotalTwd",
      },
    );

    setRows(portfolio.rows);
    setCashRows(portfolio.cashRows ?? []);
    setTotalTwd(normalizedTotalTwd);
    latestTotalTwdRef.current = normalizedTotalTwd;
    setBaselineTotalTwd(normalizedBaselineTotalTwd);
    setTotalChangeTwd(portfolio.totalChangeTwd);
    setTotalChangePct(portfolio.totalChangePct ?? null);
    setPriceDataStale(Boolean(portfolio.priceDataStale));
    setLatestPriceCapturedAt(portfolio.latestPriceCapturedAt ?? null);
    setLastUpdatedAt(portfolio.lastUpdatedAt);
    setSyncError(portfolio.syncStatus === "error" ? portfolio.syncError : "");
    setTrend(trendData);
    const applyLatestDisplayState = () => {
      setDisplayTotalTwd(normalizedTotalTwd);
      setRowAnimationValues({});
    };

    const animationPlan = getAssetAnimationPlan({
      isInitialLoad: !didRunInitialAnimationRef.current,
      numbersRequested: shouldAnimateNumbersRef.current,
    });
    if (animationPlan.replayJar) {
      setAssetPlayKey((key) => key + 1);
    }
    if (animationPlan.animateNumbers) {
      didRunInitialAnimationRef.current = true;
      shouldAnimateNumbersRef.current = false;
      stopNumberAnimations("manual");
      const totalAnimationStarted = animateTotalValue(normalizedTotalTwd);
      const rowAnimationStarted = animateVisibleRows(
        filterRowsByHolderTab(
          Array.isArray(portfolio.rows) ? portfolio.rows : [],
          activeHoldingTabRef.current,
        ),
      );
      if (totalAnimationStarted || rowAnimationStarted) {
        beginNumberAnimationLock();
      } else {
        applyLatestDisplayState();
      }
    } else {
      const locked = isNumberAnimationLocked();
      const hasLiveAnimations = Boolean(
        totalAnimationRef.current || rowAnimationInstanceRef.current,
      );
      const hasStaleLock = locked && !hasLiveAnimations;
      if (!locked || hasStaleLock) {
        if (hasStaleLock) {
          animationLockedUntilRef.current = 0;
        }
        stopNumberAnimations("force");
        applyLatestDisplayState();
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
    animateTotalValue,
    animateVisibleRows,
    beginNumberAnimationLock,
    isNumberAnimationLocked,
    range,
    stopNumberAnimations,
  ]);

  const refreshCloudRuntime = useCallback(() => {
    const runtime = getCloudSyncRuntime();
    setCloudReadOnly(Boolean(runtime.readOnly));
    if (runtime.lastError) {
      setCloudSyncStatus("error");
      const friendlyError = toUserMessage(runtime.lastError, "雲端同步發生錯誤");
      setCloudSyncError(friendlyError);
      setCloudReadOnlyReason(friendlyError);
      return runtime;
    }
    if (!authUser) {
      setCloudSyncStatus("idle");
      setCloudSyncError("");
      setCloudReadOnlyReason("請先登入後再修改資料。");
      return runtime;
    }
    if (!runtime.firestoreAvailable) {
      setCloudSyncStatus("error");
      setCloudSyncError("Firebase 服務目前不可用");
      setCloudReadOnlyReason("Firebase 服務目前不可用。");
      return runtime;
    }
    if (!runtime.connected) {
      setCloudSyncStatus("offline");
      setCloudSyncError("");
      setCloudReadOnlyReason("目前離線，暫時只能檢視資料。");
      return runtime;
    }
    if (!runtime.listenersReady) {
      setCloudSyncStatus("syncing");
      setCloudSyncError("");
      setCloudReadOnlyReason("雲端同步尚未完成，請稍後再試。");
      return runtime;
    }
    setCloudSyncStatus("success");
    setCloudSyncError("");
    setCloudReadOnlyReason("");
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
        setCloudSyncError(toUserMessage(error, "同步失敗"));
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
      const requestedMonth = monthInput ?? activeExpenseMonthRef.current;
      const view = await getExpenseDashboardView({ month: requestedMonth });
      setExpenseRows(view.expenseRows ?? []);
      setExpenseMonthOptions(view.monthOptions ?? []);
      // Only move the selected month when the server couldn't serve the one we
      // asked for (e.g. it isn't a valid option). Overwriting a still-valid
      // selection let constant realtime-sync reloads snap a past-month view
      // back to the current month.
      const resolvedMonth = view.activeMonth || dayjs().format("YYYY-MM");
      if (resolvedMonth !== requestedMonth) {
        setActiveExpenseMonth(resolvedMonth);
      }
      setExpenseMonthlySummaries(view.monthlySummaries ?? []);
      setExpenseCategoryRows(view.categoryRows ?? []);
      setExpenseNameSuggestions(view.expenseNameSuggestions ?? []);
      setExpenseTemplateRows(view.expenseTemplates ?? []);
      setCategoryUsageOrder(view.categoryUsageOrder ?? []);
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
      setRecurringSummary(
        view.recurringSummary ?? { count: 0, monthlyEquivalentTwd: 0 },
      );
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
    // Stable identity: the latest month is read from activeExpenseMonthRef,
    // so this callback never needs to be recreated on month change.
    [],
  );

  const loadHolderOptionSettings = useCallback(async () => {
    const options = await getHolderOptions();
    setHolderOptions(options);
    setHolderDraftRows(createHolderDraftRows(options));
    return options;
  }, []);

  const holderSelectOptions = useMemo(
    () => holderOptions.map((holder) => ({ value: holder, label: holder })),
    [holderOptions],
  );

  const expensePayerOptions = useMemo(
    () => [
      ...holderSelectOptions,
      { label: "共同帳戶", value: "共同帳戶" },
    ],
    [holderSelectOptions],
  );

  // Shared by the full form and the mobile quick sheet: write, remember the
  // payer / kind / category for the next new entry, then refresh + resync in
  // the background (the write itself already reached the cloud).
  const saveExpenseEntry = useCallback(
    async (payload) => {
      await upsertExpenseEntry(payload);
      if (!payload.id) {
        writeLastExpenseDefaults({
          payer: payload.payer || null,
          expenseKind: payload.expenseKind || null,
          categoryId: payload.categoryId || null,
        });
      }
      loadExpenseData()
        .then(() => performCloudSync())
        .catch((error) => {
          console.warn("[expense] post-save refresh failed", error);
        });
    },
    [loadExpenseData, performCloudSync],
  );

  const handleSubmitExpense = useCallback(async () => {
    try {
      const values = await expenseForm.validateFields();
      setLoadingExpenseAction(true);
      const isRecurringCreateMode =
        expenseFormMode === "recurring-create" && !editingExpenseEntry;
      await saveExpenseEntry({
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
      setIsExpenseModalOpen(false);
      setIsExpenseSheetOpen(false);
      setEditingExpenseEntry(null);
      setExpenseFormMode("normal");
      expenseForm.resetFields();
      message.success("支出已儲存");
    } catch (error) {
      if (error?.errorFields) return;
      message.error(toUserMessage(error, "儲存支出失敗"));
    } finally {
      setLoadingExpenseAction(false);
    }
  }, [
    editingExpenseEntry,
    expenseForm,
    expenseFormMode,
    message,
    saveExpenseEntry,
  ]);

  const handleSubmitCategory = useCallback(async () => {
    try {
      const values = await categoryForm.validateFields();
      setLoadingCategoryAction(true);
      await upsertExpenseCategory({
        id: editingCategory?.id,
        name: values.name,
        icon: values.icon ?? null,
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
      message.error(toUserMessage(error, "儲存分類失敗"));
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

  // Create a category from inside the expense form's category dropdown and
  // select it, so a missing category doesn't force a trip to 設定.
  const handleInlineAddCategory = useCallback(async () => {
    const name = inlineCategoryName.trim();
    if (!name) return;
    try {
      setLoadingInlineCategory(true);
      const { id } = await upsertExpenseCategory({ name });
      await loadExpenseData();
      expenseForm.setFieldsValue({ categoryId: id });
      setInlineCategoryName("");
      message.success(`已新增分類「${name}」`);
    } catch (error) {
      message.error(toUserMessage(error, "新增分類失敗"));
    } finally {
      setLoadingInlineCategory(false);
    }
  }, [expenseForm, inlineCategoryName, loadExpenseData, message]);

  const expenseNameQuery = Form.useWatch("name", expenseForm);
  const expenseNameOptions = useMemo(() => {
    const categoryNames = new Map(
      expenseCategoryRows.map((item) => [item.id, item.name]),
    );
    return filterNameSuggestions(expenseNameSuggestions, expenseNameQuery)
      .filter((item) => item.name !== String(expenseNameQuery || "").trim())
      .map((item) => {
        const meta = [
          categoryNames.get(item.categoryId),
          item.amountTwd ? formatTwd(item.amountTwd) : null,
        ].filter(Boolean);
        return {
          value: item.name,
          label: (
            <div className="expense-name-option">
              <span>{item.name}</span>
              {meta.length > 0 && (
                <span className="expense-name-option-meta">
                  {meta.join(" · ")}
                </span>
              )}
            </div>
          ),
        };
      });
  }, [expenseCategoryRows, expenseNameQuery, expenseNameSuggestions]);

  // Picking a past name on a new entry prefills that entry's settings (only
  // the ones whose options still exist); the amount only fills an empty field.
  const handleSelectExpenseName = useCallback(
    (name) => {
      if (editingExpenseEntry) return;
      const template = expenseNameSuggestions.find((item) => item.name === name);
      if (!template) return;
      const updates = {};
      if (expenseCategoryRows.some((item) => item.id === template.categoryId)) {
        updates.categoryId = template.categoryId;
      }
      if (expensePayerOptions.some((item) => item.value === template.payer)) {
        updates.payer = template.payer;
      }
      if (template.expenseKind) {
        updates.expenseKind = template.expenseKind;
      }
      if (selectableBudgetOptions.some((item) => item.id === template.budgetId)) {
        updates.budgetId = template.budgetId;
      }
      if (!expenseForm.getFieldValue("amountTwd") && template.amountTwd) {
        updates.amountTwd = template.amountTwd;
      }
      expenseForm.setFieldsValue(updates);
      if (updates.payer || updates.expenseKind || updates.budgetId) {
        setShowExpenseMoreFields(true);
      }
    },
    [
      editingExpenseEntry,
      expenseCategoryRows,
      expenseForm,
      expenseNameSuggestions,
      expensePayerOptions,
      selectableBudgetOptions,
    ],
  );

  const quickExpenseCategories = useMemo(
    () => pickQuickCategories(expenseCategoryRows, categoryUsageOrder),
    [categoryUsageOrder, expenseCategoryRows],
  );

  // What the expense forms can currently select; links to anything else
  // (deleted category, removed payer, ended budget) are dropped on use.
  const expenseOptionLookups = useMemo(
    () => ({
      categoryIds: new Set(expenseCategoryRows.map((item) => item.id)),
      payers: new Set(expensePayerOptions.map((item) => item.value)),
      budgetIds: new Set(selectableBudgetOptions.map((item) => item.id)),
    }),
    [expenseCategoryRows, expensePayerOptions, selectableBudgetOptions],
  );

  const quickExpenseSuggestions = useMemo(
    () => sanitizeSuggestions(expenseNameSuggestions, expenseOptionLookups),
    [expenseNameSuggestions, expenseOptionLookups],
  );

  const expenseCategoryNameById = useMemo(
    () => new Map(expenseCategoryRows.map((item) => [item.id, item.name])),
    [expenseCategoryRows],
  );

  const expenseCategoryIconById = useMemo(
    () => new Map(expenseCategoryRows.map((item) => [item.id, item.icon ?? null])),
    [expenseCategoryRows],
  );

  const usableExpenseTemplates = useMemo(
    () => sanitizeSuggestions(expenseTemplateRows, expenseOptionLookups),
    [expenseOptionLookups, expenseTemplateRows],
  );

  // Fills the full form from a 常用支出 chip: fields the template sets are
  // filled, an amount already typed survives a template without one, and
  // fields the previous chip filled are reverted rather than mixed in.
  const handleApplyExpenseTemplate = useCallback(
    (template) => {
      if (isWriteDisabled) return;
      const { updates, state } = applyTemplateToFormValues(
        expenseForm.getFieldsValue([
          "categoryId",
          "payer",
          "expenseKind",
          "budgetId",
          "amountTwd",
        ]),
        template,
        appliedTemplateStateRef.current,
      );
      appliedTemplateStateRef.current = state;
      expenseForm.setFieldsValue(updates);
      if (updates.payer || updates.expenseKind || updates.budgetId) {
        setShowExpenseMoreFields(true);
      }
    },
    [expenseForm, isWriteDisabled],
  );

  const handleSubmitQuickExpense = useCallback(
    async (payload) => {
      try {
        setLoadingExpenseAction(true);
        await saveExpenseEntry(payload);
        setIsQuickExpenseOpen(false);
        message.success(
          `已記錄 ${payload.name} ${formatTwd(payload.amountTwd)}`,
        );
      } catch (error) {
        message.error(toUserMessage(error, "儲存支出失敗"));
        // Rethrow so the sheet unlocks its save key for a retry.
        throw error;
      } finally {
        setLoadingExpenseAction(false);
      }
    },
    [message, saveExpenseEntry],
  );

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
      message.error(toUserMessage(error, "儲存預算失敗"));
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
    setEditingHoldingHolder(record.holder ?? null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingHoldingId(null);
    setEditingShares(null);
    setEditingHoldingTag(null);
    setEditingHoldingHolder(null);
  }, []);

  const handleCashEditClick = useCallback((record) => {
    setEditingCashAccountId(record.id);
    setEditingCashBalance(record.balanceTwd);
    setEditingCashHolder(record.holder ?? null);
  }, []);

  const handleCashCancelEdit = useCallback(() => {
    setEditingCashAccountId(null);
    setEditingCashBalance(null);
    setEditingCashHolder(null);
  }, []);

  const handleSaveShares = useCallback(
    async (record) => {
      const parsedShares = Number(editingShares);
      if (!Number.isFinite(parsedShares) || parsedShares <= 0) {
        message.error("股數必須大於 0");
        return;
      }

      try {
        setRowLoading(record.id, true);
        if ((editingHoldingHolder ?? null) !== (record.holder ?? null)) {
          await updateHoldingHolder({
            id: record.id,
            holder: editingHoldingHolder ?? null,
          });
        }
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
        setEditingHoldingHolder(null);
        message.success("持股已更新");
      } catch (error) {
        message.error(toUserMessage(error, "更新股數失敗"));
      } finally {
        setRowLoading(record.id, false);
      }
    },
    [
      editingHoldingTag,
      editingHoldingHolder,
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
          setEditingHoldingHolder(null);
        }
        message.success("持股已移除");
      } catch (error) {
        message.error(toUserMessage(error, "移除持股失敗"));
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
        message.error("餘額不可為負數");
        return;
      }

      try {
        setCashRowLoading(record.id, true);
        if ((editingCashHolder ?? null) !== (record.holder ?? null)) {
          await updateCashAccountHolder({
            id: record.id,
            holder: editingCashHolder ?? null,
          });
        }
        await updateCashAccountBalance({
          id: record.id,
          balanceTwd: parsedBalance,
        });
        await loadAllData();
        await performCloudSync();
        setEditingCashAccountId(null);
        setEditingCashBalance(null);
        setEditingCashHolder(null);
        message.success("銀行帳戶已更新");
      } catch (error) {
        message.error(toUserMessage(error, "更新餘額失敗"));
      } finally {
        setCashRowLoading(record.id, false);
      }
    },
    [
      editingCashBalance,
      editingCashHolder,
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
          setEditingCashHolder(null);
        }
        message.success("銀行帳戶已移除");
      } catch (error) {
        message.error(
          toUserMessage(error, "移除銀行帳戶失敗"),
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

  const openQuickExpense = useCallback(() => {
    const lastUsed = readLastExpenseDefaults();
    setQuickExpenseDefaults({
      payer: expensePayerOptions.some((item) => item.value === lastUsed.payer)
        ? lastUsed.payer
        : null,
      expenseKind: lastUsed.expenseKind ?? null,
    });
    setQuickExpenseKey((key) => key + 1);
    setIsQuickExpenseOpen(true);
  }, [expensePayerOptions]);

  const handleQuickExpenseFullForm = useCallback(
    (draft) => {
      pendingExpenseDraftRef.current = draft;
      setIsQuickExpenseOpen(false);
      openExpenseForm();
    },
    [openExpenseForm],
  );

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
        await removeExpenseEntry({ id: record.id });
        await loadExpenseData();
        await performCloudSync();
        message.success("支出已刪除");
      } catch (error) {
        message.error(toUserMessage(error, "刪除支出失敗"));
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
    const effectiveKeepToday = shouldShowStopOptions ? stopKeepToday : false;

    setStoppingRecurringById((prev) => ({ ...prev, [targetId]: true }));
    try {
      await stopRecurringExpense({
        id: targetId,
        keepToday: effectiveKeepToday,
      });
      await loadExpenseData();
      await performCloudSync();
      message.success("定期支出已取消");
      setIsStopRecurringModalOpen(false);
      setSelectedRecurringToStop(null);
      setStopKeepToday(true);
    } catch (error) {
      message.error(
        toUserMessage(error, "取消定期支出失敗"),
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
    shouldShowStopOptions,
    stopKeepToday,
  ]);

  const handleToggleCategoryQuickPick = useCallback(
    async (record, isQuickPick) => {
      try {
        setQuickPickLoadingId(record.id);
        await setExpenseCategoryQuickPick({ id: record.id, isQuickPick });
        await loadExpenseData();
        performCloudSync().catch(() => {});
      } catch (error) {
        message.error(toUserMessage(error, "更新分類失敗"));
      } finally {
        setQuickPickLoadingId(null);
      }
    },
    [loadExpenseData, message, performCloudSync],
  );

  const handleRemoveCategory = useCallback(
    async (record) => {
      try {
        setLoadingCategoryAction(true);
        await removeExpenseCategory({ id: record.id });
        await loadExpenseData();
        await performCloudSync();
        message.success("分類已刪除");
      } catch (error) {
        message.error(toUserMessage(error, "刪除分類失敗"));
      } finally {
        setLoadingCategoryAction(false);
      }
    },
    [loadExpenseData, message, performCloudSync],
  );

  const refreshExpenseDataInBackground = useCallback(() => {
    loadExpenseData()
      .then(() => performCloudSync())
      .catch((error) => {
        console.warn("[expense] background refresh failed", error);
      });
  }, [loadExpenseData, performCloudSync]);

  const openTemplateForm = useCallback(
    (record = null) => {
      // Edit with the sanitized copy so a stale link shows as empty, not as a
      // raw id the selects can't label; the form flags those fields.
      const usable = record
        ? usableExpenseTemplates.find((item) => item.id === record.id)
        : null;
      setEditingTemplate(
        usable
          ? {
              ...usable,
              staleFields: [
                ...(record.missingLinks ?? []),
                record.payer && !usable.payer ? "payer" : null,
                record.budgetId && !usable.budgetId ? "budgetId" : null,
              ].filter(Boolean),
            }
          : null,
      );
      setTemplateFormKey((key) => key + 1);
      setIsTemplateFormOpen(true);
    },
    [usableExpenseTemplates],
  );

  const closeTemplateForm = useCallback(() => {
    setIsTemplateFormOpen(false);
    setEditingTemplate(null);
  }, []);

  const handleSubmitTemplate = useCallback(
    async (values) => {
      try {
        setLoadingTemplateAction(true);
        await upsertExpenseTemplate({ id: editingTemplate?.id, ...values });
        // Saved: close now so a failing refresh can't invite a second save.
        setIsTemplateFormOpen(false);
        setEditingTemplate(null);
        message.success(editingTemplate ? "常用支出已更新" : "已新增常用支出");
        refreshExpenseDataInBackground();
      } catch (error) {
        message.error(toUserMessage(error, "儲存常用支出失敗"));
      } finally {
        setLoadingTemplateAction(false);
      }
    },
    [editingTemplate, message, refreshExpenseDataInBackground],
  );

  const handleRemoveTemplate = useCallback(
    async (record) => {
      try {
        setLoadingTemplateAction(true);
        await removeExpenseTemplate({ id: record.id });
        message.success("常用支出已刪除");
        refreshExpenseDataInBackground();
      } catch (error) {
        message.error(toUserMessage(error, "刪除常用支出失敗"));
      } finally {
        setLoadingTemplateAction(false);
      }
    },
    [message, refreshExpenseDataInBackground],
  );

  const templateDragDisabled = isWriteDisabled || loadingTemplateReorder;

  const handleTemplateDragEnd = useCallback(
    async ({ active, over }) => {
      if (templateDragDisabled || !over || active.id === over.id) return;
      const previous = expenseTemplateRows;
      const oldIndex = previous.findIndex((row) => row.id === active.id);
      const newIndex = previous.findIndex((row) => row.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const reordered = arrayMove(previous, oldIndex, newIndex);
      // Optimistic: show the new order right away, roll back on failure.
      setExpenseTemplateRows(reordered);
      templateReorderInFlightRef.current = true;
      try {
        setLoadingTemplateReorder(true);
        await reorderExpenseTemplates(reordered.map((row) => row.id));
      } catch (error) {
        setExpenseTemplateRows(previous);
        message.error(toUserMessage(error, "常用支出排序更新失敗"));
      } finally {
        templateReorderInFlightRef.current = false;
        setLoadingTemplateReorder(false);
      }
      refreshExpenseDataInBackground();
    },
    [
      expenseTemplateRows,
      message,
      refreshExpenseDataInBackground,
      templateDragDisabled,
    ],
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
        message.error(toUserMessage(error, "刪除預算失敗"));
      } finally {
        setLoadingBudgetAction(false);
      }
    },
    [loadExpenseData, message, performCloudSync],
  );

  const filteredRows = useMemo(() => {
    return filterRowsByHolderTab(rows, activeHoldingTab);
  }, [activeHoldingTab, rows]);

  const stockDetail = useMemo(
    () => (stockDetailId === null ? null : buildStockDetailHolding(rows, stockDetailId)),
    [rows, stockDetailId],
  );

  const handleExportHoldingsCsv = useCallback(() => {
    if (rows.length === 0) {
      return;
    }
    downloadTextFile(
      `\uFEFF${createHoldingsCsvContent(rows)}`,
      `my-stock-holdings-${dayjs().format("YYYYMMDD-HHmmss")}.csv`,
      "text/csv;charset=utf-8;",
    );
  }, [rows]);

  const handleExportCashCsv = useCallback(() => {
    downloadTextFile(
      `\uFEFF${createCashCsvContent(cashRows)}`,
      `my-stock-cash-${dayjs().format("YYYYMMDD-HHmmss")}.csv`,
      "text/csv;charset=utf-8;",
    );
  }, [cashRows]);

  const handleExportExpensesCsv = useCallback(async () => {
    try {
      const backup = await exportBackupData();
      const categoryNameById = new Map(
        backup.expenseCategories.map((item) => [item.id, item.name]),
      );
      const budgetNameById = new Map(
        backup.budgets.map((item) => [item.id, item.name]),
      );
      downloadTextFile(
        `\uFEFF${createExpensesCsvContent(backup.expenseEntries, {
          categoryNameById,
          budgetNameById,
        })}`,
        `my-stock-expenses-${dayjs().format("YYYYMMDD-HHmmss")}.csv`,
        "text/csv;charset=utf-8;",
      );
    } catch (error) {
      message.error(toUserMessage(error, "匯出支出失敗"));
    }
  }, [message]);

  const handleExportBackupJson = useCallback(async () => {
    try {
      const backup = await exportBackupData();
      downloadTextFile(
        JSON.stringify(backup, null, 2),
        `my-stock-backup-${dayjs().format("YYYYMMDD-HHmmss")}.json`,
        "application/json",
      );
    } catch (error) {
      message.error(toUserMessage(error, "匯出備份失敗"));
    }
  }, [message]);

  useEffect(() => {
    activeHoldingTabRef.current = activeHoldingTab;
  }, [activeHoldingTab]);


  const holdingHolderTabItems = useMemo(() => {
    const items = [{ key: HOLDER_TAB_ALL, label: `全部 (${rows.length})` }];
    for (const holder of holderOptions) {
      const count = rows.filter((row) => row.holder === holder).length;
      items.push({
        key: getHolderTabKey(holder),
        label: `${holder} (${count})`,
      });
    }
    const unsetCount = rows.filter(
      (row) => row.holderName === "未設定" || !row.holder,
    ).length;
    if (unsetCount > 0) {
      items.push({ key: HOLDER_TAB_UNSET, label: `未設定 (${unsetCount})` });
    }
    return items;
  }, [holderOptions, rows]);

  // Mobile: holdings grouped by holder (replacing the holder tabs), each
  // with its count and total value.
  const holdingGroups = useMemo(
    () =>
      groupHoldingsByHolder(rows, holderOptions).map((group) => ({
        key: group.key,
        title: `${group.label} · ${group.count} 檔`,
        total: formatTwd(group.totalTwd),
        rows: group.rows,
      })),
    [holderOptions, rows],
  );

  // Mobile: cash accounts grouped by holder (replacing the holder tabs),
  // each with its count and total balance.
  const cashGroups = useMemo(
    () =>
      groupHoldingsByHolder(cashRows, holderOptions, {
        valueKey: "balanceTwd",
      }).map((group) => ({
        key: group.key,
        title: `${group.label} · ${group.count} 個帳戶`,
        total: formatTwd(group.totalTwd),
        rows: group.rows,
      })),
    [cashRows, holderOptions],
  );

  const filteredCashRows = useMemo(() => {
    return filterRowsByHolderTab(cashRows, activeCashHolderTab);
  }, [activeCashHolderTab, cashRows]);

  const cashHolderTabItems = useMemo(() => {
    const items = [
      { key: HOLDER_TAB_ALL, label: `全部 (${cashRows.length})` },
    ];
    for (const holder of holderOptions) {
      const count = cashRows.filter((row) => row.holder === holder).length;
      items.push({
        key: getHolderTabKey(holder),
        label: `${holder} (${count})`,
      });
    }
    const unsetCount = cashRows.filter(
      (row) => row.holderName === "未設定" || !row.holder,
    ).length;
    if (unsetCount > 0) {
      items.push({ key: HOLDER_TAB_UNSET, label: `未設定 (${unsetCount})` });
    }
    return items;
  }, [cashRows, holderOptions]);

  useEffect(() => {
    if (!holdingHolderTabItems.some((item) => item.key === activeHoldingTab)) {
      setActiveHoldingTab(HOLDER_TAB_ALL);
    }
  }, [activeHoldingTab, holdingHolderTabItems]);

  useEffect(() => {
    if (
      !cashHolderTabItems.some((item) => item.key === activeCashHolderTab)
    ) {
      setActiveCashHolderTab(HOLDER_TAB_ALL);
    }
  }, [activeCashHolderTab, cashHolderTabItems]);

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
      { name: "台股", key: "TW", value: result.TW, color: CHART_PALETTE[0] },
      { name: "美股", key: "US", value: result.US, color: CHART_PALETTE[1] },
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
      { name: "個股", key: "STOCK", value: result.STOCK, color: CHART_PALETTE[0] },
      { name: "ETF", key: "ETF", value: result.ETF, color: CHART_PALETTE[1] },
      { name: "債券", key: "BOND", value: result.BOND, color: CHART_PALETTE[2] },
      { name: "現金", key: "CASH", value: result.CASH, color: CHART_NEUTRAL },
    ].filter((item) => item.value > 0);
  }, [cashRows, rows]);

  // 資產分析 rows: each chart with a one-line headline; the chart itself
  // opens in a modal (same pattern as 支出分析).
  const assetChartRows = useMemo(() => {
    // No figure for the trend: its first point is a snapshot from the start
    // of the range, not yesterday's close, so a 「近 24 小時 ▼ $X」 would
    // disagree with the hero's 今日 change right above it.
    const trendSummary =
      trend.length >= 2
        ? "總資產在 24 小時、一週、一個月內的變化"
        : "尚無走勢資料";
    return [
      { key: "trend", title: "現值走勢", icon: GraphUp, summary: trendSummary },
      {
        key: "assetType",
        title: "資產類型",
        icon: PercentageCircle,
        summary: describeAllocation(assetTypeAllocation) || "尚無資料",
      },
      {
        key: "market",
        title: "台股 / 美股",
        icon: Globe,
        summary: describeAllocation(marketAllocation) || "尚無資料",
      },
    ];
  }, [assetTypeAllocation, marketAllocation, trend]);
  const activeAssetChart = assetChartRows.find(
    (row) => row.key === activeAssetChartKey,
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
        title: "標的",
        key: "target",
        render: (_, record) => (
          <div>
            <div className="holding-main-text">
              {record.companyName || record.symbol}
            </div>
            <Text type="secondary" className="holding-subline">
              {record.symbol} · {record.market === "TW" ? "台股" : "美股"}
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
              inputMode={record.market === "US" ? "decimal" : "numeric"}
              min={record.market === "US" ? 0.0001 : 1}
              step={1}
              precision={record.market === "US" ? 4 : 0}
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
          return (
            <Tag bordered={false}>{label}</Tag>
          );
        },
      },
      {
        title: "持有人",
        dataIndex: "holder",
        key: "holder",
        width: 120,
        render: (value, record) => {
          if (editingHoldingId === record.id) {
            return (
              <Select
                size="small"
                value={editingHoldingHolder ?? value ?? undefined}
                options={holderSelectOptions}
                placeholder="請選擇"
                onChange={(next) => setEditingHoldingHolder(next)}
                style={{ width: 110 }}
              />
            );
          }

          const holderName = record.holderName || "未設定";
          return (
            <Tag
              bordered={false}
              style={
                holderName === "未設定" ? undefined : getHolderTagStyle(holderName)
              }
            >
              {holderName}
            </Tag>
          );
        },
      },
      {
        title: "操作",
        key: "actions",
        fixed: isMobileViewport ? undefined : "right",
        width: isMobileViewport ? undefined : 190,
        align: "left",
        render: (_, record) => {
          const rowLoading = Boolean(loadingActionById[record.id]);
          const isEditing = editingHoldingId === record.id;

          if (isEditing) {
            return (
              <Space>
              <Button
                  type="primary"
                  size="small"
                  loading={rowLoading}
                  disabled={isWriteDisabled}
                  onClick={() => handleSaveShares(record)}
                >
                  儲存
                </Button>
                <Button
                  size="small"
                  disabled={rowLoading || isWriteDisabled}
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
                type="text"
                className="row-action"
                size="small"
                disabled={isWriteDisabled || editingHoldingId !== null}
                loading={rowLoading}
                onClick={() => handleEditClick(record)}
                icon={<EditPencil />}
                aria-label="編輯股數"
              ></Button>
              <Popconfirm
                title="移除此持股？"
                description="會一併刪除該持股的所有快照資料。"
                okText="刪除"
                cancelText="取消"
                onConfirm={() => handleRemoveHolding(record)}
                okButtonProps={{ danger: true, loading: rowLoading }}
                disabled={isWriteDisabled || editingHoldingId !== null}
              >
                <Button
                  type="text"
                  className="row-action row-action--danger"
                  size="small"
                  disabled={
                    isWriteDisabled ||
                    editingHoldingId !== null ||
                    rowLoading
                  }
                  icon={<Trash />}
                  aria-label="移除持股"
                ></Button>
              </Popconfirm>
            </Space>
          );
        },
      },
    ];

    if (!isMobileViewport) {
      return columns;
    }

    // Mobile: three short lines a side so nothing wraps. Left: name + 分類,
    // 代號 · 股數, 股價 + its % change. Right: 現值 + its change (amount and
    // %). Holder and market are left out to keep the row light.
    const byKey = Object.fromEntries(
      columns.map((column) => [column.key, column]),
    );
    const animatedOr = (record, key) => {
      const animated = rowAnimationValues[record.id]?.[key];
      return typeof animated === "number" && Number.isFinite(animated)
        ? animated
        : record[key];
    };
    const renderCompactDelta = (record, delta, text) => {
      if (
        !record.hasPreviousSnapshot ||
        typeof delta !== "number" ||
        Number.isNaN(delta)
      ) {
        return <span className="cell-delta cell-delta--flat">--</span>;
      }
      if (delta === 0) {
        return <span className="cell-delta cell-delta--flat">0.00%</span>;
      }
      return (
        <span className={getDeltaClassName(delta)}>
          {delta > 0 ? "▲ " : "▼ "}
          {text}
        </span>
      );
    };
    const tagLabel = (record) =>
      holdingTagOptions.find((item) => item.value === record.assetTag)?.label ||
      record.assetTagLabel ||
      record.assetTag ||
      "個股";
    // One column: the row slides to reveal 編輯 / 移除 (no drag handle and no
    // action buttons on mobile). The editor replaces the row while editing.
    return [
      {
        key: "row",
        render: (_, record) => {
          if (editingHoldingId === record.id) {
            return (
              <div className="mobile-swipe-row mobile-swipe-row--editing">
              <div className="holding-mobile-editor">
                <label>
                  <span>股數</span>
                  {byKey.shares.render(record.shares, record)}
                </label>
                <label>
                  <span>分類</span>
                  {byKey.assetTag.render(record.assetTag, record)}
                </label>
                <label>
                  <span>持有人</span>
                  {byKey.holder.render(record.holder, record)}
                </label>
                {/* 儲存 / 取消 live here while editing: the fixed-width
                    actions column is too narrow for text buttons. */}
                <div className="holding-mobile-editor-actions">
                  {byKey.actions.render(null, record)}
                </div>
              </div>
              </div>
            );
          }
          const name = record.companyName || record.symbol;
          const rowBusy = Boolean(loadingActionById[record.id]);
          const pct = record.priceChangePct;
          const todayText =
            typeof pct !== "number" || !record.hasPreviousSnapshot
              ? ""
              : pct === 0
                ? "，今日持平"
                : `，今日${pct > 0 ? "漲" : "跌"} ${Math.abs(pct).toFixed(2)}%`;
          return (
            <MobileSwipeRow
              onTap={() => setStockDetailId(record.id)}
              label={`${name}，市值 ${formatTwd(record.latestValueTwd)}${todayText}，查看個股`}
              disabled={isWriteDisabled || editingHoldingId !== null || rowBusy}
              actions={[
                swipeEditAction(name, () => handleEditClick(record)),
                swipeDeleteAction(
                  name,
                  () =>
                    confirmDestructive({
                      title: "移除此持股？",
                      content: "會一併刪除該持股的所有快照資料。",
                      okText: "移除",
                      onOk: () => handleRemoveHolding(record),
                    }),
                  "移除",
                ),
              ]}
              main={
            <div className="holding-mobile-target">
              <div className="holding-mobile-name">
                <span className="holding-main-text">
                  {record.companyName || record.symbol}
                </span>
                {/* Only non-default kinds (ETF, 債券): a 個股 tag on nearly
                    every row said nothing. */}
                {(record.assetTag || "STOCK") !== "STOCK" && (
                  <Tag variant="filled" className="holding-mobile-kind">
                    {tagLabel(record)}
                  </Tag>
                )}
              </div>
              <Text type="secondary" className="holding-mobile-line">
                {record.symbol} ·{" "}
                {Number(record.shares).toLocaleString("zh-TW", {
                  maximumFractionDigits: 4,
                })}{" "}
                股
              </Text>
              <div className="holding-mobile-line">
                {/* Per-share price; no 股價 label, which made US / 4-digit
                    prices truncate on a 390px screen. */}
                <Text type="secondary">
                  {formatPrice(
                    animatedOr(record, "latestPrice"),
                    record.latestCurrency || "TWD",
                  )}
                </Text>{" "}
                {renderCompactDelta(
                  record,
                  record.priceChange,
                  // The arrow already gives the direction; no sign needed.
                  typeof record.priceChangePct === "number"
                    ? `${Math.abs(record.priceChangePct).toFixed(2)}%`
                    : "--",
                )}
              </div>
            </div>
              }
              side={
          <div className="holding-mobile-value">
            <div className="holding-mobile-value-main">
              {formatTwd(animatedOr(record, "latestValueTwd"))}
            </div>
            <div className="holding-mobile-line">
              {/* Today's change in TWD only: the % is on the left, and the
                  arrow already gives the direction (no minus sign). */}
              {renderCompactDelta(
                record,
                record.valueChangeTwd,
                typeof record.valueChangeTwd === "number"
                  ? formatTwd(Math.abs(record.valueChangeTwd))
                  : "--",
              )}
            </div>
          </div>
              }
            />
          );
        },
      },
    ];
  }, [
      confirmDestructive,
      getDeltaClassName,
      getHolderTagStyle,
      isWriteDisabled,
      editingHoldingId,
    editingHoldingTag,
    editingHoldingHolder,
    editingShares,
    handleCancelEdit,
    handleEditClick,
    handleRemoveHolding,
    renderPriceDelta,
    handleSaveShares,
    holderSelectOptions,
    holdingTagOptions,
    isMobileViewport,
    loadingActionById,
    rowAnimationValues,
    renderValueDelta,
  ]);

  const cashTableColumns = useMemo(() => {
    const columns = [
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
              inputMode="numeric"
              min={0}
              step={1000}
              precision={0}
              value={editingCashBalance ?? value}
              onChange={(next) => setEditingCashBalance(next)}
              style={{ width: 160, maxWidth: "100%" }}
            />
          );
        },
      },
      {
        title: "持有人",
        dataIndex: "holder",
        key: "holder",
        width: "18%",
        render: (value, record) => {
          if (editingCashAccountId === record.id) {
            return (
              <Select
                size="small"
                value={editingCashHolder ?? value ?? undefined}
                options={holderSelectOptions}
                allowClear
                placeholder="未設定"
                onChange={(next) => setEditingCashHolder(next ?? null)}
                style={{ width: 110 }}
              />
            );
          }
          const holderName = record.holderName || "未設定";
          return (
            <Tag
              bordered={false}
              style={
                holderName === "未設定" ? undefined : getHolderTagStyle(holderName)
              }
            >
              {holderName}
            </Tag>
          );
        },
      },
      {
        title: "更新時間",
        dataIndex: "updatedAt",
        key: "updatedAt",
        width: "20%",
        render: (value) => formatDateTime(value),
      },
      {
        title: "操作",
        key: "actions",
        width: "22%",
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
                  disabled={isWriteDisabled}
                  onClick={() => handleSaveCashBalance(record)}
                >
                  儲存
                </Button>
                <Button
                  size="small"
                  disabled={rowLoading || isWriteDisabled}
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
                type="text"
                className="row-action"
                size="small"
                loading={rowLoading}
                disabled={isWriteDisabled || rowLoading}
                onClick={() => handleCashEditClick(record)}
                icon={<EditPencil />}
                aria-label="編輯現金餘額"
              />
              <Popconfirm
                title="移除此銀行帳戶？"
                description="刪除後不會再列入總現值。"
                okText="刪除"
                cancelText="取消"
                onConfirm={() => handleRemoveCashAccount(record)}
                okButtonProps={{ danger: true, loading: rowLoading }}
                disabled={isWriteDisabled}
              >
                <Button
                  type="text"
                  className="row-action row-action--danger"
                  size="small"
                  disabled={isWriteDisabled || rowLoading}
                  icon={<Trash />}
                  aria-label="移除銀行帳戶"
                />
              </Popconfirm>
            </Space>
          );
        },
      },
    ];

    if (!isMobileViewport) {
      return columns;
    }

    // Mobile: one column; the row slides to reveal 編輯 / 移除. While editing,
    // the inline editor (holder, balance, 儲存 / 取消) replaces the row.
    const byKey = Object.fromEntries(
      columns.map((column) => [column.key, column]),
    );
    return [
      {
        key: "row",
        render: (_, record) => {
          const balance = byKey.balanceTwd.render(record.balanceTwd, record);
          if (editingCashAccountId === record.id) {
            return (
              <div className="mobile-swipe-row mobile-swipe-row--editing">
                <div>
                  {byKey.account.render(null, record)}
                  <div className="holding-mobile-tags">
                    {byKey.holder.render(record.holder, record)}
                  </div>
                </div>
                {balance}
                <div className="holding-mobile-editor-actions">
                  {byKey.actions.render(null, record)}
                </div>
              </div>
            );
          }
          const name = record.accountAlias || record.bankName || "帳戶";
          // Just the memo: rows are already grouped under their holder.
          const meta = [record.accountAlias].filter(Boolean);
          // The family's own name for the account (薪轉戶, 房貸) leads; the
          // bank is the detail underneath.
          const bankText = record.bankCode
            ? `${record.bankName} (${record.bankCode})`
            : record.bankName;
          const main = (
            <div>
              <div className="holding-main-text">
                {meta.length > 0 ? meta.join(" · ") : bankText}
              </div>
              {meta.length > 0 && (
                <Text type="secondary" className="holding-subline">
                  {bankText}
                </Text>
              )}
            </div>
          );
          return (
            <MobileSwipeRow
              disabled={
                isWriteDisabled || Boolean(loadingCashActionById[record.id])
              }
              actions={[
                swipeEditAction(name, () => handleCashEditClick(record)),
                swipeDeleteAction(
                  name,
                  () =>
                    confirmDestructive({
                      title: "移除此銀行帳戶？",
                      content: "刪除後不會再列入總現值。",
                      okText: "移除",
                      onOk: () => handleRemoveCashAccount(record),
                    }),
                  "移除",
                ),
              ]}
              main={main}
              side={balance}
            />
          );
        },
      },
    ];
  }, [
      confirmDestructive,
      getHolderTagStyle,
      editingCashAccountId,
      editingCashBalance,
      editingCashHolder,
      handleCashCancelEdit,
      handleCashEditClick,
      handleRemoveCashAccount,
      handleSaveCashBalance,
      holderSelectOptions,
      isMobileViewport,
      isWriteDisabled,
      loadingCashActionById,
  ]);

  // Mobile expense rows: 編輯 / 刪除, or 編輯規則 for rows a recurring rule
  // generated.
  const getExpenseSwipeActions = useCallback(
    (record) =>
      record.isRecurringOccurrence
        ? [
            swipeEditAction(
              record.name,
              () => openRecurringEditForm(record),
              "編輯規則",
            ),
          ]
        : [
            swipeEditAction(record.name, () => openExpenseForm(record)),
            swipeDeleteAction(record.name, () =>
              confirmDestructive({
                title: "刪除這筆支出？",
                onOk: () => handleRemoveExpense(record),
              }),
            ),
          ],
    [
      confirmDestructive,
      handleRemoveExpense,
      openExpenseForm,
      openRecurringEditForm,
    ],
  );

  const expenseTableColumns = useMemo(() => {
    const isUnset = (value) => !value || value === "未指定";
    const getExpenseMeta = (record) =>
      [record.payerName, record.expenseKindName].filter(
        (value) => !isUnset(value),
      );
    const renderOptionalTag = (value) =>
      isUnset(value) ? (
        <Text type="secondary">—</Text>
      ) : (
        <Tag bordered={false}>{value}</Tag>
      );
    // 🔁 固定 for rows generated by a recurring rule, plus 預計 while the
    // charge is still ahead this month (not counted in the month total).
    const renderRecurringTags = (record) =>
      record.isRecurringOccurrence ? (
        <span className="expense-recurring-tags">
          <Tag variant="filled" className="expense-recurring-tag" icon={<Repeat />}>
            固定
          </Tag>
          {record.isUpcoming && (
            <Tag variant="filled" className="expense-upcoming-tag" icon={<Clock />}>
              預計
            </Tag>
          )}
        </span>
      ) : null;
    // Upcoming rows already carry a 預計 tag next to the name.
    const formatRowDate = (record) => formatDate(record.occurredAt);
    const renderEditRuleButton = (record) => (
      <HoverTooltip title="編輯定期規則">
        <Button
          type="text"
          className="row-action"
          size="small"
          icon={<EditPencil />}
          disabled={isWriteDisabled}
          onClick={() => openRecurringEditForm(record)}
          aria-label={`編輯定期規則 ${record.name}`}
        />
      </HoverTooltip>
    );

    const columns = [
      {
        title: "名稱",
        dataIndex: "name",
        key: "name",
        render: (_, record) => {
          const meta = getExpenseMeta(record);
          return (
            <div>
              <div className="holding-main-text">
                {record.name}
                {renderRecurringTags(record)}
              </div>
              {meta.length > 0 && (
                <Text type="secondary" className="holding-subline">
                  {meta.join(" · ")}
                </Text>
              )}
            </div>
          );
        },
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
        render: (_, record) => formatRowDate(record),
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
        render: (value) => renderOptionalTag(value),
      },
      {
        title: "預算",
        dataIndex: "budgetName",
        key: "budgetName",
        render: (value) => renderOptionalTag(value),
      },
      {
        title: "操作",
        key: "actions",
        render: (_, record) => {
          if (record.isRecurringOccurrence) {
            return renderEditRuleButton(record);
          }
          return (
            <Space>
              <Button
                type="text"
                className="row-action"
                size="small"
                icon={<EditPencil />}
                disabled={isWriteDisabled}
                onClick={() => openExpenseForm(record)}
                aria-label="編輯支出"
              />
              <Popconfirm
                title="刪除這筆支出？"
                onConfirm={() => handleRemoveExpense(record)}
                okText="刪除"
                cancelText="取消"
                disabled={isWriteDisabled}
              >
                <Button
                  type="text"
                  className="row-action row-action--danger"
                  size="small"
                  disabled={isWriteDisabled}
                  icon={<Trash />}
                  aria-label="刪除支出"
                />
              </Popconfirm>
            </Space>
          );
        },
      },
    ];

    // Mobile renders ExpenseDayList instead of this table.
    return columns;
  }, [
    handleRemoveExpense,
    isWriteDisabled,
    openExpenseForm,
    openRecurringEditForm,
  ]);

  const expenseCategoryColumns = useMemo(
    () => [
      {
        title: "分類名稱",
        dataIndex: "name",
        key: "name",
        render: (value, record) => (
          <span className="category-list-name">
            <CategoryIcon name={value} icon={record.icon} />
            <span>{value}</span>
          </span>
        ),
      },
      {
        title: (
          <Tooltip title="開啟後，新增支出時會以快速按鈕顯示此分類；全部未開啟時自動顯示最常用的 6 個">
            <span>快速選取</span>
          </Tooltip>
        ),
        dataIndex: "isQuickPick",
        key: "isQuickPick",
        render: (value, record) => (
          <Switch
            size="small"
            checked={Boolean(value)}
            loading={quickPickLoadingId === record.id}
            disabled={isWriteDisabled}
            aria-label={`${record.name} 快速選取`}
            onChange={(checked) => handleToggleCategoryQuickPick(record, checked)}
          />
        ),
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
              type="text"
              className="row-action"
              size="small"
              icon={<EditPencil />}
              disabled={isWriteDisabled}
              onClick={() => openCategoryForm(record)}
            />
            <Popconfirm
              title="刪除此分類？"
              onConfirm={() => handleRemoveCategory(record)}
              okText="刪除"
              cancelText="取消"
              disabled={isWriteDisabled}
            >
              <Button
                type="text"
                className="row-action row-action--danger"
                size="small"
                disabled={isWriteDisabled}
                icon={<Trash />}
              />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [
      handleRemoveCategory,
      handleToggleCategoryQuickPick,
      isWriteDisabled,
      openCategoryForm,
      quickPickLoadingId,
    ],
  );

  const expenseTemplateColumns = useMemo(() => {
    const categoryNames = new Map(
      expenseCategoryRows.map((item) => [item.id, item.name]),
    );
    const renderTemplateName = (record) => {
      const meta = [
        categoryNames.get(record.categoryId),
        record.amountTwd ? formatTwd(record.amountTwd) : "金額不固定",
      ]
        .filter(Boolean)
        .join(" · ");
      return (
        <div className="expense-template-cell">
          <span>{record.name}</span>
          <Text type="secondary" className="expense-template-meta">
            {meta}
          </Text>
        </div>
      );
    };
    if (isMobileViewport) {
      // Mobile: no drag handle; the row slides to reveal 編輯 / 刪除.
      return [
        {
          key: "row",
          render: (_, record) => (
            <MobileSwipeRow
              disabled={isWriteDisabled}
              actions={[
                swipeEditAction(record.name, () => openTemplateForm(record)),
                swipeDeleteAction(record.name, () =>
                  confirmDestructive({
                    title: "刪除此常用支出？",
                    onOk: () => handleRemoveTemplate(record),
                  }),
                ),
              ]}
              main={renderTemplateName(record)}
            />
          ),
        },
      ];
    }
    return [
      {
        key: "sort",
        width: 44,
        render: () => <DragHandle disabled={templateDragDisabled} />,
      },
      {
        title: "名稱",
        dataIndex: "name",
        key: "name",
        render: (_, record) => renderTemplateName(record),
      },
      {
        title: "操作",
        key: "actions",
        width: 96,
        render: (_, record) => (
          <Space>
            <Button
              type="text"
              className="row-action"
              size="small"
              icon={<EditPencil />}
              aria-label={`編輯 ${record.name}`}
              disabled={isWriteDisabled}
              onClick={() => openTemplateForm(record)}
            />
            <Popconfirm
              title="刪除此常用支出？"
              onConfirm={() => handleRemoveTemplate(record)}
              okText="刪除"
              cancelText="取消"
              disabled={isWriteDisabled}
            >
              <Button
                type="text"
                className="row-action row-action--danger"
                size="small"
                aria-label={`刪除 ${record.name}`}
                disabled={isWriteDisabled}
                icon={<Trash />}
              />
            </Popconfirm>
          </Space>
        ),
      },
    ];
  }, [
    confirmDestructive,
    expenseCategoryRows,
    handleRemoveTemplate,
    isMobileViewport,
    isWriteDisabled,
    openTemplateForm,
    templateDragDisabled,
  ]);

  // Rows behind the category tabs and the list. On mobile, this month's
  // upcoming recurring charges sit in 本月預計 above the list instead.
  const expenseListRows = useMemo(
    () =>
      isMobileViewport
        ? expenseRows.filter((row) => !row.isUpcoming)
        : expenseRows,
    [expenseRows, isMobileViewport],
  );

  const expenseCategoryTabItems = useMemo(() => {
    const counters = new Map();
    let uncategorizedCount = 0;

    for (const row of expenseListRows) {
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
      { key: "all", label: `全部 (${expenseListRows.length})` },
      ...categoryItems,
    ];
  }, [expenseListRows]);

  const filteredExpenseRowsByCategory = useMemo(() => {
    if (activeExpenseCategoryTab === "all") {
      return expenseListRows;
    }
    if (activeExpenseCategoryTab === "uncategorized") {
      return expenseListRows.filter((row) => {
        const rawName =
          typeof row?.categoryName === "string" ? row.categoryName.trim() : "";
        return !rawName || rawName === "未指定";
      });
    }
    if (activeExpenseCategoryTab.startsWith("cat:")) {
      const targetCategory = activeExpenseCategoryTab.slice(4);
      return expenseListRows.filter((row) => row?.categoryName === targetCategory);
    }
    return expenseListRows;
  }, [activeExpenseCategoryTab, expenseListRows]);

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
          type="text"
          className="row-action"
          size="small"
          icon={<EditPencil />}
          disabled={isWriteDisabled}
          onClick={() => openBudgetForm(record)}
        />
        <Popconfirm
          title="刪除此預算？"
          onConfirm={() => handleRemoveBudget(record)}
          okText="刪除"
          cancelText="取消"
          disabled={isWriteDisabled}
        >
          <Button
            type="text"
            className="row-action row-action--danger"
            size="small"
            disabled={isWriteDisabled}
            icon={<Trash />}
          />
        </Popconfirm>
      </Space>
    ),
    [handleRemoveBudget, isWriteDisabled, openBudgetForm],
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
          return <Tag bordered={false}>{formatBudgetCycleLabel(value)}</Tag>;
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
                strokeColor={spentTwd > availableTwd ? COLORS.down : undefined}
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

  // Mobile lists have no header row, so these fold each value into a
  // labelled line ("快速選取", "月度 · 分配 30%") instead of bare columns.
  const expenseCategoryMobileColumns = useMemo(() => {
    const byKey = Object.fromEntries(
      expenseCategoryColumns.map((column) => [column.key, column]),
    );
    return [
      {
        key: "row",
        render: (_, record) => (
          <MobileSwipeRow
            disabled={isWriteDisabled}
            actions={[
              swipeEditAction(record.name, () => openCategoryForm(record)),
              swipeDeleteAction(record.name, () =>
                confirmDestructive({
                  title: "刪除此分類？",
                  onOk: () => handleRemoveCategory(record),
                }),
              ),
            ]}
            main={
              <span className="category-list-name">
                <CategoryIcon name={record.name} icon={record.icon} />
                <span className="holding-main-text">{record.name}</span>
              </span>
            }
            side={
              <span className="mobile-inline-field">
                <Text type="secondary" className="mobile-inline-label">
                  快速選取
                </Text>
                {byKey.isQuickPick.render(record.isQuickPick, record)}
              </span>
            }
          />
        ),
      },
    ];
  }, [
    confirmDestructive,
    expenseCategoryColumns,
    handleRemoveCategory,
    isWriteDisabled,
    openCategoryForm,
  ]);

  const residentBudgetMobileColumns = useMemo(
    () => [
      {
        key: "name",
        render: (_, record) => {
          const percent = Number(record.residentPercent);
          return (
            <MobileSwipeRow
              disabled={isWriteDisabled}
              actions={[
                swipeEditAction(record.name, () => openBudgetForm(record)),
                swipeDeleteAction(record.name, () =>
                  confirmDestructive({
                    title: "刪除此預算？",
                    onOk: () => handleRemoveBudget(record),
                  }),
                ),
              ]}
              main={
            <div>
              <div className="holding-main-text">{record.name}</div>
              <Text type="secondary" className="holding-subline">
                {formatBudgetCycleLabel(record.budgetType)} ·{" "}
                {Number.isFinite(percent) && percent > 0
                  ? `分配 ${percent}%`
                  : "分配比例待設定"}
              </Text>
            </div>
              }
            />
          );
        },
      },
    ],
    [
      confirmDestructive,
      handleRemoveBudget,
      isWriteDisabled,
      openBudgetForm,
    ],
  );

  const specialBudgetMobileColumns = useMemo(
    () => [
      {
        key: "name",
        render: (_, record) => {
          const availableTwd = Number(record.availableTwd || 0);
          const spentTwd = Number(record.spentTwd || 0);
          const dates =
            record.specialStartDate && record.specialEndDate
              ? `${formatDate(record.specialStartDate)} ~ ${formatDate(record.specialEndDate)}`
              : "日期未設定";
          return (
            <MobileSwipeRow
              disabled={isWriteDisabled}
              actions={[
                swipeEditAction(record.name, () => openBudgetForm(record)),
                swipeDeleteAction(record.name, () =>
                  confirmDestructive({
                    title: "刪除此預算？",
                    onOk: () => handleRemoveBudget(record),
                  }),
                ),
              ]}
              main={
            <div>
              <div className="holding-main-text">{record.name}</div>
              <Text type="secondary" className="holding-subline">
                {formatTwd(Number(record.specialAmountTwd) || 0)} · {dates}
              </Text>
              <Progress
                percent={Math.round(Number(record.progressPct || 0))}
                size="small"
                strokeColor={spentTwd > availableTwd ? COLORS.down : undefined}
              />
              <Text type="secondary" className="holding-subline">
                已花 {formatTwd(spentTwd)} / {formatTwd(availableTwd)}
              </Text>
            </div>
              }
            />
          );
        },
      },
    ],
    [
      confirmDestructive,
      handleRemoveBudget,
      isWriteDisabled,
      openBudgetForm,
    ],
  );

  const TemplateDraggableRow = useCallback(
    (props) => <SortableRow {...props} disabled={templateDragDisabled} />,
    [templateDragDisabled],
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
        setCloudReadOnly(true);
        setCloudReadOnlyReason("請先登入後再修改資料。");
        setAuthReady(true);
        return;
      }

      // Re-enter the loading phase for every sign-in (not just the initial
      // remembered session), so logging out and back in also shows the
      // loading view until the first sync completes. authReady is set true
      // again in the finally below.
      setAuthReady(false);

      try {
        setCloudSyncStatus("syncing");
        setCloudSyncError("");
        initialSyncInFlightRef.current = true;
        try {
          await initSync(user.uid);
        } finally {
          initialSyncInFlightRef.current = false;
        }
        await Promise.all([
          loadAllData(),
          loadExpenseData(),
          loadHolderOptionSettings(),
        ]);
        const repairResult = await repairNumericFields();
        if (repairResult.updatedRows > 0) {
          console.info(
            `[Numeric Repair] repaired rows: ${repairResult.updatedRows}`,
          );
        }
        refreshCloudRuntime();
        await performCloudSync();
        await Promise.all([
          loadAllData(),
          loadExpenseData(),
          loadHolderOptionSettings(),
        ]);
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
          toUserMessage(error, "同步初始化失敗"),
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
  }, [
    loadAllData,
    loadExpenseData,
    loadHolderOptionSettings,
    performCloudSync,
    refreshCloudRuntime,
  ]);

  useEffect(() => {
    const bootstrap = async () => {
      setLoadingData(true);
      try {
        await Promise.all([
          loadAllData(),
          loadExpenseData(),
          loadHolderOptionSettings(),
        ]);
      } catch (error) {
        message.error(toUserMessage(error, "載入資料失敗"));
      } finally {
        setLoadingData(false);
      }
    };

    bootstrap();
  }, [loadAllData, loadExpenseData, loadHolderOptionSettings, message]);

  useEffect(() => {
    // Each collection the listeners apply fires this event, so a burst of
    // them folds into one trailing reload. During the initial sync they're
    // skipped outright: the sign-in flow reloads everything once it's done.
    const reloadFromCloud = coalesceAsync(async () => {
      await Promise.all([
        loadAllData(),
        templateReorderInFlightRef.current ? null : loadExpenseData(),
        loadHolderOptionSettings(),
      ]);
      refreshCloudRuntime();
      setCloudLastSyncedAt(new Date().toISOString());
    });
    const onCloudUpdated = async () => {
      if (initialSyncInFlightRef.current) {
        return;
      }
      try {
        await reloadFromCloud();
      } catch {
        // Keep UI stable; runtime state will surface errors.
      }
    };

    window.addEventListener(CLOUD_SYNC_UPDATED_EVENT, onCloudUpdated);
    return () => {
      window.removeEventListener(CLOUD_SYNC_UPDATED_EVENT, onCloudUpdated);
    };
  }, [loadAllData, loadExpenseData, loadHolderOptionSettings, refreshCloudRuntime]);

  useEffect(
    () =>
      onPwaNeedRefresh(() => {
        notification.info({
          key: "pwa-update",
          title: "有新版本可以使用",
          description: "更新會重新載入頁面，請先儲存正在編輯的內容。",
          duration: 0,
          // Top, not bottom: at the bottom it covers the tab bar and the FAB,
          // and it stays until dismissed.
          placement: "top",
          actions: (
            <Button
              type="primary"
              size="small"
              icon={<Refresh />}
              onClick={applyPwaUpdate}
            >
              立即更新
            </Button>
          ),
        });
      }),
    [notification],
  );

  // 配套 2: once the app is ready, if today's prices haven't been fetched yet,
  // auto-refresh once so the user doesn't have to press "更新價格". Skips when
  // offline; on failure it degrades gracefully (stale data + freshness label).
  useEffect(() => {
    if (!authReady || !authUser || !priceDataStale) {
      return;
    }
    if (autoRefreshAttemptedRef.current || cloudSyncStatus === "offline") {
      return;
    }
    autoRefreshAttemptedRef.current = true;
    (async () => {
      try {
        setLoadingRefresh(true);
        const result = await refreshPrices({ market: "ALL" });
        shouldAnimateNumbersRef.current = true;
        await loadAllData();
        await performCloudSync();
        const failedSymbols = (result.failed ?? []).map((item) => item.symbol);
        if (failedSymbols.length > 0) {
          setAutoRefreshIssue(`${failedSymbols.join("、")} 自動抓價失敗`);
        }
      } catch (error) {
        // Keep stale data visible, but tell the user and offer a retry.
        console.warn("[autoRefresh] failed", error);
        setAutoRefreshIssue("自動更新報價失敗");
      } finally {
        setLoadingRefresh(false);
      }
    })();
  }, [
    authReady,
    authUser,
    priceDataStale,
    cloudSyncStatus,
    loadAllData,
    performCloudSync,
  ]);

  useEffect(() => {
    const onResize = () => {
      const isMobile = window.innerWidth <= 768;
      setIsMobileViewport(isMobile);
      // The quick sheet is mobile-only; don't let it reappear with stale
      // input when the window narrows again.
      if (!isMobile) setIsQuickExpenseOpen(false);
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
    },
    [stopNumberAnimations],
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
    loadHolderOptionSettings().catch(() => {
      // Keep built-in default options.
    });
  }, [loadHolderOptionSettings]);

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
        console.warn("[bankDirectory] load failed", error);
        message.warning("銀行名單載入失敗，仍可手動輸入銀行名稱");
      } finally {
        setLoadingBankOptions(false);
      }
    };

    loadBankOptions();
  }, [isAddCashModalOpen, isAddCashSheetOpen, loadingBankOptions, message]);

  useEffect(() => {
    if (!activeExpenseMonth) return;
    loadExpenseData(activeExpenseMonth).catch(() => {});
  }, [activeExpenseMonth, loadExpenseData]);

  // Read (not depended on) by the populate effect below, so a background list
  // refresh doesn't reset a form the user is filling in.
  const expenseFormOptionsRef = useRef({ categoryRows: [], payerOptions: [] });
  expenseFormOptionsRef.current = {
    categoryRows: expenseCategoryRows,
    payerOptions: expensePayerOptions,
  };

  useEffect(() => {
    if (!isExpenseModalOpen && !isExpenseSheetOpen) {
      return;
    }
    const isRecurringCreateMode =
      expenseFormMode === "recurring-create" && !editingExpenseEntry;
    // New entries start from the last-used payer / kind / category, as long
    // as those options still exist.
    const lastUsed = editingExpenseEntry ? {} : readLastExpenseDefaults();
    const { categoryRows, payerOptions } = expenseFormOptionsRef.current;
    if (!categoryRows.some((item) => item.id === lastUsed.categoryId)) {
      delete lastUsed.categoryId;
    }
    if (!payerOptions.some((item) => item.value === lastUsed.payer)) {
      delete lastUsed.payer;
    }
    const draft = editingExpenseEntry ? null : pendingExpenseDraftRef.current;
    pendingExpenseDraftRef.current = null;
    appliedTemplateStateRef.current = null;
    const payer =
      editingExpenseEntry?.payer === "共同"
        ? "共同帳戶"
        : (editingExpenseEntry?.payer ?? lastUsed.payer ?? undefined);
    const expenseKind =
      editingExpenseEntry?.expenseKind ?? lastUsed.expenseKind ?? undefined;
    const values = {
      name: editingExpenseEntry?.name ?? "",
      payer,
      expenseKind,
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
      categoryId:
        editingExpenseEntry?.categoryId ?? lastUsed.categoryId ?? undefined,
      budgetId: editingExpenseEntry?.budgetId ?? undefined,
    };
    if (draft) {
      // Coming from the quick sheet: its values win over the remembered
      // defaults; fields it left empty keep them.
      Object.entries(draft).forEach(([field, value]) => {
        if (value === undefined || value === "") return;
        values[field] = field === "occurredAt" ? dayjs(value) : value;
      });
    }
    setShowExpenseMoreFields(
      Boolean(values.budgetId || values.payer || values.expenseKind),
    );
    expenseForm.setFieldsValue(values);
    if (!editingExpenseEntry) {
      // Modal/Drawer move focus to their container on open, which beats the
      // input's autoFocus; focus the amount once the open animation settles.
      const focusTimer = window.setTimeout(() => {
        expenseForm.getFieldInstance("amountTwd")?.focus?.();
      }, 350);
      return () => window.clearTimeout(focusTimer);
    }
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
      icon: editingCategory?.icon ?? null,
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

  const expenseEmptyState = (
    <EmptyState icon={Journal} description="這段期間沒有支出紀錄">
      <Button
        type="primary"
        icon={<Plus />}
        onClick={() => openExpenseForm()}
        disabled={isWriteDisabled}
      >
        記一筆支出
      </Button>
    </EmptyState>
  );

  const goToIncomeSettings = () => {
    setActiveMainTab("settings");
    // Wait for the settings tab to render before scrolling to the card.
    window.requestAnimationFrame(() => {
      document
        .getElementById("income-settings")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  // The rate behind every US row's TWD value (from the newest US snapshot).
  const usdTwdRate = useMemo(() => {
    const latestUsRow = rows
      .filter((row) => row.market === "US" && Number.isFinite(row.fxRateToTwd))
      .sort((a, b) =>
        String(b.latestCapturedAt ?? "").localeCompare(
          String(a.latestCapturedAt ?? ""),
        ),
      )[0];
    return latestUsRow?.fxRateToTwd ?? null;
  }, [rows]);

  const openAddHoldingForm = () => {
    if (isMobileViewport) {
      setIsAddHoldingSheetOpen(true);
    } else {
      setIsAddHoldingModalOpen(true);
    }
  };

  const holdingsEmptyState = (
    <EmptyState
      icon={CandlestickChart}
      description={
        activeHoldingTab === HOLDER_TAB_ALL ? "還沒有持股" : "這位持有人還沒有持股"
      }
    >
      <Button
        type="primary"
        icon={<Plus />}
        onClick={openAddHoldingForm}
        disabled={isWriteDisabled}
      >
        新增第一檔持股
      </Button>
    </EmptyState>
  );

  const handleAddHolding = async (values) => {
    let upsertResult;

    try {
      setLoadingAddHolding(true);
      upsertResult = await upsertHolding(values);
    } catch (error) {
      message.error(toUserMessage(error, "新增持股失敗"));
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
        `持股已儲存，但抓價失敗，可稍後按「更新價格」補抓：${toUserMessage(error, "未知錯誤")}`,
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
      setAutoRefreshIssue(null);
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
      const failedSymbols = (result.failed ?? []).map((item) => item.symbol);
      if (failedSymbols.length > 0) {
        message.warning(
          `已更新 ${updatedLabel}，以下抓價失敗：${failedSymbols.join("、")}。可稍後再試。`,
          6,
        );
        return;
      }
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
      message.error(toUserMessage(error, "更新價格失敗"));
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
        holder: values.holder ?? null,
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
        toUserMessage(error, "新增銀行帳戶失敗"),
      );
      return false;
    } finally {
      setLoadingAddCashAccount(false);
    }
  };

  const cloudSyncText = useMemo(() => {
    if (!authUser) {
      return "未登入";
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
    return `上次與雲端同步：${formatDateTime(cloudLastSyncedAt)}`;
  }, [authUser, cloudLastSyncedAt]);

  const priceUpdatedRelativeText = useMemo(() => {
    if (!lastUpdatedAt) {
      return "尚未更新";
    }

    return formatRelativeTime(lastUpdatedAt, nowTick);
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

  const handleGoogleLogin = useCallback(async () => {
    try {
      setLoadingAuthAction(true);
      await loginWithGoogle();
    } catch (error) {
      message.error(toUserMessage(error, "Google 登入失敗"));
    } finally {
      setLoadingAuthAction(false);
    }
  }, [message]);

  const handleGoogleLoginFromAuthDialog = useCallback(async () => {
    try {
      await handleGoogleLogin();
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
      emailLoginForm.resetFields();
      message.success("Email 登入成功");
    } catch (error) {
      if (error?.errorFields) {
        return;
      }
      message.error(toUserMessage(error, "Email 登入失敗"));
    } finally {
      setLoadingEmailLogin(false);
    }
  }, [emailLoginForm, message]);

  const handleGoogleLogout = async () => {
    try {
      setLoadingAuthAction(true);
      await logoutGoogle();
      message.success("已登出");
    } catch (error) {
      message.error(toUserMessage(error, "登出失敗"));
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
      message.success("資料已重新整理");
    } catch (error) {
      message.error(toUserMessage(error, "重新整理失敗"));
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
      // Sheets render inside <Content> but are portalled to <body>; their
      // touches bubble here while the body is pinned at scrollY 0, which
      // would pull the page behind the sheet down.
      if (isFromPortal(event) || window.scrollY > 0) {
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
      disabled={isWriteDisabled}
      initialValues={{ entryType: "ONE_TIME", occurredAt: dayjs() }}
      autoComplete={isMobileViewport ? "off" : undefined}
      data-lpignore={isMobileViewport ? "true" : undefined}
    >
      {editingExpenseEntry?.entryType === "RECURRING" && (
        <Alert
          type="info"
          showIcon
          className="expense-recurring-edit-alert"
          title="這是定期支出規則"
          description="修改會套用到這條規則產生的所有紀錄，包含過去的月份。若只想從現在起改變，請先停止這條，再新增一條。"
        />
      )}
      {!editingExpenseEntry && usableExpenseTemplates.length > 0 && (
        <Form.Item label="常用支出">
          <div className="expense-quick-chips" role="group" aria-label="常用支出">
            {usableExpenseTemplates.map((item) => (
              <Tag.CheckableTag
                key={item.id}
                checked={false}
                onChange={() => handleApplyExpenseTemplate(item)}
              >
                {item.name}
                {item.amountTwd ? ` · ${formatTwd(item.amountTwd)}` : ""}
              </Tag.CheckableTag>
            ))}
          </div>
        </Form.Item>
      )}
      <Form.Item
        label="支出金額 (TWD)"
        name="amountTwd"
        rules={[{ required: true, message: "請輸入支出金額" }]}
      >
        <InputNumber
          min={1}
          step={100}
          precision={0}
          inputMode="numeric"
          prefix="$"
          style={{ width: "100%" }}
        />
      </Form.Item>
      <Form.Item
        label="支出名稱"
        name="name"
        rules={[{ required: true, message: "請輸入支出名稱" }]}
      >
        <AutoComplete
          options={expenseNameOptions}
          onSelect={handleSelectExpenseName}
          // The Input child already shows the name; without this antd 6
          // renders the selected option's rich label beside it.
          labelRender={() => ""}
          getPopupContainer={getSheetPopupContainer}
        >
          <Input
            autoComplete={isMobileViewport ? "new-password" : undefined}
            autoCorrect={isMobileViewport ? "off" : undefined}
            autoCapitalize={isMobileViewport ? "none" : undefined}
            spellCheck={isMobileViewport ? false : undefined}
            data-lpignore={isMobileViewport ? "true" : undefined}
          />
        </AutoComplete>
      </Form.Item>
      <Form.Item
        noStyle
        shouldUpdate={(prev, next) =>
          [
            "entryType",
            "recurrenceType",
            "monthlyDay",
            "yearlyMonth",
            "yearlyDay",
            "occurredAt",
          ].some((field) => prev[field] !== next[field])
        }
      >
        {({ getFieldsValue }) => {
          const scheduleValues = getFieldsValue([
            "entryType",
            "recurrenceType",
            "monthlyDay",
            "yearlyMonth",
            "yearlyDay",
            "occurredAt",
          ]);
          const isRecurring = scheduleValues.entryType === "RECURRING";
          // For recurring entries this date is when the schedule starts, not
          // an expense of its own (see describeRecurrenceStart).
          return (
            <Form.Item
              label={isRecurring ? "開始日期" : "支出日期"}
              extra={describeRecurrenceStart(scheduleValues)}
              required
            >
              <Form.Item
                noStyle
                shouldUpdate={(prev, next) => prev.occurredAt !== next.occurredAt}
              >
                {({ getFieldValue, setFieldValue }) => {
                  const current = getFieldValue("occurredAt");
                  return (
                    <div className="expense-quick-chips">
                      {["今天", "昨天", "前天"].map((label, daysAgo) => {
                        const day = dayjs().subtract(daysAgo, "day");
                        return (
                          <Tag.CheckableTag
                            key={label}
                            checked={Boolean(current?.isSame?.(day, "day"))}
                            onChange={() => {
                              if (!isWriteDisabled) setFieldValue("occurredAt", day);
                            }}
                          >
                            {label}
                          </Tag.CheckableTag>
                        );
                      })}
                    </div>
                  );
                }}
              </Form.Item>
              <Form.Item
                noStyle
                name="occurredAt"
                rules={[
                  {
                    required: true,
                    message: isRecurring ? "請選擇開始日期" : "請選擇支出日期",
                  },
                ]}
              >
                <DatePicker
                  format="YYYY/MM/DD"
                  style={{ width: "100%" }}
                  getPopupContainer={getSheetPopupContainer}
                />
              </Form.Item>
            </Form.Item>
          );
        }}
      </Form.Item>
      <Form.Item label="分類">
        {quickExpenseCategories.length > 0 && (
          <Form.Item
            noStyle
            shouldUpdate={(prev, next) => prev.categoryId !== next.categoryId}
          >
            {({ getFieldValue, setFieldValue }) => {
              const current = getFieldValue("categoryId");
              return (
                <div className="expense-quick-chips">
                  {quickExpenseCategories.map((item) => (
                    <Tag.CheckableTag
                      key={item.id}
                      checked={current === item.id}
                      onChange={(checked) => {
                        if (isWriteDisabled) return;
                        setFieldValue("categoryId", checked ? item.id : undefined);
                      }}
                    >
                      {item.name}
                    </Tag.CheckableTag>
                  ))}
                </div>
              );
            }}
          </Form.Item>
        )}
        <Form.Item noStyle name="categoryId">
          <Select
            placeholder={quickExpenseCategories.length ? "其他分類" : undefined}
            allowClear
            getPopupContainer={getSheetPopupContainer}
            options={expenseCategoryRows.map((item) => ({
              label: item.name,
              value: item.id,
            }))}
            popupRender={(menu) => (
              <>
                {menu}
                <Divider style={{ margin: "8px 0" }} />
                <Space.Compact style={{ width: "100%", padding: "0 8px 4px" }}>
                  <Input
                    placeholder="新增分類"
                    value={inlineCategoryName}
                    onChange={(event) => setInlineCategoryName(event.target.value)}
                    onKeyDown={(event) => {
                      // Keep Select from treating Enter/Space as option picks.
                      event.stopPropagation();
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleInlineAddCategory();
                      }
                    }}
                  />
                  <Button
                    icon={<Plus />}
                    loading={loadingInlineCategory}
                    disabled={!inlineCategoryName.trim()}
                    onClick={handleInlineAddCategory}
                  >
                    新增
                  </Button>
                </Space.Compact>
              </>
            )}
          />
        </Form.Item>
      </Form.Item>
      <Form.Item
        label="單筆 / 定期"
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
                  <InputNumber inputMode="numeric" min={1} max={31} style={{ width: "100%" }} />
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
                    <InputNumber inputMode="numeric" min={1} max={12} style={{ width: "100%" }} />
                  </Form.Item>
                  <Form.Item
                    label="每年幾號"
                    name="yearlyDay"
                    rules={[{ required: true, message: "請輸入日期" }]}
                    style={{ flex: 1 }}
                  >
                    <InputNumber inputMode="numeric" min={1} max={31} style={{ width: "100%" }} />
                  </Form.Item>
                </Space>
              ) : null}
            </>
          );
        }}
      </Form.Item>
      {!showExpenseMoreFields && (
        <Button
          type="link"
          icon={<NavArrowDown />}
          onClick={() => setShowExpenseMoreFields(true)}
          style={{ paddingInline: 0, marginBottom: 8 }}
        >
          更多選項（支出人、家庭 / 個人、預算）
        </Button>
      )}
      <Form.Item label="支出人" name="payer" hidden={!showExpenseMoreFields}>
        <Select
          allowClear
          getPopupContainer={getSheetPopupContainer}
          options={expensePayerOptions}
        />
      </Form.Item>
      <Form.Item
        label="家庭 / 個人"
        name="expenseKind"
        hidden={!showExpenseMoreFields}
      >
        <Select
          allowClear
          getPopupContainer={getSheetPopupContainer}
          options={[
            { label: "家庭", value: "家庭" },
            { label: "個人", value: "個人" },
          ]}
        />
      </Form.Item>
      <Form.Item label="預算" name="budgetId" hidden={!showExpenseMoreFields}>
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

  const expenseRowClassName = (record) =>
    record.isUpcoming ? "expense-row--upcoming" : "";

  const expenseTemplateTable = (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleTemplateDragEnd}
    >
      <SortableContext
        items={expenseTemplateRows.map((row) => row.id)}
        strategy={verticalListSortingStrategy}
      >
        <Table
          rowKey="id"
          className={`expense-template-table${
            isMobileViewport ? " mobile-swipe-table" : ""
          }`}
          dataSource={expenseTemplateRows}
          columns={expenseTemplateColumns}
          pagination={false}
          showHeader={false}
          loading={loadingTemplateReorder}
          locale={{ emptyText: "尚無常用支出，按 + 新增" }}
          components={
            isMobileViewport ? undefined : { body: { row: TemplateDraggableRow } }
          }
        />
      </SortableContext>
    </DndContext>
  );

  const expenseTemplateFormNode = (
    <ExpenseTemplateForm
      key={templateFormKey}
      formId={TEMPLATE_FORM_ID}
      onSubmit={handleSubmitTemplate}
      initialValues={editingTemplate}
      categoryOptions={expenseCategoryRows.map((item) => ({
        label: item.name,
        value: item.id,
      }))}
      payerOptions={expensePayerOptions}
      budgetOptions={selectableBudgetOptions.map((item) => ({
        label: item.name,
        value: item.id,
      }))}
      historySuggestions={quickExpenseSuggestions}
      staleFields={editingTemplate?.staleFields ?? []}
      popupContainer={getSheetPopupContainer}
      disabled={isWriteDisabled}
    />
  );

  const categoryFormNode = (
    <Form
      form={categoryForm}
      name={isMobileViewport ? "category_mobile_form" : "category_form"}
      layout="vertical"
      disabled={isWriteDisabled}
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
      <Form.Item label="圖示" name="icon">
        <CategoryIconPicker name={watchedCategoryName} />
      </Form.Item>
    </Form>
  );

  const budgetFormNode = (
    <Form
      form={budgetForm}
      name={isMobileViewport ? "budget_mobile_form" : "budget_form"}
      layout="vertical"
      disabled={isWriteDisabled}
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
                    inputMode="numeric"
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
                    format="YYYY/MM/DD"
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
                    format="YYYY/MM/DD"
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
                <InputNumber
                  inputMode="decimal"
                  min={0.01}
                  step={1}
                  precision={2}
                  style={{ width: "100%" }}
                />
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
          icon={<Google />}
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

  const activeBudgetCards = useMemo(
    () =>
      (budgetRows || []).filter(
        (budget) => Boolean(budget?.isConfigured) && Boolean(budget?.isActive),
      ),
    [budgetRows],
  );

  const budgetDetail = useMemo(
    () => activeBudgetCards.find((budget) => budget.id === budgetDetailId) ?? null,
    [activeBudgetCards, budgetDetailId],
  );

  const getBudgetSwipeActions = useCallback(
    (budget) => [
      swipeEditAction(budget.name, () => openBudgetForm(budget)),
      swipeDeleteAction(budget.name, () =>
        confirmDestructive({
          title: "刪除此預算？",
          onOk: () => handleRemoveBudget(budget),
        }),
      ),
    ],
    [confirmDestructive, handleRemoveBudget, openBudgetForm],
  );

  // Adds a month's own income, or replaces it if the month already has one.
  // Resolves to whether it saved.
  const saveIncomeOverride = useCallback(
    async ({ month, incomeTwd }) => {
      const incomeValue = Number(incomeTwd);
      if (!Number.isFinite(incomeValue) || incomeValue <= 0) {
        message.error("請輸入有效的覆寫收入金額");
        return false;
      }
      try {
        setLoadingIncomeSettings(true);
        setExpensePlayKey((key) => key + 1);
        await setIncomeOverride({ month, incomeTwd: incomeValue });
        await loadExpenseData();
        await performCloudSync();
        message.success("月份收入已儲存");
        return true;
      } catch (error) {
        message.error(
          toUserMessage(error, "儲存月份收入失敗"),
        );
        return false;
      } finally {
        setLoadingIncomeSettings(false);
      }
    },
    [loadExpenseData, message, performCloudSync],
  );

  const handleAddIncomeOverride = useCallback(async () => {
    const saved = await saveIncomeOverride({
      month: dayjs(newIncomeOverrideMonth).format("YYYY-MM"),
      incomeTwd: newIncomeOverrideValue,
    });
    if (saved) setNewIncomeOverrideValue(null);
  }, [newIncomeOverrideMonth, newIncomeOverrideValue, saveIncomeOverride]);

  const handleRemoveIncomeOverride = useCallback(
    async (month) => {
      try {
        setLoadingIncomeSettings(true);
        setExpensePlayKey((key) => key + 1);
        await removeIncomeOverride({ month });
        await loadExpenseData();
        await performCloudSync();
        message.success("月份收入覆寫已刪除");
      } catch (error) {
        message.error(
          toUserMessage(error, "刪除月份收入覆寫失敗"),
        );
      } finally {
        setLoadingIncomeSettings(false);
      }
    },
    [loadExpenseData, message, performCloudSync],
  );

  // The mobile sheet passes its own draft; the desktop card saves the field
  // it edits in place.
  const handleSaveIncomeSettings = useCallback(
    async (nextDefaultMonthlyIncomeTwd = defaultMonthlyIncomeTwd) => {
      try {
        setLoadingIncomeSettings(true);
        setExpensePlayKey((key) => key + 1);
        await saveIncomeSettings({
          defaultMonthlyIncomeTwd: nextDefaultMonthlyIncomeTwd,
          monthOverrides: incomeMonthOverrides,
        });
        await loadExpenseData();
        await performCloudSync();
        message.success("收入設定已儲存");
        return true;
      } catch (error) {
        message.error(
          toUserMessage(error, "儲存收入設定失敗"),
        );
        return false;
      } finally {
        setLoadingIncomeSettings(false);
      }
    },
    [
      defaultMonthlyIncomeTwd,
      incomeMonthOverrides,
      loadExpenseData,
      message,
      performCloudSync,
    ],
  );

  const handleHolderDraftValueChange = useCallback((id, value) => {
    setHolderDraftRows((current) =>
      current.map((row) => (row.id === id ? { ...row, value } : row)),
    );
  }, []);

  const handleAddHolderDraftRow = useCallback(() => {
    setHolderDraftRows((current) => [...current, createHolderDraftRow("")]);
  }, []);

  const handleRemoveHolderDraftRow = useCallback((id) => {
    setHolderDraftRows((current) => current.filter((row) => row.id !== id));
  }, []);

  const hasHolderSettingChanges = useMemo(() => {
    const normalizedDraftValues = holderDraftRows.map((row) => row.value.trim());
    if (normalizedDraftValues.length !== holderOptions.length) {
      return true;
    }
    return normalizedDraftValues.some((value, index) => value !== holderOptions[index]);
  }, [holderDraftRows, holderOptions]);

  const handleSaveHolderSettings = useCallback(async () => {
    const trimmedRows = holderDraftRows.map((row) => ({
      ...row,
      value: row.value.trim(),
      originalValue: row.originalValue.trim(),
    }));
    const nextOptions = trimmedRows.map((row) => row.value);
    const renameMap = {};
    const representedOriginals = new Set();

    for (const row of trimmedRows) {
      if (row.originalValue) {
        representedOriginals.add(row.originalValue);
      }
      if (row.originalValue && row.value && row.originalValue !== row.value) {
        renameMap[row.originalValue] = row.value;
      }
    }

    const removedHolders = holderOptions.filter(
      (holder) =>
        !representedOriginals.has(holder) && !nextOptions.includes(holder),
    );

    try {
      if (removedHolders.length > 0) {
        const usageSummary = await getHolderUsageSummary({
          holders: removedHolders,
        });
        const hasAffectedRecords = usageSummary.some(
          (item) => item.totalAffected > 0,
        );

        if (hasAffectedRecords) {
          const confirmed = await new Promise((resolve) => {
            Modal.confirm({
              title: "移除持有人後，相關資料會改成未設定",
              content: (
                <Space direction="vertical" size={8}>
                  {usageSummary
                    .filter((item) => item.totalAffected > 0)
                    .map((item) => (
                      <Text key={item.holder}>
                        {`${item.holder}：持股 ${item.holdingCount} 筆、現金帳戶 ${item.cashAccountCount} 筆、支出 ${item.expenseEntryCount} 筆`}
                      </Text>
                    ))}
                </Space>
              ),
              okText: "確認儲存",
              cancelText: "取消",
              onOk: () => resolve(true),
              onCancel: () => resolve(false),
            });
          });

          if (!confirmed) {
            return;
          }
        }
      }

      setLoadingHolderSettings(true);
      await saveHolderOptions({
        options: nextOptions,
        renameMap,
      });
      setEditingHoldingId(null);
      setEditingCashAccountId(null);
      setEditingHoldingHolder(null);
      setEditingCashHolder(null);
      await Promise.all([
        loadHolderOptionSettings(),
        loadAllData(),
        loadExpenseData(),
      ]);
      await performCloudSync();
      message.success("持有人設定已儲存");
    } catch (error) {
      message.error(
        toUserMessage(error, "儲存持有人設定失敗"),
      );
    } finally {
      setLoadingHolderSettings(false);
    }
  }, [
    holderDraftRows,
    holderOptions,
    loadAllData,
    loadExpenseData,
    loadHolderOptionSettings,
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
      monthLabel: dayjs(`${item.month}-01`).format("YYYY/MM"),
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
              ? CHART_PALETTE[0]
              : item.key === "個人"
                ? CHART_PALETTE[1]
                : CHART_NEUTRAL,
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
        .filter((item) => Number(item.value) > 0)
        .map((item) => ({
          name: item.label,
          value: Number(item.value) || 0,
          color: getStableChartColor(item.label),
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
          color: CHART_PALETTE[index % CHART_PALETTE.length],
        })),
    [effectiveExpenseAnalytics],
  );

  const expenseChartPreviewSummary = useMemo(() => {
    const latestTrend = trendMonths[trendMonths.length - 1];
    const familyValue =
      kindAnalysisData.find((item) => item.name === "家庭")?.value || 0;
    const personalValue =
      kindAnalysisData.find((item) => item.name === "個人")?.value || 0;
    const rankingItems = (effectiveExpenseAnalytics?.payerRanking ?? []).map(
      (item) => ({
        ...item,
        value: Number(item.value) || 0,
      }),
    );
    const familyTotal =
      rankingItems.find((item) => item.key === "family_total")?.value || 0;
    const topPersonalRanking = rankingItems
      .filter((item) => item.key !== "family_total" && item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 2);
    const familyBalanceItems = (effectiveExpenseAnalytics?.familyBalance ?? [])
      .map((item) => ({
        ...item,
        value: Number(item.value) || 0,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
    const topCategory = categoryAnalysisData[0];
    const kindTotal = familyValue + personalValue;
    const familyBalanceTotal = familyBalanceItems.reduce(
      (sum, item) => sum + item.value,
      0,
    );
    const categoryTotal = categoryAnalysisData.reduce(
      (sum, item) => sum + (Number(item.value) || 0),
      0,
    );

    const formatPercent = (value, total) =>
      total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "--";
    const rankingSummaryParts = topPersonalRanking.map(
      (item) => `${item.label} ${formatTwd(item.value)}`,
    );
    if (familyTotal > 0) {
      rankingSummaryParts.push(`家庭 ${formatTwd(familyTotal)}`);
    }
    const familyBalanceSummary = familyBalanceItems
      .slice(0, 2)
      .map((item) => `${item.label} ${formatPercent(item.value, familyBalanceTotal)}`)
      .join(" / ");

    return {
      trend: latestTrend
        ? `最新：${formatTwd(latestTrend.totalTwd)}`
        : "尚無資料",
      kind: `家庭 ${formatPercent(familyValue, kindTotal)} / 個人 ${formatPercent(personalValue, kindTotal)}`,
      ranking:
        rankingSummaryParts.length > 0
          ? rankingSummaryParts.join(" · ")
          : "尚無資料",
      family_balance: familyBalanceSummary || "尚無資料",
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
      { key: "kind", title: "家庭/個人比例", icon: HomeUser },
      { key: "ranking", title: "支出人排行", icon: Group },
      { key: "family_balance", title: "家庭開銷平衡", icon: CoinsSwap },
      { key: "category", title: "類別分析", icon: Label },
    ],
    [],
  );

  // Recharts series run with isAnimationActive={false} everywhere: their
  // ~1.9s entry animation adds label <g>s when it ends, and iOS Safari treats
  // any tap whose hover window sees new content as a hover only, so taps made
  // right after a chart mounts (e.g. 支出 → +) needed a second try.
  const renderExpenseChartModalContent = useCallback(
    (chartKey) => {
      if (chartKey === "trend") {
        if (trendMonths.length === 0)
          return <EmptyState icon={StatsReport} description="尚無支出資料" />;
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={trendMonths}
              margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="monthLabel" />
              <YAxis
                tickFormatter={formatAxisTwd}
              />
              <RechartsTooltip
                formatter={(value) => formatTwd(Number(value))}
              />
              <Line
                isAnimationActive={false}
                type="monotone"
                dataKey="totalTwd"
                name="總支出"
                stroke={CHART_PALETTE[0]}
                strokeWidth={3}
                dot={{ r: 3 }}
              />
              <Line
                isAnimationActive={false}
                type="monotone"
                dataKey="recurringTwd"
                name="定期支出"
                stroke={CHART_PALETTE[1]}
                strokeWidth={3}
                dot={{ r: 3 }}
              />
              <Legend />
            </LineChart>
          </ResponsiveContainer>
        );
      }
      if (chartKey === "kind") {
        if (kindAnalysisData.length === 0)
          return <EmptyState icon={StatsReport} description="尚無支出資料" />;
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                isAnimationActive={false}
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
        if (!hasValue) return <EmptyState icon={StatsReport} description="尚無支出資料" />;
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
                tickFormatter={formatAxisTwd}
              />
              <YAxis type="category" dataKey="name" width={88} />
              <RechartsTooltip
                formatter={(value) => formatTwd(Number(value))}
              />
              <Bar isAnimationActive={false} dataKey="value" fill={CHART_PALETTE[0]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );
      }
      if (chartKey === "family_balance") {
        if (familyBalanceData.length === 0)
          return <EmptyState icon={StatsReport} description="尚無家庭開銷資料" />;
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                isAnimationActive={false}
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
        return <EmptyState icon={StatsReport} description="尚無分類資料" />;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              isAnimationActive={false}
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

  const isSyncTextQuiet =
    isMobileViewport &&
    authReady &&
    cloudSyncStatus !== "offline" &&
    cloudSyncStatus !== "error";

  return (
    <AppErrorBoundary>
      <Layout className="app-layout">
        <Header className="app-header">
          <div className="header-spacer">
            {authUser && !isMobileViewport && (
              <Segmented
                size="middle"
                value={activeMainTab}
                onChange={switchMainTab}
                options={[
                  // Icons are decoration: the tab's name is its label.
                  {
                    label: "資產總覽",
                    value: "asset",
                    icon: <HomeSimple aria-hidden />,
                  },
                  {
                    label: "支出分析",
                    value: "expense",
                    icon: <StatsReport aria-hidden />,
                  },
                  {
                    label: "設定",
                    value: "settings",
                    icon: <Settings aria-hidden />,
                  },
                ]}
              />
            )}
          </div>
          <img
            src={`${import.meta.env.BASE_URL}icon.svg`}
            alt="我的資產"
            className="header-logo"
          />
          <div className="header-auth">
            {authUser && (
              <Space size={8}>
                <div className="header-sync-meta">
                  <Text
                    type={cloudSyncStatus === "error" ? "danger" : "secondary"}
                  >
                    <SyncStatusIcon
                      status={cloudSyncStatus}
                      style={{ marginRight: 6 }}
                    />
                    {/* On a phone the icon alone carries the healthy states;
                        the words only show when something needs attention. */}
                    <span
                      className={
                        isSyncTextQuiet
                          ? "header-sync-label is-quiet"
                          : "header-sync-label"
                      }
                    >
                      {authReady ? cloudSyncText : "讀取登入狀態中..."}
                    </span>
                  </Text>
                </div>
                <Space size={6}>
                  <HoverTooltip title={authUser.email || "Google 帳號"}>
                    <Button
                      size="small"
                      className="header-logout"
                      icon={<LogOut />}
                      onClick={handleGoogleLogout}
                      loading={loadingAuthAction}
                      aria-label="Google 登出"
                    />
                  </HoverTooltip>
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
            <Text type="secondary" className="pull-refresh-label">
              {isPullRefreshing ? (
                <LoadingOutlined aria-hidden />
              ) : (
                <ArrowDown
                  className={`pull-refresh-arrow${
                    pullDistance >= PULL_REFRESH_TRIGGER ? " is-armed" : ""
                  }`}
                />
              )}
              {isPullRefreshing
                ? "重新整理中..."
                : pullDistance >= PULL_REFRESH_TRIGGER
                  ? "放開以重新整理"
                  : "下拉重新整理"}
            </Text>
          </div>
          {syncError && (
            <Alert
              type="error"
              showIcon
              title="上次同步發生錯誤"
              description={toUserMessage(syncError, "同步失敗，請稍後再試")}
              style={{ marginBottom: 16 }}
            />
          )}
          {/* Every edit control is disabled while read-only; say why once,
              up front, instead of leaving ~40 greyed-out buttons unexplained. */}
          {authUser && (cloudSyncStatus === "offline" || cloudReadOnly) && (
            <Alert
              type="warning"
              showIcon
              title="目前為唯讀模式，暫時無法新增或修改"
              description={cloudReadOnlyReason || "目前離線，暫時只能檢視資料。"}
              style={{ marginBottom: 16 }}
            />
          )}
          {bootPhase === "loading" ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                minHeight: "40vh",
              }}
            >
              <Spin size="large" />
              <Text type="secondary">
                {authUser ? "正在同步雲端資料…" : "讀取登入狀態中…"}
              </Text>
            </div>
          ) : !authUser ? (
            <Card style={{ maxWidth: 420, margin: "24px auto 0" }} title="登入">
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Text type="secondary">請先登入以查看資產與支出內容。</Text>
                {authLoginContentNode}
              </Space>
            </Card>
          ) : activeMainTab === "asset" ? (
            <Row gutter={[16, 16]} style={{ rowGap: "var(--space-section)" }}>
              <Col xs={24}>
                <div className="asset-summary-panel">
                  <AssetSummaryHero
                    totalTwd={totalTwd}
                    displayTotalTwd={displayTotalTwd}
                    baselineTwd={baselineTotalTwd}
                    changeTwd={totalChangeTwd}
                    changePct={totalChangePct}
                    priceDataStale={priceDataStale}
                    quoteAt={latestPriceCapturedAt}
                    playKey={assetPlayKey}
                  />
                  {autoRefreshIssue && (
                    <Text type="warning" className="asset-hero-issue">
                      {autoRefreshIssue}
                      <Button
                        type="link"
                        size="small"
                        className="asset-hero-retry"
                        icon={<Refresh />}
                        onClick={() => handleRefreshPrices("ALL")}
                        loading={loadingRefresh}
                        disabled={isWriteDisabled}
                      >
                        重試
                      </Button>
                    </Text>
                  )}
                </div>
              </Col>

              <Col xs={24}>
                {isMobileViewport ? (
                  <div className="mobile-list-section mobile-list-section--holdings">
                    <div className="mobile-list-header">
                      <span className="mobile-list-title">持股列表</span>
                      {usdTwdRate ? (
                        <span className="holdings-fx-rate">
                          USD/TWD {usdTwdRate.toFixed(2)}
                        </span>
                      ) : null}
                      {/* Outlined, not primary: prices refresh on their own
                          once a day, and the FAB is this screen's one black
                          call to action. */}
                      <div className="price-update-extra">
                        <Space>
                          <Space.Compact>
                            <Button
                              icon={<Refresh />}
                              onClick={() => handleRefreshPrices("ALL")}
                              loading={loadingRefresh}
                              disabled={isWriteDisabled}
                              aria-label="更新價格（全部）"
                            >
                              更新價格
                            </Button>
                            <Button
                              icon={<NavArrowDown />}
                              aria-label="選擇更新市場"
                              disabled={isWriteDisabled || loadingRefresh}
                              onClick={() => setIsUpdateSheetOpen(true)}
                            />
                          </Space.Compact>
                        </Space>
                      </div>
                    </div>
                    <div className="mobile-list-body">
                      {/* Grouped by holder, each foldable with its total;
                          rows reuse the mobile holding row (swipe actions,
                          inline editor). */}
                      <Spin spinning={loadingData}>
                        <CollapsibleGroups
                          className="holding-groups"
                          groups={holdingGroups}
                          renderRow={(record) => (
                            <Fragment key={record.id}>
                              {tableColumns[0].render(null, record)}
                            </Fragment>
                          )}
                          empty={holdingsEmptyState}
                        />
                      </Spin>
                    </div>
                  </div>
                ) : (
                  <Card
                    className="holdings-card"
                    title="持股列表"
                    extra={
                      <div className="holdings-card-actions">
                        {usdTwdRate ? (
                          <span className="holdings-fx-rate">
                            USD/TWD {usdTwdRate.toFixed(2)}
                          </span>
                        ) : null}
                        <Button
                          icon={<Download />}
                          onClick={handleExportHoldingsCsv}
                          disabled={loadingData || rows.length === 0}
                        >
                          匯出 CSV
                        </Button>
                        <div className="price-update-extra">
                          <Space.Compact>
                            <Button
                              type="primary"
                              icon={<Refresh />}
                              onClick={() => handleRefreshPrices("ALL")}
                              loading={loadingRefresh}
                              disabled={isWriteDisabled}
                              aria-label="更新價格（全部）"
                            >
                              更新價格
                            </Button>
                            <Dropdown
                              trigger={["click"]}
                              disabled={isWriteDisabled || loadingRefresh}
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
                                icon={<NavArrowDown />}
                                aria-label="選擇更新市場"
                              />
                            </Dropdown>
                          </Space.Compact>
                        </div>
                      </div>
                    }
                  >
                    <Tabs
                      activeKey={activeHoldingTab}
                      onChange={setActiveHoldingTab}
                      items={holdingHolderTabItems}
                      style={{ marginBottom: 12 }}
                    />
                    <Table
                      rowKey="id"
                      dataSource={filteredRows}
                      columns={tableColumns}
                      pagination={false}
                      loading={loadingData}
                      scroll={{ x: 980 }}
                      locale={{ emptyText: holdingsEmptyState }}
                      onRow={(record) => ({
                        className: "holding-row--clickable",
                        onClick: (event) => {
                          if (editingHoldingId === record.id || isInteractiveTarget(event.target, event.currentTarget)) return;
                          setStockDetailId(record.id);
                        },
                      })}
                    />
                  </Card>
                )}
              </Col>

              <Col xs={24}>
                {isMobileViewport ? (
                  <div className="mobile-list-section mobile-list-section--cash">
                    <div className="mobile-list-header">
                      <Space size={8}>
                        <span className="mobile-list-title">銀行現金資產</span>
                        <Button
                          type="text"
                          size="small"
                          className="title-add-btn"
                          onClick={() => {
                            setIsAddCashSheetOpen(true);
                          }}
                          disabled={isWriteDisabled || loadingAddCashAccount}
                          icon={<Plus />}
                          aria-label="新增銀行帳戶"
                        />
                      </Space>
                    </div>
                    <div className="mobile-list-body">
                      {/* Grouped by holder, each foldable with its total
                          balance; rows reuse the mobile cash row. */}
                      <CollapsibleGroups
                        className="cash-groups"
                        groups={cashGroups}
                        renderRow={(record) => (
                          <Fragment key={record.id}>
                            {cashTableColumns[0].render(null, record)}
                          </Fragment>
                        )}
                        empty={
                          <EmptyState
                            icon={Bank}
                            description="尚未新增銀行現金帳戶"
                          />
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <Card
                    title={
                      <Space size={8}>
                        <span>銀行現金資產</span>
                        <HoverTooltip title="新增銀行帳戶">
                          <Button
                            type="text"
                            size="small"
                            className="title-add-btn"
                            onClick={() => {
                              setIsAddCashModalOpen(true);
                            }}
                            disabled={isWriteDisabled || loadingAddCashAccount}
                            icon={<Plus />}
                            aria-label="新增銀行帳戶"
                          />
                        </HoverTooltip>
                      </Space>
                    }
                  >
                    <Tabs
                      activeKey={activeCashHolderTab}
                      onChange={setActiveCashHolderTab}
                      items={cashHolderTabItems}
                      style={{ marginBottom: 12 }}
                    />
                    <Table
                      rowKey="id"
                      dataSource={filteredCashRows}
                      columns={cashTableColumns}
                      pagination={false}
                      tableLayout="fixed"
                      scroll={{ x: 860 }}
                      locale={{
                        emptyText: "尚未新增銀行現金帳戶",
                      }}
                    />
                  </Card>
                )}
              </Col>

              <Col xs={24}>
                <section className="analysis-section">
                  <span className="analysis-title">資產分析</span>
                  <ul className="analysis-list">
                    {assetChartRows.map((chart) => (
                      <li key={chart.key}>
                        <button
                          type="button"
                          className="analysis-item"
                          onClick={() => setActiveAssetChartKey(chart.key)}
                        >
                          <chart.icon className="analysis-item-icon" />
                          <span className="analysis-item-main">
                            <span className="analysis-item-name">
                              {chart.title}
                            </span>
                            <span className="analysis-item-summary">
                              {chart.summary}
                            </span>
                          </span>
                          <NavArrowRight
                            className="analysis-item-chevron"
                            aria-hidden
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              </Col>
            </Row>
          ) : (
            <Row
              gutter={[16, 16]}
              // Expense: sections sit a token-sized gap apart (antd's gutter
              // writes row-gap inline, so it is overridden the same way).
              style={
                activeMainTab === "expense"
                  ? { rowGap: "var(--space-section)" }
                  : undefined
              }
            >
              {activeMainTab === "expense" && (
                <>
                  <Col xs={24}>
                    <ExpenseSummaryCard
                      mode={expenseTotalMode}
                      activeMonth={safeActiveExpenseMonth}
                      monthlySummaries={expenseMonthlySummaries}
                      monthProgress={incomeProgress?.month}
                      playKey={expensePlayKey}
                      onSelectMonth={(month) => {
                        setExpensePlayKey((key) => key + 1);
                        setExpenseTotalMode("month");
                        setActiveExpenseMonth(month);
                      }}
                      onToggleMode={() => {
                        setExpensePlayKey((key) => key + 1);
                        setExpenseTotalMode((current) =>
                          current === "cumulative" ? "month" : "cumulative",
                        );
                      }}
                      onSetupIncome={goToIncomeSettings}
                    />
                  </Col>
                  <Col xs={24}>
                    <section className="active-budgets-section">
                      <Space size={8} className="active-budgets-title-wrap">
                        <Text strong className="active-budgets-title">
                          預算
                        </Text>
                        <Button
                          type="text"
                          size="small"
                          className="title-add-btn"
                          icon={<Plus />}
                          aria-label="新增預算"
                          disabled={isWriteDisabled}
                          onClick={() => openBudgetForm()}
                        />
                      </Space>
                      {activeBudgetCards.length === 0 ? (
                        <EmptyState
                          icon={Wallet}
                          description="目前沒有生效中的預算"
                        >
                          <Button
                            icon={<Plus />}
                            disabled={isWriteDisabled}
                            onClick={() => openBudgetForm()}
                          >
                            新增預算
                          </Button>
                        </EmptyState>
                      ) : isMobileViewport ? (
                        <BudgetOverview
                          budgets={activeBudgetCards}
                          today={dayjs().format("YYYY-MM-DD")}
                          onOpen={(budget) => setBudgetDetailId(budget.id)}
                          getActions={getBudgetSwipeActions}
                          disabled={isWriteDisabled}
                        />
                      ) : (
                        <div className="active-budgets-row">
                          {sortBudgetsByUrgency(activeBudgetCards).map((budget) => {
                            const status = getBudgetStatus(budget);
                            return (
                              <Card
                                key={budget.id}
                                size="small"
                                className="active-budget-card"
                                hoverable={!isWriteDisabled}
                                onClick={() => {
                                  if (!isWriteDisabled) openBudgetForm(budget);
                                }}
                                aria-label={`編輯預算：${budget.name}`}
                              >
                                <div className="active-budget-head">
                                  <Text
                                    type="secondary"
                                    className="active-budget-name"
                                    title={budget.name}
                                  >
                                    {budget.name}
                                  </Text>
                                  {budget.budgetMode === "SPECIAL" ? (
                                    <Tag
                                      className="active-budget-mode-tag"
                                      bordered={false}
                                    >
                                      {formatBudgetModeLabel(budget.budgetMode)}
                                    </Tag>
                                  ) : null}
                                </div>
                                <div
                                  className={`active-budget-remaining active-budget-remaining--${status.level}`}
                                >
                                  <span className="active-budget-remaining-prefix">
                                    已使用
                                  </span>
                                  <span className="active-budget-remaining-value">
                                    {`${status.usedPct.toFixed(1)}%`}
                                  </span>
                                </div>
                                <Progress
                                  className="active-budget-progress"
                                  percent={status.barPct}
                                  size="small"
                                  showInfo={false}
                                  strokeColor={BUDGET_LEVEL_COLORS[status.level]}
                                />
                                <Text
                                  className={`active-budget-status active-budget-status--${status.level}`}
                                >
                                  {status.level === "over"
                                    ? `超支 ${formatTwd(status.overTwd)}`
                                    : `剩餘 ${formatTwd(status.remainingTwd)}`}
                                </Text>
                                <Text
                                  type="secondary"
                                  className="active-budget-meta"
                                >
                                  {formatTwd(Number(budget.spentTwd) || 0)} /{" "}
                                  {formatTwd(Number(budget.availableTwd) || 0)}
                                  {Number(budget.upcomingTwd) > 0
                                    ? `・含預計 ${formatTwd(Number(budget.upcomingTwd))}`
                                    : ""}
                                  {budget.budgetMode === "SPECIAL" &&
                                  budget.specialStartDate &&
                                  budget.specialEndDate
                                    ? `（${formatDate(budget.specialStartDate)}~${formatDate(
                                        budget.specialEndDate,
                                      )}）`
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
                            );
                          })}
                        </div>
                      )}
                    </section>
                  </Col>
                  <Col xs={24}>
                    {isMobileViewport ? (
                      <>
                      <div className="mobile-list-section mobile-list-section--expense">
                        <div className="mobile-list-header">
                          <span className="mobile-list-title">支出列表</span>
                        </div>
                        <div className="mobile-list-body">
                          {/* This month's upcoming recurring charges, right
                              under the title so the list can't push them
                              down; independent of the category tabs. */}
                          <UpcomingExpenseList
                            rows={expenseRows}
                            getActions={getExpenseSwipeActions}
                            disabled={isWriteDisabled}
                          />
                          <ExpenseDayList
                            rows={expenseListRows}
                            today={dayjs().format("YYYY-MM-DD")}
                            getActions={getExpenseSwipeActions}
                            disabled={isWriteDisabled}
                            empty={expenseEmptyState}
                          />
                        </div>
                      </div>
                      </>
                    ) : (
                      <Card title="支出列表">
                        <Tabs
                          className="expense-category-tabs"
                          activeKey={activeExpenseCategoryTab}
                          onChange={setActiveExpenseCategoryTab}
                          items={expenseCategoryTabItems}
                          style={{ marginBottom: 12 }}
                        />
                        <Table
                          rowKey={(record) => `${record.id}-${record.occurredAt}`}
                          rowClassName={expenseRowClassName}
                          dataSource={filteredExpenseRowsByCategory}
                          columns={expenseTableColumns}
                          pagination={false}
                          locale={{ emptyText: expenseEmptyState }}
                          scroll={{ x: 860 }}
                        />
                      </Card>
                    )}
                  </Col>
                  <Col xs={24}>
                    <RecurringOverview
                      rows={recurringExpenseRows}
                      summary={recurringSummary}
                      categoryNames={expenseCategoryNameById}
                      categoryIcons={expenseCategoryIconById}
                      today={dayjs().format("YYYY-MM-DD")}
                      onEdit={openRecurringEditForm}
                      onStop={openStopRecurringModal}
                      onCreate={() =>
                        openExpenseForm(null, { mode: "recurring-create" })
                      }
                      stoppingById={stoppingRecurringById}
                      disabled={isWriteDisabled}
                      swipeable={isMobileViewport}
                    />
                  </Col>
                  <Col xs={24}>
                    {/* Reference, not daily use: one row per analysis with
                        its headline; the full chart opens on tap. */}
                    <section className="analysis-section">
                      <span className="analysis-title">支出分析</span>
                      <ul className="analysis-list">
                        {expenseChartCards.map((chart) => (
                          <li key={chart.key}>
                            <button
                              type="button"
                              className="analysis-item"
                              onClick={() => {
                                setActiveExpenseChartKey(chart.key);
                                setIsExpenseChartModalOpen(true);
                              }}
                            >
                              <chart.icon className="analysis-item-icon" />
                              <span className="analysis-item-main">
                                <span className="analysis-item-name">
                                  {chart.title}
                                </span>
                                <span className="analysis-item-summary">
                                  {expenseChartPreviewSummary[chart.key] ||
                                    "尚無資料"}
                                </span>
                              </span>
                              <NavArrowRight
                                className="analysis-item-chevron"
                                aria-hidden
                              />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </Col>
                </>
              )}
              {activeMainTab === "settings" && (
                <>
                  <Col xs={24}>
                    {isMobileViewport ? (
                      <MobileIncomeSettings
                        defaultMonthlyIncomeTwd={defaultMonthlyIncomeTwd}
                        overrides={incomeMonthOverrides}
                        disabled={isWriteDisabled}
                        loading={loadingIncomeSettings}
                        onSaveDefault={handleSaveIncomeSettings}
                        onSaveOverride={saveIncomeOverride}
                        onRemoveOverride={(month) =>
                          confirmDestructive({
                            title: `刪除 ${dayjs(month).format("YYYY 年 M 月")} 的收入？`,
                            onOk: () => handleRemoveIncomeOverride(month),
                          })
                        }
                        getPopupContainer={getSheetPopupContainer}
                      />
                    ) : (
                      <Card
                        title={<SectionTitle icon={Coins}>收入設定</SectionTitle>}
                        id="income-settings"
                      >
                        <Space
                          direction="vertical"
                          size={12}
                          style={{ width: "100%" }}
                        >
                          <div className="income-settings-row">
                            <Text type="secondary">預設每月收入 (TWD)</Text>
                            <InputNumber
                              inputMode="numeric"
                              min={0}
                              step={1000}
                              precision={0}
                              style={{ width: 240 }}
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
                                disabled={isWriteDisabled}
                                onChange={(value) =>
                                  setNewIncomeOverrideMonth(value || dayjs())
                                }
                                getPopupContainer={getSheetPopupContainer}
                              />
                              <InputNumber
                                inputMode="numeric"
                                min={1}
                                step={1000}
                                precision={0}
                                disabled={isWriteDisabled}
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
                                disabled={isWriteDisabled}
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
                                    type="text"
                                    className="row-action row-action--danger"
                                    size="small"
                                    icon={<Trash />}
                                    loading={loadingIncomeSettings}
                                    disabled={isWriteDisabled}
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
                              onClick={() => handleSaveIncomeSettings()}
                              loading={loadingIncomeSettings}
                              disabled={isWriteDisabled}
                            >
                              儲存收入設定
                            </Button>
                          </div>
                        </Space>
                      </Card>
                    )}
                  </Col>
                  <Col xs={24}>
                    <Card title={<SectionTitle icon={Group}>持有人設定</SectionTitle>}>
                      <Space
                        direction="vertical"
                        size={12}
                        style={{ width: "100%" }}
                      >
                        <Alert
                          type="info"
                          showIcon
                          message="這份持有人名單會同步套用到持股、現金帳戶、支出人與資產總覽篩選。"
                          description="移除仍在使用中的持有人時，相關資料會改成未設定；支出的「共同帳戶」會保留為固定選項。"
                        />
                        {holderDraftRows.map((row, index) => (
                          <Space.Compact
                            key={row.id}
                            style={{ width: "100%" }}
                          >
                            <Input
                              value={row.value}
                              placeholder={`持有人 ${index + 1}`}
                              disabled={isWriteDisabled || loadingHolderSettings}
                              onChange={(event) =>
                                handleHolderDraftValueChange(
                                  row.id,
                                  event.target.value,
                                )
                              }
                            />
                            <Button
                              className="row-action row-action--danger"
                              icon={<Trash />}
                              aria-label="移除持有人"
                              disabled={
                                isWriteDisabled ||
                                loadingHolderSettings ||
                                holderDraftRows.length <= 1
                              }
                              onClick={() => handleRemoveHolderDraftRow(row.id)}
                            />
                          </Space.Compact>
                        ))}
                        <Space wrap>
                          <Button
                            icon={<Plus />}
                            onClick={handleAddHolderDraftRow}
                            disabled={isWriteDisabled || loadingHolderSettings}
                          >
                            新增持有人
                          </Button>
                          <Button
                            type="primary"
                            onClick={handleSaveHolderSettings}
                            loading={loadingHolderSettings}
                            disabled={isWriteDisabled || !hasHolderSettingChanges}
                          >
                            儲存持有人設定
                          </Button>
                        </Space>
                      </Space>
                    </Card>
                  </Col>
                  <Col xs={24} lg={24}>
                    {isMobileViewport ? (
                      <div className="mobile-list-section mobile-list-section--category">
                        <div className="mobile-list-header">
                          <Space size={8}>
                            <span className="mobile-list-title">
                              <SectionTitle icon={Label}>類別列表</SectionTitle>
                            </span>
                            <Button
                              type="text"
                              size="small"
                              className="title-add-btn"
                              icon={<Plus />}
                              disabled={isWriteDisabled}
                              onClick={() => openCategoryForm()}
                            />
                          </Space>
                        </div>
                        <div className="mobile-list-body">
                          <Table
                            showHeader={false}
                            className="mobile-swipe-table"
                            rowKey="id"
                            dataSource={expenseCategoryRows}
                            columns={expenseCategoryMobileColumns}
                            pagination={false}
                            locale={{ emptyText: "尚無分類" }}
                          />
                        </div>
                      </div>
                    ) : (
                      <Card
                        title={
                          <Space size={8}>
                            <SectionTitle icon={Label}>類別列表</SectionTitle>
                            <HoverTooltip title="新增類別">
                              <Button
                                type="text"
                                size="small"
                                className="title-add-btn"
                                icon={<Plus />}
                                disabled={isWriteDisabled}
                                onClick={() => openCategoryForm()}
                              />
                            </HoverTooltip>
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
                    )}
                  </Col>
                  <Col xs={24} lg={24}>
                    {isMobileViewport ? (
                      <div className="mobile-list-section mobile-list-section--template">
                        <div className="mobile-list-header">
                          <Space size={8}>
                            <span className="mobile-list-title">
                              <SectionTitle icon={Star}>常用支出</SectionTitle>
                            </span>
                            <Button
                              type="text"
                              size="small"
                              className="title-add-btn"
                              icon={<Plus />}
                              aria-label="新增常用支出"
                              disabled={isWriteDisabled}
                              onClick={() => openTemplateForm()}
                            />
                          </Space>
                        </div>
                        <div className="mobile-list-body">
                          {expenseTemplateTable}
                        </div>
                      </div>
                    ) : (
                      <Card
                        title={
                          <Space size={8}>
                            <SectionTitle icon={Star}>常用支出</SectionTitle>
                            <HoverTooltip title="新增常用支出">
                              <Button
                                type="text"
                                size="small"
                                className="title-add-btn"
                                icon={<Plus />}
                                aria-label="新增常用支出"
                                disabled={isWriteDisabled}
                                onClick={() => openTemplateForm()}
                              />
                            </HoverTooltip>
                          </Space>
                        }
                      >
                        {expenseTemplateTable}
                      </Card>
                    )}
                  </Col>
                  <Col xs={24} lg={24}>
                    {isMobileViewport ? (
                      <div className="mobile-list-section mobile-list-section--budget">
                        <div className="mobile-list-header">
                          <Space size={8}>
                            <span className="mobile-list-title">
                              <SectionTitle icon={Wallet}>預算列表</SectionTitle>
                            </span>
                            <Button
                              type="text"
                              size="small"
                              className="title-add-btn"
                              icon={<Plus />}
                              disabled={isWriteDisabled}
                              onClick={() => openBudgetForm()}
                            />
                          </Space>
                        </div>
                        <div className="mobile-list-body">
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
                                    showHeader={false}
                                    className="mobile-swipe-table"
                                    rowKey="id"
                                    dataSource={residentBudgetRows}
                                    columns={residentBudgetMobileColumns}
                                    pagination={false}
                                    locale={{ emptyText: "尚無常駐預算" }}
                                  />
                                ),
                              },
                              {
                                key: "special",
                                label: "特別預算",
                                children: (
                                  <Table
                                    showHeader={false}
                                    className="mobile-swipe-table"
                                    rowKey="id"
                                    dataSource={specialBudgetRows}
                                    columns={specialBudgetMobileColumns}
                                    pagination={false}
                                    locale={{ emptyText: "尚無特別預算" }}
                                  />
                                ),
                              },
                            ]}
                          />
                        </div>
                      </div>
                    ) : (
                      <Card
                        title={
                          <Space size={8}>
                            <SectionTitle icon={Wallet}>預算列表</SectionTitle>
                            <HoverTooltip title="新增預算">
                              <Button
                                type="text"
                                size="small"
                                className="title-add-btn"
                                icon={<Plus />}
                                disabled={isWriteDisabled}
                                onClick={() => openBudgetForm()}
                              />
                            </HoverTooltip>
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
                    )}
                  </Col>
                  <Col xs={24}>
                    <Card title={<SectionTitle icon={Download}>資料匯出</SectionTitle>}>
                      <Space direction="vertical" size={12} style={{ width: "100%" }}>
                        <Text type="secondary">
                          匯出你輸入的資料（不含每日股價紀錄）。CSV 可用
                          Excel / Numbers 開啟；JSON 為完整備份。
                        </Text>
                        <Space wrap>
                          <Button
                            icon={<Download />}
                            onClick={handleExportHoldingsCsv}
                            disabled={rows.length === 0}
                          >
                            持股 CSV
                          </Button>
                          <Button
                            icon={<Download />}
                            onClick={handleExportCashCsv}
                            disabled={cashRows.length === 0}
                          >
                            現金帳戶 CSV
                          </Button>
                          <Button
                            icon={<Download />}
                            onClick={handleExportExpensesCsv}
                          >
                            支出 CSV（全部）
                          </Button>
                          <Button
                            icon={<Download />}
                            onClick={handleExportBackupJson}
                          >
                            完整備份 JSON
                          </Button>
                        </Space>
                      </Space>
                    </Card>
                  </Col>
                </>
              )}
            </Row>
          )}

          {authUser &&
          ((isMobileViewport &&
            (activeMainTab === "expense" || activeMainTab === "asset")) ||
            (!isMobileViewport &&
              (activeMainTab === "expense" || activeMainTab === "asset"))) ? (
            <Button
              type="primary"
              shape="circle"
              icon={<Plus />}
              aria-label={activeMainTab === "asset" ? "新增持股" : "新增支出"}
              className={`expense-fab ${
                isMobileViewport
                  ? "expense-fab--mobile"
                  : "expense-fab--desktop"
              }`}
              disabled={isWriteDisabled}
              onClick={() => {
                if (activeMainTab === "asset") {
                  openAddHoldingForm();
                  return;
                }
                if (isMobileViewport) {
                  openQuickExpense();
                  return;
                }
                openExpenseForm();
              }}
            />
          ) : null}

          {authUser && activeMainTab === "settings" && (
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <Text type="secondary" className="cloud-last-sync-time">
                {cloudLastSyncedText}
              </Text>
            </div>
          )}

          {authUser && isMobileViewport && (
            <div className="mobile-main-tabbar">
              <Segmented
                size="middle"
                value={activeMainTab}
                onChange={switchMainTab}
                options={[
                  // Icons are decoration: the tab's name is its text.
                  { icon: <HomeSimple aria-hidden />, text: "資產", value: "asset" },
                  {
                    icon: <StatsReport aria-hidden />,
                    text: "支出",
                    value: "expense",
                  },
                  {
                    icon: <Settings aria-hidden />,
                    text: "設定",
                    value: "settings",
                  },
                ].map(({ icon, text, value }) => ({
                  value,
                  label: (
                    <span className="mobile-tab-label">
                      {icon}
                      <span className="mobile-tab-text">{text}</span>
                    </span>
                  ),
                }))}
              />
            </div>
          )}

          <Modal
            title={activeAssetChart?.title}
            open={Boolean(activeAssetChart)}
            onCancel={() => setActiveAssetChartKey(null)}
            footer={null}
            width={isMobileViewport ? "94vw" : 720}
            destroyOnHidden
          >
            {activeAssetChartKey === "trend" ? (
              <TrendChart
                range={range}
                onRangeChange={(value) => setRange(value)}
                data={trend}
                height={360}
              />
            ) : activeAssetChartKey ? (
              <AllocationBreakdown
                items={
                  activeAssetChartKey === "market"
                    ? marketAllocation
                    : assetTypeAllocation
                }
                emptyText={
                  activeAssetChartKey === "market"
                    ? "尚無可計算台股 / 美股比例的持股資料"
                    : "尚無可計算資產類型比例的資料"
                }
              />
            ) : null}
          </Modal>

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
            okButtonProps={{ disabled: isWriteDisabled }}
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
              {shouldShowStopOptions ? (
                <Radio.Group
                  disabled={isWriteDisabled}
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
              ) : null}
            </Space>
          </Modal>

          <Drawer
            placement="bottom"
            open={isMobileViewport && isUpdateSheetOpen}
            onClose={() => setIsUpdateSheetOpen(false)}
            size="auto"
            title="更新價格"
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
                disabled={isWriteDisabled || loadingRefresh}
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
                disabled={isWriteDisabled || loadingRefresh}
                loading={loadingRefresh}
              >
                更新美股
              </Button>
              <Button block type="text" onClick={() => setIsUpdateSheetOpen(false)}>
                取消
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
            submitDisabled={isWriteDisabled}
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
              disabled={isWriteDisabled}
              holderOptions={holderSelectOptions}
              holdingTagOptions={holdingTagOptions}
              existingHoldings={rows}
            />
          </MobileFormSheetLayout>

          <MobileFormSheetLayout
            title="新增銀行帳戶"
            open={isMobileViewport && isAddCashSheetOpen}
            onClose={() => setIsAddCashSheetOpen(false)}
            loading={loadingAddCashAccount}
            submitDisabled={isWriteDisabled}
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
              disabled={isWriteDisabled}
              holderOptions={holderSelectOptions}
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
                disabled={isWriteDisabled || loadingAddHolding}
              >
                取消
              </Button>,
              <Button
                key="submit"
                type="primary"
                htmlType="submit"
                form="desktop-holding-form"
                loading={loadingAddHolding}
                disabled={isWriteDisabled}
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
              disabled={isWriteDisabled}
              holderOptions={holderSelectOptions}
              holdingTagOptions={holdingTagOptions}
              existingHoldings={rows}
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
                disabled={isWriteDisabled || loadingAddCashAccount}
              >
                取消
              </Button>,
              <Button
                key="submit"
                type="primary"
                htmlType="submit"
                form="desktop-cash-form"
                loading={loadingAddCashAccount}
                disabled={isWriteDisabled}
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
              disabled={isWriteDisabled}
              holderOptions={holderSelectOptions}
            />
          </Modal>

          {isMobileViewport && (
            <BudgetDetailSheet
              open={Boolean(budgetDetail)}
              budget={budgetDetail}
              today={dayjs().format("YYYY-MM-DD")}
              onClose={() => setBudgetDetailId(null)}
              getActions={getExpenseSwipeActions}
              disabled={isWriteDisabled}
            />
          )}

          <StockDetailSheet
            key={stockDetail ? `${stockDetail.market}_${stockDetail.symbol}` : "none"}
            open={Boolean(stockDetail)}
            holding={stockDetail}
            isMobile={isMobileViewport}
            disabled={isWriteDisabled}
            onClose={() => setStockDetailId(null)}
          />

          <QuickExpenseSheet
            key={quickExpenseKey}
            open={isMobileViewport && isQuickExpenseOpen}
            onClose={() => setIsQuickExpenseOpen(false)}
            templates={usableExpenseTemplates}
            nameSuggestions={quickExpenseSuggestions}
            budgets={selectableBudgetOptions}
            quickCategories={quickExpenseCategories}
            allCategories={expenseCategoryRows}
            payerOptions={expensePayerOptions}
            defaults={quickExpenseDefaults}
            onSubmit={handleSubmitQuickExpense}
            onOpenFullForm={handleQuickExpenseFullForm}
            loading={loadingExpenseAction}
            disabled={isWriteDisabled}
          />

          <MobileFormSheetLayout
            title={
              expenseFormMode === "recurring-create"
                ? "新增定期支出"
                : editingExpenseEntry
                  ? editingExpenseEntry.entryType === "RECURRING"
                    ? "編輯定期支出"
                    : "編輯支出"
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
            submitDisabled={isWriteDisabled}
            submitText="儲存"
            onSubmit={handleSubmitExpense}
          >
            {expenseFormNode}
          </MobileFormSheetLayout>

          <MobileFormSheetLayout
            title={editingTemplate ? "編輯常用支出" : "新增常用支出"}
            open={isMobileViewport && isTemplateFormOpen}
            onClose={closeTemplateForm}
            loading={loadingTemplateAction}
            submitDisabled={isWriteDisabled}
            submitText="儲存"
            submitFormId={TEMPLATE_FORM_ID}
          >
            {isMobileViewport && expenseTemplateFormNode}
          </MobileFormSheetLayout>

          <Modal
            title={editingTemplate ? "編輯常用支出" : "新增常用支出"}
            open={!isMobileViewport && isTemplateFormOpen}
            onCancel={() => {
              if (!loadingTemplateAction) closeTemplateForm();
            }}
            confirmLoading={loadingTemplateAction}
            okButtonProps={{
              disabled: isWriteDisabled,
              htmlType: "submit",
              form: TEMPLATE_FORM_ID,
            }}
            okText="儲存"
            destroyOnHidden
          >
            {!isMobileViewport && expenseTemplateFormNode}
          </Modal>

          <MobileFormSheetLayout
            title={editingCategory ? "編輯分類" : "新增分類"}
            open={isMobileViewport && isCategorySheetOpen}
            onClose={() => {
              setIsCategorySheetOpen(false);
              setEditingCategory(null);
              categoryForm.resetFields();
            }}
            loading={loadingCategoryAction}
            submitDisabled={isWriteDisabled}
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
            submitDisabled={isWriteDisabled}
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
                  ? editingExpenseEntry.entryType === "RECURRING"
                    ? "編輯定期支出"
                    : "編輯支出"
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
            okButtonProps={{ disabled: isWriteDisabled }}
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
            okButtonProps={{ disabled: isWriteDisabled }}
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
            okButtonProps={{ disabled: isWriteDisabled }}
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
