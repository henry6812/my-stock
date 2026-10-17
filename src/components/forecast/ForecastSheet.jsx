import { Drawer, Typography } from "antd";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import { formatDateTime, formatTwd } from "../../utils/formatters";
import { FORECAST_INCOMPLETE_TEXT, getFiHeadline } from "../../utils/forecast";
import ForecastAssumptions from "./ForecastAssumptions";
import ForecastChart from "./ForecastChart";
import ForecastWhatIf from "./ForecastWhatIf";

const { Text } = Typography;

// 財務預估: a bottom sheet on mobile, a right-hand drawer on desktop (same
// frame as the stock detail sheet). The FI year is the one display number.
// `forecast` is useForecast's result.
function ForecastSheet({
  open,
  isMobile,
  onClose,
  forecast,
  disabled = false,
  onSaveSettings,
  priceDataStale = false,
  quoteAt = null,
}) {
  useBodyScrollLock(Boolean(open) && isMobile);
  const { base, whatIf, assumptions, auto, start, horizonYears } = forecast;

  const handleHorizonChange = (years) => {
    forecast.setHorizonYears(years);
    if (!disabled) onSaveSettings?.({ horizonYears: years });
  };

  return (
    <Drawer
      placement={isMobile ? "bottom" : "right"}
      title="財務預估"
      open={open}
      onClose={onClose}
      size={isMobile ? "90vh" : 520}
      destroyOnHidden
      className={isMobile ? "form-bottom-sheet stock-detail-sheet" : "stock-detail-sheet"}
    >
      <div className="forecast-sheet">
        <section className="forecast-hero">
          {base ? (
            <>
              <span className="forecast-hero-label">財務自由</span>
              <span className="forecast-hero-number">{getFiHeadline(base)}</span>
              <span className="forecast-hero-meta">
                {`${horizonYears} 年後總資產 ${formatTwd(base.endTotalTwd)}`}
              </span>
              {base.thresholdTwd !== null && (
                <Text type="secondary" className="forecast-hero-caption">
                  {`門檻 ${formatTwd(base.thresholdTwd)}（年支出 ÷ 提領率）`}
                </Text>
              )}
            </>
          ) : (
            <span className="forecast-hero-meta">{FORECAST_INCOMPLETE_TEXT}</span>
          )}
          {priceDataStale && quoteAt && (
            <Text type="warning" className="forecast-hero-caption">
              {`報價時間 ${formatDateTime(quoteAt)}，可能不是最新`}
            </Text>
          )}
        </section>

        {base && (
          <section className="stock-detail-section">
            <h3 className="stock-detail-heading">預估走勢</h3>
            <ForecastChart
              base={base}
              whatIf={whatIf}
              horizonYears={horizonYears}
              onHorizonChange={handleHorizonChange}
            />
          </section>
        )}

        {base && (
          <section className="stock-detail-section">
            <h3 className="stock-detail-heading">如果…</h3>
            <ForecastWhatIf
              assumptions={assumptions}
              knobs={forecast.knobs}
              onChange={forecast.setKnobs}
              onReset={forecast.resetKnobs}
              diffText={forecast.diffText}
            />
          </section>
        )}

        <section className="stock-detail-section">
          <h3 className="stock-detail-heading">假設</h3>
          <ForecastAssumptions
            assumptions={assumptions}
            auto={auto}
            start={start}
            disabled={disabled}
            isMobile={isMobile}
            onSave={onSaveSettings}
          />
        </section>

        <Text type="secondary" className="forecast-footnote">
          以今日幣值計算，假設收入與支出隨通膨成長；不構成投資建議。
        </Text>
      </div>
    </Drawer>
  );
}

export default ForecastSheet;
