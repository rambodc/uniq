import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { inventoryBotLinkAppWell, inventoryBotMimBoard, inventoryBotMoveTicket, inventoryBotOpenMimWell, inventoryBotOpenXpressWell, inventoryBotXpressBoard, messageOf, type OpenXpressWell, type XpressBoard } from "../core/api";
import { previewInventory } from "../auth/preview";

export type BoardSource = "xpress" | "mim";

type BoardState = {
  source: BoardSource;
  home: string;
  board: XpressBoard | null;
  error: string;
  reload: () => Promise<void>;
  preview: boolean;
  openWell: (cardId: string) => Promise<OpenXpressWell>;
  linkWell: (cardId: string, appWellId: string, appWellName: string) => Promise<void>;
  moveTicket: (ticketId: string, cardId: string) => Promise<void>;
};

const BoardContext = createContext<BoardState | null>(null);

export function BoardProvider({ source, children }: { source: BoardSource; children: ReactNode }) {
  const previewData = previewInventory();
  const sample = source === "mim" ? previewData?.mim : previewData?.xpress;
  const [board, setBoard] = useState<XpressBoard | null>(sample ?? null);
  const [error, setError] = useState("");
  const home = source === "mim" ? "/inventory-bot/mim" : "/inventory-bot";
  const load = source === "mim" ? inventoryBotMimBoard : inventoryBotXpressBoard;
  const openWell = source === "mim" ? inventoryBotOpenMimWell : inventoryBotOpenXpressWell;

  async function reload() {
    if (sample) return;
    try {
      setBoard(await load());
      setError("");
    } catch (cause) {
      setError(messageOf(cause, "Tickets could not be loaded."));
    }
  }

  useEffect(() => {
    if (sample) return;
    const fetchBoard = source === "mim" ? inventoryBotMimBoard : inventoryBotXpressBoard;
    let active = true;
    fetchBoard().then((result) => {
      if (!active) return;
      setBoard(result);
      setError("");
    }, (cause: unknown) => {
      if (!active) return;
      setError(messageOf(cause, "Tickets could not be loaded."));
    });
    return () => { active = false; };
  }, [sample, source]);

  return <BoardContext.Provider value={{
    source,
    home,
    board,
    error,
    reload,
    preview: Boolean(sample),
    openWell,
    linkWell: async (cardId, appWellId, appWellName) => { await inventoryBotLinkAppWell({ cardId, appWellId, appWellName, source }); },
    moveTicket: async (ticketId, cardId) => { await inventoryBotMoveTicket({ ticketId, cardId, source }); },
  }}>{children}</BoardContext.Provider>;
}

export function useBoard() {
  const value = useContext(BoardContext);
  if (!value) throw new Error("Inventory board is not available.");
  return value;
}
