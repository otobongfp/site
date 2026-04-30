(function () {
  const BLOG_INDEX_PATH = "../content/blog/index.json";

  function formatDate(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function createPostCard(post) {
    return `
      <article class="blog-card">
        <h2 class="blog-card-title">
          <a href="./blog-post.html?slug=${encodeURIComponent(post.slug)}"><span class="blog-card-date">${formatDate(post.date)} - </span><span class="blog-card-topic">${post.title}</span></a>
        </h2>
      </article>
    `;
  }

  async function fetchBlogIndex() {
    const response = await fetch(BLOG_INDEX_PATH);
    if (!response.ok) {
      throw new Error("Failed to fetch blog index");
    }
    return response.json();
  }

  async function renderBlogListPage() {
    const listEl = document.getElementById("blog-list");
    if (!listEl) return;

    try {
      const posts = await fetchBlogIndex();
      const sortedPosts = posts.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      if (!sortedPosts.length) {
        listEl.innerHTML =
          '<p class="event-description-clean">No articles yet. Check back soon.</p>';
        return;
      }

      listEl.innerHTML = sortedPosts.map(createPostCard).join("");
    } catch (error) {
      listEl.innerHTML =
        '<p class="event-description-clean">Unable to load blog posts right now.</p>';
    }
  }

  async function renderBlogPostPage() {
    const postContentEl = document.getElementById("post-content");
    const postTitleEl = document.getElementById("post-title");
    const postMetaEl = document.getElementById("post-meta");

    if (!postContentEl || !postTitleEl || !postMetaEl) return;

    const params = new URLSearchParams(window.location.search);
    const slug = params.get("slug");

    if (!slug) {
      postTitleEl.textContent = "Article not found";
      postMetaEl.textContent = "";
      postContentEl.innerHTML =
        '<p class="event-description-clean">Missing article identifier.</p>';
      return;
    }

    try {
      const posts = await fetchBlogIndex();
      const post = posts.find((entry) => entry.slug === slug);

      if (!post) {
        postTitleEl.textContent = "Article not found";
        postMetaEl.textContent = "";
        postContentEl.innerHTML =
          '<p class="event-description-clean">This article does not exist.</p>';
        return;
      }

      const markdownResponse = await fetch(post.file);
      if (!markdownResponse.ok) {
        throw new Error("Failed to fetch markdown file");
      }

      let markdown = await markdownResponse.text();
      postTitleEl.textContent = post.title;
      postMetaEl.textContent = `${formatDate(post.date)} · ${post.author}`;
      document.title = `${post.title} - Otobong Peter`;

      // Avoid rendering a duplicate title in content when the Markdown starts
      // with the same H1 title already shown in the page header.
      const escapedTitle = post.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const firstHeadingPattern = new RegExp(`^#\\s+${escapedTitle}\\s*\\n+`, "i");
      markdown = markdown.replace(firstHeadingPattern, "");

      if (window.marked) {
        postContentEl.innerHTML = window.marked.parse(markdown);
      } else {
        postContentEl.textContent = markdown;
      }
    } catch (error) {
      postTitleEl.textContent = "Unable to load article";
      postMetaEl.textContent = "";
      postContentEl.innerHTML =
        '<p class="event-description-clean">Something went wrong while loading this article.</p>';
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderBlogListPage();
    renderBlogPostPage();
  });
})();
