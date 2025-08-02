document.addEventListener("DOMContentLoaded", () => {
  // Sidebar functionality
  const sidebar = document.querySelector(".sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const navLinks = document.querySelectorAll(".nav-link");

  // Mobile sidebar toggle
  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");

      // Add overlay for mobile
      let overlay = document.querySelector(".sidebar-overlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "sidebar-overlay";
        document.body.appendChild(overlay);
      }

      if (sidebar.classList.contains("open")) {
        overlay.classList.add("active");
        overlay.addEventListener("click", closeSidebar);
      } else {
        overlay.classList.remove("active");
      }
    });
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    const overlay = document.querySelector(".sidebar-overlay");
    if (overlay) {
      overlay.classList.remove("active");
    }
  }

  // Smooth scrolling for navigation links
  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetId = link.getAttribute("href").substring(1);
      const targetSection = document.getElementById(targetId);

      if (targetSection) {
        targetSection.scrollIntoView({ behavior: "smooth" });

        // Update active link
        navLinks.forEach((l) => l.classList.remove("active"));
        link.classList.add("active");

        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
          closeSidebar();
        }
      }
    });
  });

  // Update active link on scroll
  window.addEventListener("scroll", () => {
    const sections = document.querySelectorAll(
      "section[id], div[id], div[data-section]"
    );
    const scrollPos = window.scrollY + 100;

    sections.forEach((section) => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.offsetHeight;
      const sectionId =
        section.getAttribute("id") || section.getAttribute("data-section");

      if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
        navLinks.forEach((link) => {
          link.classList.remove("active");
          if (link.getAttribute("href") === `#${sectionId}`) {
            link.classList.add("active");
          }
        });
      }
    });
  });

  // Projects functionality
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
