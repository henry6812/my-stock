import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App as AntdApp, ConfigProvider } from "antd";
import zhTW from "antd/locale/zh_TW";
import dayjs from "dayjs";
import "dayjs/locale/zh-tw";
import { IconoirProvider } from "iconoir-react";
import "./pwaUpdate";
import "antd/dist/reset.css";
import "./index.css";
import App from "./App";
import { antdTheme, iconoirDefaults } from "./theme/tokens";

// Date pickers (calendar, placeholders) in zh-TW. Safe globally: no dayjs
// format here relies on English names (month bars use their own labels) and
// zh-tw keeps Sunday as the first day of the week.
dayjs.locale("zh-tw");

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ConfigProvider theme={antdTheme} locale={zhTW}>
      <IconoirProvider iconProps={iconoirDefaults}>
        <AntdApp>
          <App />
        </AntdApp>
      </IconoirProvider>
    </ConfigProvider>
  </StrictMode>,
);
