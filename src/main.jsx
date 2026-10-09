import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App as AntdApp, ConfigProvider } from "antd";
import { IconoirProvider } from "iconoir-react";
import "./pwaUpdate";
import "antd/dist/reset.css";
import "./index.css";
import App from "./App";
import { antdTheme, iconoirDefaults } from "./theme/tokens";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ConfigProvider theme={antdTheme}>
      <IconoirProvider iconProps={iconoirDefaults}>
        <AntdApp>
          <App />
        </AntdApp>
      </IconoirProvider>
    </ConfigProvider>
  </StrictMode>,
);
