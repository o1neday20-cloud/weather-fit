import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
import { Logger } from "./app/utils/logger";

// 앱 시작 시 customer 테이블에 자동 등록 (없으면 INSERT, 있으면 UPDATE)
Logger.ensureCustomer();

// 팀원 색상 API 조회 및 캐시 (옷장 color_id 매핑용)
fetch('http://210.104.76.135:8080/api/colors')
  .then(res => res.ok ? res.json() : Promise.reject())
  .then(data => localStorage.setItem('partnerColors', JSON.stringify(data)))
  .catch(() => {});

createRoot(document.getElementById("root")!).render(<App />);
