import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createFluidProgramsProject,
  deleteProject,
  listProjects,
  type Project,
} from "../fluidlab/projects";

export default function FluidProgramsHome() {
  const navigate = useNavigate(),
    [projects, setProjects] = useState<Project[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    void listProjects("fluid-programs")
      .then(setProjects)
      .catch(() => setError("Fluid Programs projects could not be loaded."));
  }, []);
  const create = async () => {
    const project = await createFluidProgramsProject(
      `Fluid Programs · ${new Date().toLocaleDateString()}`,
    );
    navigate(`/apps/fluid-programs/projects/${project.id}`);
  };
  const remove = async (project: Project) => {
    if (!confirm(`Permanently delete “${project.name}”?`)) return;
    await deleteProject(project.id, "fluid-programs");
    setProjects((items) => items.filter((item) => item.id !== project.id));
  };
  return (
    <main className="miniapp-page">
      <div className="miniapp-heading">
        <div>
          <span className="miniapp-eyebrow">Mini app</span>
          <h1>Fluid Programs</h1>
        </div>
        <button className="portal-button" onClick={() => void create()}>
          New conversation
        </button>
      </div>
      {error && <p className="portal-error">{error}</p>}
      <section className="portal-panel">
        <h2>Your conversations</h2>
        {projects.length ? (
          projects.map((project) => (
            <article className="project-row" key={project.id}>
              <button
                onClick={() =>
                  navigate(`/apps/fluid-programs/projects/${project.id}`)
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
          <p>No conversations yet.</p>
        )}
      </section>
    </main>
  );
}
