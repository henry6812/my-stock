---
name: 我的資產
description: 家庭共用的資產與家計簿 PWA。安靜的帳本，會動的存錢罐。
colors:
  action: "#1F2328"
  action-hover: "#353B43"
  action-active: "#121417"
  teal: "#2B7F74"
  teal-hover: "#33907F"
  teal-bright: "#44A194"
  teal-soft: "#E4F1EE"
  teal-tint: "#A9D3CB"
  teal-ink: "#1E5E56"
  ink: "#1C1F23"
  muted: "#5E646B"
  subtle: "#868C93"
  paper: "#F5F6F7"
  surface: "#FFFFFF"
  line: "#E3E5E8"
  line-strong: "#CDD1D6"
  neutral-fill: "#EFF1F3"
  track: "#E8EBEE"
  up: "#237804"
  down: "#CF1322"
  warn: "#D48806"
  warn-ink: "#A36100"
typography:
  display:
    fontFamily: "'PingFang TC', 'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "38px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.8px"
    fontFeature: "tnum"
  title:
    fontFamily: "'PingFang TC', 'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "20px"
    fontWeight: 600
  subhead:
    fontFamily: "'PingFang TC', 'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 600
    fontFeature: "tnum"
  body:
    fontFamily: "'PingFang TC', 'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    fontFeature: "tnum"
  label:
    fontFamily: "'PingFang TC', 'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  sheet: "20px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  section: "40px"
  section-head: "12px"
  row-x: "16px"
  row-y: "16px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 18px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-primary-active:
    backgroundColor: "{colors.action-active}"
  button-icon-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    size: "28px"
  button-icon-ghost-hover:
    backgroundColor: "{colors.neutral-fill}"
    textColor: "{colors.ink}"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: "36px"
    padding: "0 14px"
  chip-selected:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
  fab:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    size: "52px"
  tabbar:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    height: "52px"
    padding: "8px 10px"
  tabbar-item-selected:
    backgroundColor: "{colors.track}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "44px"
  list-group:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  list-group-heading:
    backgroundColor: "{colors.neutral-fill}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    padding: "6px 12px"
  progress-track:
    backgroundColor: "{colors.track}"
    rounded: "{rounded.pill}"
    height: "8px"
  keypad-key:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    height: "52px"
  keypad-key-save:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
  bottom-sheet:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sheet}"
    padding: "16px"
---

# Design System: 我的資產

## Overview

**Creative North Star: "安靜的帳本，會動的存錢罐"（The Quiet Ledger, the Living Jar）**

介面的預設狀態是一本安靜的家用帳本：冷灰紙色的底、炭黑的控制項、細線分隔、平面的元件，畫面上唯一大聲的東西是置中的大數字。打開 App 的人要在幾秒內讀到「全家有多少錢、這個月花了多少」，所以外框退後，數字向前。

帳本裡只住一種有生命的東西：存錢的主角。資產頁的淨資產罐（淡底色的罐身，前後兩層水波、漲跌色帶、突破千萬的氣泡）、支出頁的存錢塔與累計成長塔（磚塊堆疊、超支時碎裂掉落）、可點的月份長條。它們是 App 情緒的核心，有實體感、會動、可互動；其餘一切都保持安靜。

密度偏手機單手：主要觸控目標 44px 以上，表單在底部 sheet 中完成，主導覽是浮在左下的膠囊 tab bar，記一筆支出的 FAB 在右下。桌面使用同一套元件，只是內容區最寬 1200px。

**Key Characteristics:**
- 中性冷灰撐起整個介面，所有 CTA 是炭黑（不是純黑）；teal 只留給存錢視覺，所以一出現就知道是「存下來的錢」。
- 大數字置中、粗體、等寬數字，是每個主頁的視覺錨點。
- 表面全平；只有浮在內容上方的東西（FAB、tab bar、overlay）有陰影。
- 每頁至多一個「存錢罐」級的主角視覺，擁有實體感與動畫。
- 所有金額使用 tabular-nums，欄位對齊。

### Named Rules
**The One Living Thing Rule.** 每個頁面最多一個有實體感、會動的主角，而且它必須在表現「錢存下來、錢累積」。其他元素一律安靜、平面、靜止。判斷新設計時問：「這是帳本，還是存錢罐？」答不出是存錢罐，就照帳本做。

**The Loud Number Rule.** 一個畫面只有一個 display 級的數字。次要數字降為 subhead 或 body，用顏色（漲跌）而不是字級表達差異。

## Colors

一組中性冷灰 + 炭黑 `action` 撐起介面；teal 是存錢視覺的專屬色；再加上三個只用於語意的狀態色。

### Action
- **Action** (`action`, #1F2328)：所有 CTA 與「可操作」的強調：primary 按鈕、FAB、選中的 chip、開關、存檔鍵、左滑「編輯」、focus 外框、連結（連結加底線區分）、選中的圖示格。炭黑而不是純黑，白字 15.8:1。
- **Action hover / active** (`action-hover`, `action-active`)：只用於 action 底元件的互動狀態。

### Savings（teal，只給存錢視覺）
Teal 不再是 UI 主色，只出現在表現「錢存下來、錢累積」的地方：淨資產罐的水、存錢塔與累計成長塔、月份長條與「累計」膠囊、hero 的「存下 N%」與圖例、淨資產走勢線。其他地方出現 teal 就是錯的。
- **Teal** (`teal`)：塔的磚塊、罐的前層水、選中的月份長條、「存下」文字與圖例。
- **Bright Teal** (`teal-bright`)：淨資產走勢線、突破千萬的光暈。
- **Teal Hover** (`teal-hover`)：累計成長塔的交錯層。
- **Teal Soft** (`teal-soft`)：月份長條的預設填色、存錢塔的「單筆」部分、累計成長塔當月層。
- **Teal Tint** (`teal-tint`)：存錢塔的「定期」部分與碎片、罐的後層水。
- **Teal Ink** (`teal-ink`)：存錢視覺旁的深色字（選中的月份數字、圖例 chip）。

### Neutral
- **Ink** (`ink`)：主要文字與大數字。中性略冷，不用純黑。
- **Muted** (`muted`)：次要文字、表頭、未選中的 tab、hero 標籤、匯率、時間戳。在 paper、surface、neutral-fill、track 上都 ≥5:1。
- **Subtle** (`subtle`)：只在 ≥3:1 就夠的地方：大字（hero 幣別符號）、停用狀態、非文字標記。需要被讀的小字一律用 `muted`。
- **Paper** (`paper`)：App 背景。
- **Surface** (`surface`)：卡片、列表、sheet、tab bar 的底。
- **Line / Line Strong** (`line`, `line-strong`)：分隔線與元件邊框；`line-strong` 用在可點的 chip 與輸入框邊框。
- **Neutral Fill** (`neutral-fill`)：列表分組標題底、預設 tag 底、info 提示底、圖示按鈕 hover 底、分類圖示 tile、按鍵按壓。
- **Track** (`track`)：進度條與 Segmented 的軌道、tab bar 選中項、記帳時的閃爍回饋。

### Semantic
- **Up** (`up`)：漲、收入、盈餘為正。
- **Down** (`down`)：跌、超支、刪除動作。
- **Warn** (`warn`)：接近預算上限的填色、需要注意的動作（例如停用）。
- **Warn Ink** (`warn-ink`)：warn 當文字時用這個；`warn` 本身在白底上只有 2.9:1。

狀態提示（Alert）的淺底與邊框另外在 `src/theme/tokens.js` 的 `antdTheme` 指定，因為 antd 從深色品牌色自動推導的底色會發濁。

### Data & Identity Palettes
不屬於 UI 色，但同樣是 token，定義在 `src/theme/tokens.js`：
- **`CHART_PALETTE`**：圖表類別色，石板灰為第一色，其餘是沉穩的色相（藍、赭、梅、苔綠⋯），不含 teal；`CHART_NEUTRAL` 保留給「其他 / 現金」。個股的 EPS / 本益比圖用 `action`。預算條平時為 `muted`，接近上限 `warn`、超支 `down`。
- **`HOLDER_TONES`**：holder tag 的五組字色 + 底色，依 holder 在設定中的順序分配，保證兩人不撞色；teal 那組排在最後，避免 teal 出現在存錢視覺以外。holder tag 是唯一保留彩色的 tag，因為一眼分出是誰的資產就是它的用途。

### Named Rules
**The Saved-Money Color Rule.** Teal 只代表「存下來的錢」。可操作的強調用炭黑 `action` 或字重，不要用 teal，也不要引入新色相。

**The Semantic-Only Rule.** `up` / `down` / `warn` 只表達財務或動作的語意（漲跌、超支、危險），不當裝飾色使用。

**The Readable-Grey Rule.** 小字（≤16px）的灰只用 `muted`。`subtle` 對比只有 3:1，只留給大字、停用狀態與非文字元素。

## Typography

**Body Font:** PingFang TC（Apple 裝置），Noto Sans TC 為後備，再退到系統 sans-serif。全站單一字族，不另載 web font。

**Character:** 系統繁中黑體，乾淨、可靠、不搶戲；個性完全交給數字的字重與大小。`body` 全域開啟 `font-variant-numeric: tabular-nums`，金額欄位天然對齊。

### Hierarchy
- **Display**（700，38px，行高 1.15，字距 -0.8px，`--fs-display`）：每頁唯一的大數字（淨資產、本月總支出）。所有寬度都同一級。
- **Title**（600，20px）：數字鍵盤按鍵、sheet 中的金額輸入、少數區塊標題。
- **Subhead**（600，16px）：列表中的主要金額（預算剩餘、持股市值）、卡片標題。
- **Body**（400–500，14px）：預設文字、chip、表單。
- **Label**（400–600，12px）：時間戳、分組標題、tab bar 文字、tag、次要 meta。

### Named Rules
**The Weight-Not-Size Rule.** 在 body 與 subhead 之間，用 600 字重而不是新字級拉出層級。hero 的次要行用 body 600，不另開 13px。

## Layout

手機優先、單欄。內容區 `padding: 20px`，桌面最寬 1200px 置中。唯一的 breakpoint 是 **768px**：以下為手機版型（底部 tab bar、bottom sheet 表單、較小的 display 數字）。

主頁結構固定為：置中的 hero（標籤 → 大數字 → 一行次要資訊 → 主角視覺），下方接列表區塊。Hero 寬度上限 420px。

間距以 4px 為基數：`--space-1` 到 `--space-10`（4 / 8 / 12 / 16 / 20 / 24 / 32 / 40px）。版面用四個語意角色，**支出頁是這套間距的標準樣板**，其他頁面調整時照它對齊：

- **`--space-section`（40px）**：頁面區塊之間（hero、預算、支出列表、定期支出、支出分析彼此的距離）。
- **`--space-section-head`（12px）**：區塊標題到它的內容。
- **`--space-row-x` / `--space-row-y`（16px / 16px）**：列表列的左右與上下內距；一般列最少 72px 高。
- **Hero 內部**：上 24px；數字 → 主角視覺 20px；主角視覺 → 月份長條 24px。

寬鬆的節奏來自「區塊之間大、區塊內部緊」的對比：區塊距離是標題距離的三倍以上。新寫的 CSS 用 `var(--space-*)`，不寫 px；5、10、14、18px 這類刻度外的值是待收斂的偏差（其他頁面還留有一些）。

觸控：手機上所有輸入框、選單項目、主要按鈕最小高度 44px；`(hover: none)` 時移除 hover 樣式，避免 sticky hover。尊重 `env(safe-area-inset-bottom)`。

## Elevation & Depth

平面為主。深度用色階表達：`paper` 底上放 `surface` 白卡，以 `line` 細線分隔；列表分組用 `neutral-fill` 標題列區隔，而不是陰影。

### Shadow Vocabulary
- **Float**（`box-shadow: 0 8px 24px rgba(27, 43, 41, 0.14)`）：浮在內容之上的東西：FAB、底部 tab bar、dropdown / modal 等 overlay。
- **Float hover**（`box-shadow: 0 10px 28px rgba(27, 43, 41, 0.2)`）：只用於 FAB 的 hover / focus。

### Named Rules
**The Only-Floating-Things-Cast-Shadows Rule.** 按鈕、卡片、列表、輸入框在任何狀態下都沒有陰影（antd 的 button shadow 已在 theme 關掉）。會有陰影的只有真的浮在內容上方的元件。

## Shapes

柔和但不圓潤：一般控制項 8px，容器 12px，從底部升起的 sheet 頂角 20px，可點的膠囊（chip、tab bar、FAB、進度條）用 pill。邊框一律 1px，顏色 `line` 或 `line-strong`。列表容器 `overflow: hidden` 讓內部分隔線貼齊圓角。

## Components

### Buttons
冷靜、平面、清楚可點。
- **Shape:** 柔和圓角 (8px)。
- **Primary:** `action` 炭黑底白字；在 bottom sheet 中最小高度 44px、左右 18px。
- **Hover / Active:** 只換底色（`action-hover` / `action-active`），沒有陰影、沒有位移。觸控裝置不顯示 hover。
- **Icon ghost:** 透明底、`muted` 圖示；hover / focus 時 `neutral-fill` 底 + `ink` 圖示；危險動作 hover 時為淡紅底 + `down`。標題旁的「新增」小按鈕是 28px 的同款。
- **Focus:** 全域 `:focus-visible` 為 2px `action` outline、offset 2px。文字選取為 `ink` 底白字，游標為 `action`。
- **Link:** `action` 色加 1px 底線（offset 3px），因為不再靠顏色區分。

### Chips
- **Style:** 白底、`line-strong` 1px 邊框、pill 圓角、body 字級，高 32–36px。
- **Selected:** `action` 底、`action` 邊、白字。用於快速選日期、類別、名稱。

### Cards / Containers
- **Corner Style:** 12px。
- **Background:** `surface` 白，放在 `paper` 底上。
- **Shadow Strategy:** 無（見 Elevation）。
- **Border:** 1px `line`。
- **Internal Padding:** 列表列 `--space-row-y` / `--space-row-x`（16px）；卡片 antd 預設（標題 16px、透明標題底）。

### Lists
App 的主體是分組列表（支出依日分組、預算、定期支出、持股）。
- 白色圓角容器，組與組之間 1px `line`。
- 分組標題：`neutral-fill` 底、`muted` 12px 字，右側顯示該組小計（`ink`、600）。
- 列高最少 72px、內距 16px，左側名稱 + 次行 meta，右側金額（`ink` 600，持股與現金同一級）。
- 主名稱用家人自己的叫法：現金帳戶以別名（薪轉戶、房貸）為主、銀行全名為次行。
- 可點的列給一個精簡的 `aria-label`（例如「瑞鼎，市值 $X，今日跌 0.21%，查看個股」），不讓螢幕閱讀器念出整列。
- 手機上列可左滑出動作：`action`（編輯）、`warn`（停用）、`down`（刪除），白字 + 圖示 + 12px 標籤。這些按鈕一直在 tab 順序裡：取得焦點就滑開該列、焦點離開就收回，鍵盤與螢幕閱讀器不必滑動也能用。
- **漲跌：** 方向只標一次。箭頭（▲ / ▼）加 `up` / `down` 色，不再加正負號；同一列左邊放 %、右邊放金額，不重複。
- **類別 tag 只標非預設值**（ETF、債券）；預設的「個股」不顯示。

### Icons
圖示庫是 **`iconoir-react`**（線條、24 格線、圓角線頭），在 `main.jsx` 用 `IconoirProvider` 統一設定：1em 見方、線寬 1.5、預設 `aria-hidden`。
- **尺寸：** 三個尺寸 token 定義在 `src/index.css`（`--icon-sm` / `--icon-md` / `--icon-tile`）與 `tokens.js` 的 `ICON_SIZES`。預設 `--icon-sm`（16px，行內、按鈕、chevron、左滑動作）；tab bar、FAB、分類圖示用 `--icon-md`（20px）；分類圖示的圓底為 `--icon-tile`（36px）。CSS 對 svg 本身設 `font-size` 調整（預設值寫在 svg 上，只設父層不會生效），不另開尺寸。
- **線寬：** 一律 1.5，不依位置加粗或變細。
- **顏色：** 繼承文字色（`currentColor`），只用色彩 token；一般為 `muted`，可點的強調為 `ink`，左滑動作與 primary 按鈕上為白色。
- **分類圖示（Category Icon）：** 支出列左側 36px（`--icon-tile`）圓形 tile，`neutral-fill` 底 + `ink` 圖示；沒有分類時為白底、1px `line` 內框 + `muted`。分類可在表單裡自選 18 個圖示之一（存在分類的 `icon` 欄位）；沒選時依名稱的關鍵字自動對應（`src/utils/categoryIcons.js`），對不到用通用的 `Label`。支出列與設定頁的類別列表都顯示這個 tile。純裝飾：分類名稱仍寫在列上。
- **圖示選擇器（Category Icon Picker）：** 分類表單中 6 欄的 44px 圓形按鈕（`aria-pressed`），平時白底 `line` 邊 + `muted` 圖示，選中為 `neutral-fill` 底、`action` 邊、`ink` 圖示。沒自選時標示依名稱對應的那個，下方以 `muted` 12px 註明「依名稱自動選擇」；自選後換成「改回依名稱自動選擇」連結。
- **無障礙：** 單獨傳達意義的圖示（例如名稱前的「定期支出」標記）加 `aria-hidden={false} role="img" aria-label`；純圖示按鈕把 `aria-label` 放在按鈕上。
- **例外：** antd 元件內建的圖示（DatePicker、Select 箭頭、Modal ×）沿用 antd；載入中的轉圈仍用 antd `LoadingOutlined`。我們自己的 code 不再從 `@ant-design/icons` import 其他圖示。

### Analysis List
支出頁的「支出分析」與資產頁的「資產分析」用同一個框線列表（`.analysis-*`）：每列一種分析，名稱 + 一句重點 + chevron，點開在 modal 顯示完整圖表；頁面上不放縮圖卡片。重點句不能和頁面上其他數字打架（例如走勢的區間起點不是昨收，就不寫一個和 hero「今日」不同的漲跌金額）。分配類圖表在 modal 裡是甜甜圈 + 附金額與占比的列表，不用彩色字當圓餅標籤。

### Inputs / Fields
- **Style:** antd 預設外框，邊框 `line-strong`、8px 圓角；手機 sheet 中最小高度 44px。
- **Focus:** antd `action` 邊框。
- iOS 上會觸發輸入的元素字級至少 16px，避免自動放大。

### Navigation
- **Mobile tab bar:** 浮在左下的白色膠囊（94% 不透明 + 8px backdrop blur）、1px `line` 邊、Float 陰影。內含 Segmented：20px 圖示在上、12px 文字在下，選中項為 `track` 底膠囊 + `ink` 字。
- **主分頁切換:** 用 View Transitions 做左右推頁（500ms，`cubic-bezier(0.32, 0.72, 0, 1)`）；header、tab bar、FAB 不參與滑動。
- **Header:** 透明背景 + blur，三欄 grid：左空、中 logo（32px）、右同步狀態。

### Bottom Sheet
手機上所有表單都在從底部升起的 sheet 中完成：頂角 20px、高 90vh、標題下 1px 分隔線；內容區可捲動，底部動作列固定，以 `line` 分隔並避開 safe area。

### Quick Expense Keypad（signature）
記一筆支出的專屬輸入：4 欄格狀數字鍵盤，鍵與鍵之間 1px `line` 縫，每鍵最少 52px 高、20px 等寬數字。儲存鍵為 `action` 底白字、按壓時 `action-active`；不可用時變 `line-strong`；儲存中保持 `action` + spinner，其他鍵轉 `subtle` 表示鎖定。

### Savings Hero（signature：存錢罐）
兩個主頁的主角，遵守 The One Living Thing Rule：
- **資產頁：** 標籤（`muted` 14px）→ display 淨資產 → 漲跌一行（`up` / `down`，body 600）→ 淨資產罐（可點）。罐身只是一塊 `track` 底色，不畫外框、玻璃反光與刻度；頂端容量（如「2000萬」）平時隱藏，點擊切到里程碑時才以 180ms 淡入，再點一次或點其他地方就收回。沒有水（總資產為 0）時容量常駐。之後依序是持股列表 → 銀行現金 → 資產分析（現值走勢、資產類型、台股 / 美股），區塊間距 `--space-section`；分析和支出頁一樣放在最後。
- **支出頁：** 標籤「時間・指標」→ display 總支出（主數字固定是總支出）→ 一行次要說明「存下 N%」，已結束的月份再接「・比上月多存／少存 $X」→ 存錢塔 / 累計成長塔 → 塔的圖例（存下／定期／單筆，每個都是 44px 高的切換鈕，等同點塔的那一段，也是鍵盤與螢幕閱讀器的路徑）→ 月份長條與「累計」膠囊。
- **月份長條：** 每月一欄，欄寬至少 24px、高 84px，整欄都是點擊區；長條下方標月份數字（12px），當月數字 `ink` 600，選中的長條實心 teal、數字 `teal-ink`；未來月份為虛線框。「累計」膠囊視覺小，但點擊區延伸到 44px。
- 存錢塔進場（堆疊 → 停頓 → 敲磚碎裂）總長約一秒多：塔在敲完之前顯示的存下比實際多，所以不能拖長。超支坑用 ease-out（`cubic-bezier(0.16, 1, 0.3, 1)`），不回彈。
- 切換內容時 180ms 淡入；`prefers-reduced-motion` 下關閉所有罐、塔動畫。
- 規格來源：`docs/superpowers/specs/2026-10-07-expense-summary-card-design.md`。

### Expense Tab Order
支出頁由上而下：hero → 預算（最急的在前；桌面為自動換行的網格，不橫向捲動）→ 支出列表 → 定期支出 → 支出分析，區塊間距 `--space-section`。支出分析是參考資料，放在最後，樣式見 Analysis List。

### Budget Bar
8px pill 進度條：`track` 軌道；已花為實色，本期尚未扣款的定期支出為同色 35% 透明；一條 2px `ink`（60%）細線標示「本期已過多久」，超過細線代表花得比進度快。

## Do's and Don'ts

以下只列從現有實作確認的做法。系統級禁令（例如是否全面禁止漸層、圖表配色限制、主色命名）尚待討論，確定後再補進 Don't。

### Do:
- **Do** 只使用 frontmatter / `src/theme/tokens.js` 中的 token；CSS 中以 `var(--c-*)`、`var(--fs-*)`、`var(--radius-*)`、`var(--space-*)` 取用。
- **Do** 區塊之間用 `--space-section`，區塊標題到內容用 `--space-section-head`，列表列用 `--space-row-*`。
- **Do** 每頁只放一個 display 級大數字，並置中於 hero。
- **Do** 所有金額使用 tabular-nums。
- **Do** 手機上可點目標至少 44px，表單放在 bottom sheet。
- **Do** 讓陰影只出現在 FAB、tab bar、overlay。
- **Do** 為所有動畫提供 `prefers-reduced-motion` 關閉路徑。
- **Do** 漲跌、超支、警示只用 `up` / `down` / `warn`。
- **Do** 圖示只用 `iconoir-react`，尺寸只用 `--icon-sm` / `--icon-md`。
- **Do** 所有 CTA、選中狀態、focus 用炭黑 `action`；teal 只用在存錢視覺。

### Don't:
- **Don't** 在按鈕、卡片、列表上加陰影。
- **Don't** 在同一頁放第二個會動的主角視覺（The One Living Thing Rule）。
- **Don't** 新增刻度外的字級或間距（5、10、14、18px 這類）；需要新刻度先更新 token。
- **Don't** 用 `subtle` 寫需要被讀的小字。
- **Don't** 用回彈 / overshoot 的 easing。
- **Don't** 把 teal 用在按鈕、chip、連結、tag、圖示等非存錢的元素上；也不要用純黑 `#000`。
- **Don't** 在同一處混用 antd 與 iconoir 圖示，或為了裝飾到處加圖示；圖示要幫助辨識（分類、動作、導覽）。
