import { Route, Routes } from "react-router-dom";
import { BoardProvider } from "./boardState";
import MovePage from "./MovePage";
import WellPage from "./WellPage";
import XpressBoard from "./XpressBoard";
import "./xpress.css";

export default function InventoryApp() {
  return <BoardProvider>
    <Routes>
      <Route index element={<XpressBoard />} />
      <Route path="well/:cardId" element={<WellPage />} />
      <Route path="move/:ticketId" element={<MovePage />} />
    </Routes>
  </BoardProvider>;
}
