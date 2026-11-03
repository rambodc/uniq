import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { inventoryBotXpressBoard, messageOf, type XpressBoard } from "../core/api";
import { previewInventory } from "../auth/preview";

type BoardState = {
  board: XpressBoard | null;
  error: string;
  reload: () => Promise<void>;
  preview: boolean;
};

const BoardContext = createContext<BoardState | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const previewData = previewInventory();
  const [board, setBoard] = useState<XpressBoard | null>(previewData?.xpress ?? null);
  const [error, setError] = useState("");

  async function reload() {
    if (previewData?.xpress) return;
    try {
      setBoard(await inventoryBotXpressBoard());
      setError("");
    } catch (cause) {
      setError(messageOf(cause, "Xpress tickets could not be loaded."));
    }
  }

  useEffect(() => {
    if (previewData?.xpress) return;
    let active = true;
    inventoryBotXpressBoard().then((result) => {
      if (!active) return;
      setBoard(result);
      setError("");
    }, (cause: unknown) => {
      if (!active) return;
      setError(messageOf(cause, "Xpress tickets could not be loaded."));
    });
    return () => { active = false; };
  }, [previewData]);

  return <BoardContext.Provider value={{ board, error, reload, preview: Boolean(previewData?.xpress) }}>{children}</BoardContext.Provider>;
}

export function useBoard() {
  const value = useContext(BoardContext);
  if (!value) throw new Error("Inventory board is not available.");
  return value;
}
