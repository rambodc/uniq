import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createFluidLabProject,
  deleteProject,
  listProjects,
  type Project,
} from "./projects";

export default function FluidLabHome() {
  const navigate = useNavigate(),
    [projects, setProjects] = useState<Project[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    void listProjects("fluidlab")
      .then(setProjects)
      .catch(() => setError("FluidLab projects could not be loaded."));
  }, []);
  const create = async () => {
    const name = prompt("Project name");
    if (!name?.trim()) return;
    const project = await createFluidLabProject(name.trim());
    navigate(`/apps/fluidlab/projects/${project.id}`);
  };
  const remove = async (project: Project) => {
    if (!confirm(`Permanently delete “${project.name}”?`)) return;
    await deleteProject(project.id, "fluidlab");
    setProjects((items) => items.filter((item) => item.id !== project.id));
  };
  return (
    <main className="miniapp-page">
      <div className="miniapp-heading">
        <div>
          <span className="miniapp-eyebrow">Mini app</span>
          <h1>FluidLab</h1>
        </div>
        <button className="portal-button" onClick={() => void create()}>
          New project
        </button>
      </div>
      {error && <p className="portal-error">{error}</p>}
      <section className="portal-panel">
        <h2>Your projects</h2>
        {projects.length ? (
          projects.map((project) => (
            <article className="project-row" key={project.id}>
              <button
                onClick={() =>
                  navigate(`/apps/fluidlab/projects/${project.id}`)
                }
              >
                <b>{project.name}</b>
                <span>
                  Updated {new Date(project.updatedAt).toLocaleString()}
                </span>
              </button>
              <button onClick={() => void remove(project)}>Delete</button>
            </article>
          ))
        ) : (
          <p>No FluidLab projects yet.</p>
        )}
      </section>
    </main>
  );
}
