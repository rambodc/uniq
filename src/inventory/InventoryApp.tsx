import { Outlet, Route, Routes } from "react-router-dom";
import { BoardProvider, type BoardSource } from "./boardState";
import MovePage from "./MovePage";
import { AppWellPage, WarehousePage } from "./RigExtra";
import RigBoard from "./RigBoard";
import RigPage from "./RigPage";
import RigPickPage from "./RigPickPage";
import WellPage from "./WellPage";
import XpressBoard from "./XpressBoard";
import "./xpress.css";

function Scope({ source }: { source: BoardSource }) {
  return <BoardProvider source={source}><Outlet /></BoardProvider>;
}

export default function InventoryApp() {
  return <Routes>
    <Route index element={<RigBoard />} />
    <Route path="rig/:rigKey/merge" element={<RigPickPage mode="merge" />} />
    <Route path="rig/:rigKey" element={<RigPage />} />
    <Route path="move-well/:wellId" element={<RigPickPage mode="well" />} />
    <Route path="move-ticket/:ticketId" element={<RigPickPage mode="ticket" />} />
    <Route path="warehouse" element={<WarehousePage />} />
    <Route path="app-well/:wellId" element={<AppWellPage />} />
    <Route path="mim" element={<Scope source="mim" />}>
      <Route index element={<XpressBoard />} />
      <Route path="well/:cardId" element={<WellPage />} />
      <Route path="move/:ticketId" element={<MovePage />} />
    </Route>
  </Routes>;
}
