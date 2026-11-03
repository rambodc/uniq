import { Navigate, Route, Routes } from "react-router-dom";
import OlderList from "./OlderList";
import ReportPage from "./ReportPage";
import WellView from "./WellView";
import "./wells.css";

export default function WellsApp() {
  return <Routes>
    <Route index element={<OlderList />} />
    <Route path="older/:wellId/reports/:reportId" element={<ReportPage />} />
    <Route path="older/:wellId" element={<WellTabRedirect />} />
    <Route path="older/:wellId/:tab" element={<WellView />} />
  </Routes>;
}

function WellTabRedirect() {
  return <Navigate to="properties" replace />;
}
