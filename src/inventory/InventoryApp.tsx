import { Outlet, Route, Routes } from "react-router-dom";
import { BoardProvider, type BoardSource } from "./boardState";
import InvXpressPage from "./InvXpressPage";
import ProductUsagePage from "./ProductUsagePage";
import MovePage from "./MovePage";
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
    <Route index element={<InvXpressPage />} />
    <Route path="wells" element={<InvXpressPage view="wells" />} />
    <Route path="usage/:productKey?" element={<ProductUsagePage />} />
    <Route path="tickets" element={<RigBoard />} />
    <Route path="rig/:rigKey/merge" element={<RigPickPage mode="merge" />} />
    <Route path="rig/:rigKey/pair/:rowId" element={<RigPickPage mode="pair" />} />
    <Route path="rig/:rigKey" element={<RigPage />} />
    <Route path="move-ticket/:ticketId" element={<RigPickPage mode="move" />} />
    <Route path="mim" element={<Scope source="mim" />}>
      <Route index element={<XpressBoard />} />
      <Route path="well/:cardId" element={<WellPage />} />
      <Route path="move/:ticketId" element={<MovePage />} />
    </Route>
  </Routes>;
}
