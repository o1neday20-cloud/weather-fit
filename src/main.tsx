import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
import { Logger } from "./app/utils/logger";

// 앱 시작 시 customer 테이블에 자동 등록 (없으면 INSERT, 있으면 UPDATE)
Logger.ensureCustomer();

createRoot(document.getElementById("root")!).render(<App />);
