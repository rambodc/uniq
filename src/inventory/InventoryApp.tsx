import { Route, Routes } from "react-router-dom";
import Today from "./Today";
import IssueDetail from "./IssueDetail";
import { WellDetail, Wells } from "./Wells";
import { TicketDetail, Tickets } from "./Tickets";
import Warehouses from "./Warehouses";
import Ask from "./Ask";
import Unmatched from "./Unmatched";

export default function InventoryApp() {
  return <Routes>
    <Route index element={<Today />} />
    <Route path="issues/:issueId" element={<IssueDetail />} />
    <Route path="wells" element={<Wells />} />
    <Route path="wells/:wellId" element={<WellDetail />} />
    <Route path="tickets" element={<Tickets />} />
    <Route path="tickets/:ticketId" element={<TicketDetail />} />
    <Route path="warehouses" element={<Warehouses />} />
    <Route path="unmatched" element={<Unmatched />} />
    <Route path="ask" element={<Ask />} />
  </Routes>;
}
