document.addEventListener("DOMContentLoaded", () => {
  const projectsTrigger = document.querySelector(".projects-trigger");
  const projectsContainer = document.getElementById("projects-container");
  let projectsLoaded = false;

  if (projectsTrigger && projectsContainer) {
    projectsTrigger.addEventListener("click", async () => {
      if (!projectsLoaded) {
        try {
          const response = await fetch("pages/projects.html");
          const html = await response.text();
          projectsContainer.innerHTML = html;
          projectsLoaded = true;
          projectsContainer.classList.remove("hidden");
          projectsContainer.scrollIntoView({ behavior: "smooth" });
        } catch (error) {
          console.error("Error loading projects:", error);
          return;
        }
      }

      const projectsSection = document.querySelector(".projects");
      if (projectsSection) {
        projectsTrigger.classList.toggle("active");
        projectsSection.classList.toggle("visible");

        // Scroll to projects section when opening
        if (projectsSection.classList.contains("visible")) {
          projectsSection.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }
    });
  }
});
