import { Outlet, Route, Routes } from "react-router-dom";
import { BoardProvider, type BoardSource } from "./boardState";
import MovePage from "./MovePage";
import WellPage from "./WellPage";
import XpressBoard from "./XpressBoard";
import "./xpress.css";

function Scope({ source }: { source: BoardSource }) {
  return <BoardProvider source={source}><Outlet /></BoardProvider>;
}

export default function InventoryApp() {
  return <Routes>
    <Route element={<Scope source="xpress" />}>
      <Route index element={<XpressBoard />} />
      <Route path="well/:cardId" element={<WellPage />} />
      <Route path="move/:ticketId" element={<MovePage />} />
    </Route>
    <Route path="mim" element={<Scope source="mim" />}>
      <Route index element={<XpressBoard />} />
      <Route path="well/:cardId" element={<WellPage />} />
      <Route path="move/:ticketId" element={<MovePage />} />
    </Route>
  </Routes>;
}
