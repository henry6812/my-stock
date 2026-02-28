import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App as AntdApp, ConfigProvider } from "antd";
import { registerSW } from "virtual:pwa-register";
import "antd/dist/reset.css";
import "./index.css";
import App from "./App";

const updateSW = registerSW({
  onNeedRefresh() {
    updateSW(true);
  },
  onOfflineReady() {
    console.log("App is ready for offline usage.");
  },
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#44A194",
          colorPrimaryHover: "#55b0a4",
          colorPrimaryActive: "#307c72",
          borderRadius: 10,
          fontFamily:
            "PingFang TC, Noto Sans TC, -apple-system, Segoe UI, sans-serif",
        },
      }}
    >
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
);
