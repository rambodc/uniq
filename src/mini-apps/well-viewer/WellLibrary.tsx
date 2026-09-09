import { useState } from "react";
import { FileUp, Pencil, Trash2 } from "lucide-react";
import type { useWellLibrary } from "./useWellLibrary";
import type { SavedWell } from "./library";

type Library = ReturnType<typeof useWellLibrary>;
const sizeLabel = (size: number) => size >= 1_000_000_000 ? "1 GB" : `${(size / 1_000_000).toFixed(size < 10_000_000 ? 1 : 0)} MB`;
function WellRow({ well, active, library }: { well: SavedWell; active: boolean; library: Library }) {
  const [editing, setEditing] = useState(false), [name, setName] = useState(well.name), [confirmDelete, setConfirmDelete] = useState(false);
  const busy = library.busyId === well.id;
  return <li className={`well-library-row${active ? " selected" : ""}`}>
    {editing ? <form onSubmit={(event) => { event.preventDefault(); void library.rename(well.id, name.trim()).then((saved) => { if (saved) setEditing(false); }); }}><label>Well name<input ref={(element) => { element?.focus(); }} maxLength={120} required value={name} onChange={(event) => setName(event.target.value)}/></label><div className="well-row-actions"><button disabled={busy || !name.trim()} type="submit">Save</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button></div></form> : <>
      <button className="well-library-select" disabled={busy} aria-current={active ? "true" : undefined} onClick={() => library.open(well.id)}><b>{well.name}</b><span title={well.originalName}>{well.originalName}</span><small>{sizeLabel(well.sizeBytes)} · {new Date(well.createdAt).toLocaleDateString()}</small></button>
      <div className="well-row-actions"><button disabled={Boolean(library.busyId)} aria-label={`Rename ${well.name}`} onClick={() => { setName(well.name); setEditing(true); setConfirmDelete(false); }}><Pencil/>Rename</button><button disabled={Boolean(library.busyId)} aria-label={`Delete ${well.name}`} onClick={() => setConfirmDelete(true)}><Trash2/>Delete</button></div>
    </>}
    {confirmDelete && <div className="well-delete-confirm" role="group" aria-label={`Confirm deletion of ${well.name}`}><p>Delete this well and its original ZIP? This cannot be undone.</p><button disabled={busy} onClick={() => { void library.remove(well.id).then((deleted) => { if (deleted) setConfirmDelete(false); }); }}>{busy ? "Deleting…" : "Delete permanently"}</button><button disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button></div>}
  </li>;
}
export default function WellLibrary({ library, selectedId, onUpload }: { library: Library; selectedId: string; onUpload: () => void }) {
  return <section className="well-library" aria-labelledby="my-wells-title">
    <header><div><span>Private library</span><h2 id="my-wells-title">My Wells</h2><p>Only wells you upload appear here.</p></div></header>
    <button className="well-upload" onClick={onUpload}><FileUp/>Upload well<span>ZIP · up to 1 GB</span></button>
    {library.listError && <div role="alert" className="well-library-message"><p>{library.listError}</p><button onClick={library.refresh}>Retry library</button></div>}
    {!library.listBusy && !library.listError && !library.wells.length && <p className="well-library-empty">Your saved wells will appear here. Upload an original well ZIP to begin.</p>}
    <ul aria-label="Your saved wells">{library.wells.map((well) => <WellRow key={well.id} well={well} active={well.id === selectedId} library={library}/>)}</ul>
    {library.listBusy && <p className="well-library-message" role="status">Loading your wells…</p>}
    {library.hasMore && <button className="well-load-more" disabled={library.listBusy} onClick={library.more}>Load more wells</button>}
  </section>;
}
