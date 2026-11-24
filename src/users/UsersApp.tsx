import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { listUsers, messageOf, type UserRecord } from "../core/api";
import { previewUsers } from "../auth/preview";
import UserList from "./UserList";
import UserFormPage from "./UserForm";
import Toasts, { type Toast, type ToastTone } from "./Toasts";
import "./users.css";

/** User Access: the list at `/users`, the form at `/users/new` and `/users/:uid/edit`. The list is loaded once and shared. */
export default function UsersApp() {
  const [users, setUsers] = useState<UserRecord[]>(() => previewUsers() ?? []);
  const [loading, setLoading] = useState(() => previewUsers() == null);
  const [error, setError] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((items) => items.filter((item) => item.id !== id)), []);
  const toast = useCallback((tone: ToastTone, text: string) => {
    const id = nextId.current++;
    setToasts((items) => [...items.slice(-2), { id, tone, text }]);
    window.setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4500);
  }, [dismiss]);
  const reload = useCallback(async () => {
    if (previewUsers()) return;
    setLoading(true);
    try { setUsers((await listUsers()).users); setError(""); } catch (cause) { setError(messageOf(cause, "Users could not be loaded.")); } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    if (previewUsers()) return;
    let active = true;
    listUsers().then((result) => { if (active) { setUsers(result.users); setLoading(false); } }, (cause: unknown) => { if (active) { setError(messageOf(cause, "Users could not be loaded.")); setLoading(false); } });
    return () => { active = false; };
  }, []);

  const shared = { users, loading, error, reload, toast };
  return <>
    <Routes>
      <Route index element={<UserList {...shared} />} />
      <Route path="new" element={<UserFormPage {...shared} />} />
      <Route path=":uid/edit" element={<UserFormPage {...shared} />} />
      <Route path="*" element={<Navigate to="/users" replace />} />
    </Routes>
    <Toasts items={toasts} dismiss={dismiss} />
  </>;
}
