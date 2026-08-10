const favoritesKey = "cookbook-favorites-v1";

const state = {
  recipes: [],
  filteredRecipes: [],
  favorites: new Set(loadFavorites()),
  spotlightSlug: "",
  filters: {
    search: "",
    ingredients: [],
    mainIngredient: "",
    flavor: "",
    difficulty: "",
    time: "",
    favoritesOnly: false,
  },
};

const els = {
  heroStats: document.querySelector("#hero-stats"),
  recipeGrid: document.querySelector("#recipe-grid"),
  recipeDialog: document.querySelector("#recipe-dialog"),
  recipeDetail: document.querySelector("#recipe-detail"),
  dialogClose: document.querySelector("#dialog-close"),
  recipeCardTemplate: document.querySelector("#recipe-card-template"),
  resultsSummary: document.querySelector("#results-summary"),
  emptyState: document.querySelector("#empty-state"),
  activeChips: document.querySelector("#active-chips"),
  spotlightTitle: document.querySelector("#spotlight-title"),
  spotlightSummary: document.querySelector("#spotlight-summary"),
  spotlightRandom: document.querySelector("#spotlight-random"),
  spotlightShuffle: document.querySelector("#spotlight-shuffle"),
  spotlightOpen: document.querySelector("#spotlight-open"),
  searchInput: document.querySelector("#search-input"),
  ingredientInput: document.querySelector("#ingredient-input"),
  mainIngredientFilter: document.querySelector("#main-ingredient-filter"),
  flavorFilter: document.querySelector("#flavor-filter"),
  difficultyFilter: document.querySelector("#difficulty-filter"),
  timeFilter: document.querySelector("#time-filter"),
  favoritesOnly: document.querySelector("#favorites-only"),
  resetFilters: document.querySelector("#reset-filters"),
};

init().catch((error) => {
  console.error(error);
  els.resultsSummary.textContent = "菜谱加载失败，请检查文件结构。";
  els.spotlightTitle.textContent = "菜谱加载失败";
  els.spotlightSummary.textContent = "请确认 data/recipes-data.js 或 data/recipes/*.json 文件存在。";
});

async function init() {
  const recipes = await loadRecipes();

  state.recipes = recipes.map(normalizeRecipe);
  state.filteredRecipes = state.recipes.map((recipe) => ({
    recipe,
    ingredientMatch: getIngredientMatch(recipe, []),
  }));

  populateFilters();
  bindEvents();
  renderHeroStats();
  renderSpotlightPlaceholder();
  applyFilters();
  openFromHash();
  window.addEventListener("hashchange", openFromHash);
}

async function loadRecipes() {
  const canFetchLocalFiles = location.protocol === "http:" || location.protocol === "https:";
  if (canFetchLocalFiles) {
    try {
      const manifest = await fetchJSON("./data/recipes/index.json");
      return Promise.all(manifest.map((file) => fetchJSON(`./data/recipes/${file}`)));
    } catch (error) {
      console.warn("JSON 菜谱读取失败，改用内置数据兜底。", error);
    }
  }

  if (Array.isArray(window.COOKBOOK_RECIPES) && window.COOKBOOK_RECIPES.length) {
    return window.COOKBOOK_RECIPES;
  }

  const manifest = await fetchJSON("./data/recipes/index.json");
  return Promise.all(manifest.map((file) => fetchJSON(`./data/recipes/${file}`)));
}

function bindEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.filters.search = event.target.value.trim();
    applyFilters();
  });

  els.ingredientInput.addEventListener("input", (event) => {
    state.filters.ingredients = splitIngredients(event.target.value);
    applyFilters();
  });

  for (const [key, element] of [
    ["mainIngredient", els.mainIngredientFilter],
    ["flavor", els.flavorFilter],
    ["difficulty", els.difficultyFilter],
    ["time", els.timeFilter],
  ]) {
    element.addEventListener("change", (event) => {
      state.filters[key] = event.target.value;
      applyFilters();
    });
  }

  els.favoritesOnly.addEventListener("change", (event) => {
    state.filters.favoritesOnly = event.target.checked;
    applyFilters();
  });

  els.resetFilters.addEventListener("click", resetFilters);
  els.spotlightRandom.addEventListener("click", pickSpotlightRecipe);
  els.spotlightShuffle.addEventListener("click", pickSpotlightRecipe);
  els.spotlightOpen.addEventListener("click", openSpotlightRecipe);
  els.dialogClose.addEventListener("click", closeDialog);
  els.recipeDialog.addEventListener("click", (event) => {
    const sheet = event.target.closest(".recipe-sheet");
    if (!sheet) closeDialog();
  });
  els.recipeDialog.addEventListener("close", handleDialogClosed);
}

function resetFilters() {
  state.filters = {
    search: "",
    ingredients: [],
    mainIngredient: "",
    flavor: "",
    difficulty: "",
    time: "",
    favoritesOnly: false,
  };
  els.searchInput.value = "";
  els.ingredientInput.value = "";
  els.mainIngredientFilter.value = "";
  els.flavorFilter.value = "";
  els.difficultyFilter.value = "";
  els.timeFilter.value = "";
  els.favoritesOnly.checked = false;
  applyFilters();
}

function populateFilters() {
  populateSelect(
    els.mainIngredientFilter,
    uniqueValues(state.recipes.map((recipe) => recipe.tags.mainIngredient))
  );
  populateSelect(
    els.flavorFilter,
    uniqueValues(state.recipes.map((recipe) => recipe.tags.flavor))
  );
  populateSelect(
    els.difficultyFilter,
    uniqueValues(state.recipes.map((recipe) => recipe.difficulty))
  );
  populateSelect(
    els.timeFilter,
    uniqueValues(state.recipes.map((recipe) => recipe.time.label))
  );
}

function populateSelect(select, values) {
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
}

function applyFilters() {
  const filtered = state.recipes
    .map((recipe) => ({
      recipe,
      ingredientMatch: getIngredientMatch(recipe, state.filters.ingredients),
    }))
    .filter(({ recipe, ingredientMatch }) => {
      const searchText = state.filters.search.toLowerCase();
      const searchable = [
        recipe.title,
        recipe.summary,
        recipe.tags.mainIngredient,
        recipe.tags.flavor,
        recipe.steps.map((step) => `${step.title} ${step.content}`).join(" "),
        recipe.ingredients.map((item) => item.name).join(" "),
        recipe.sauces.map((item) => item.name).join(" "),
        recipe.tags.scene.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      if (searchText && !searchable.includes(searchText)) return false;
      if (
        state.filters.mainIngredient &&
        recipe.tags.mainIngredient !== state.filters.mainIngredient
      ) {
        return false;
      }
      if (state.filters.flavor && recipe.tags.flavor !== state.filters.flavor) {
        return false;
      }
      if (state.filters.difficulty && recipe.difficulty !== state.filters.difficulty) {
        return false;
      }
      if (state.filters.time && recipe.time.label !== state.filters.time) {
        return false;
      }
      if (state.filters.favoritesOnly && !state.favorites.has(recipe.slug)) {
        return false;
      }
      if (state.filters.ingredients.length && ingredientMatch.matchedCount === 0) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (b.ingredientMatch.fullMatch !== a.ingredientMatch.fullMatch) {
        return Number(b.ingredientMatch.fullMatch) - Number(a.ingredientMatch.fullMatch);
      }
      if (b.ingredientMatch.matchedCount !== a.ingredientMatch.matchedCount) {
        return b.ingredientMatch.matchedCount - a.ingredientMatch.matchedCount;
      }
      return a.recipe.title.localeCompare(b.recipe.title, "zh-CN");
    });

  state.filteredRecipes = filtered;
  renderActiveChips();
  renderRecipeGrid();
}

function renderHeroStats() {
  const totalSteps = state.recipes.reduce((sum, recipe) => sum + recipe.steps.length, 0);
  const totalIngredients = uniqueValues(
    state.recipes.flatMap((recipe) => recipe.ingredients.map((item) => item.name))
  ).length;

  const stats = [
    `${state.recipes.length} 道首版菜谱`,
    `${totalIngredients} 种常用食材`,
    `${totalSteps} 个详细步骤`,
  ];

  els.heroStats.innerHTML = stats
    .map((text) => `<span class="stat-pill">${escapeHTML(text)}</span>`)
    .join("");
}

function renderSpotlightPlaceholder() {
  state.spotlightSlug = "";
  els.spotlightTitle.textContent = "今天吃什么？";
  els.spotlightSummary.textContent = "先点“随机一道菜”，再用“换一道试试”继续挑选。";
  els.spotlightRandom.disabled = false;
  els.spotlightShuffle.disabled = true;
  els.spotlightOpen.disabled = true;
}

function pickSpotlightRecipe() {
  const pool = state.filteredRecipes.length
    ? state.filteredRecipes.map((item) => item.recipe)
    : state.recipes;
  const candidates =
    pool.length > 1 ? pool.filter((recipe) => recipe.slug !== state.spotlightSlug) : pool;

  if (!candidates.length) {
    els.spotlightTitle.textContent = "没有可随机的菜";
    els.spotlightSummary.textContent = "请清空筛选条件，或者新增一道菜谱。";
    els.spotlightShuffle.disabled = true;
    els.spotlightOpen.disabled = true;
    return;
  }

  const recipe = candidates[Math.floor(Math.random() * candidates.length)];
  state.spotlightSlug = recipe.slug;
  els.spotlightTitle.textContent = recipe.title;
  els.spotlightSummary.textContent = recipe.summary;
  els.spotlightShuffle.disabled = false;
  els.spotlightOpen.disabled = false;
}

function openSpotlightRecipe() {
  if (!state.spotlightSlug) return;
  window.location.hash = `#/recipe/${state.spotlightSlug}`;
  openRecipe(state.spotlightSlug);
}

function renderActiveChips() {
  const chips = [];
  if (state.filters.search) chips.push(`关键词：${state.filters.search}`);
  if (state.filters.ingredients.length) {
    chips.push(`食材：${state.filters.ingredients.join("、")}`);
  }
  if (state.filters.mainIngredient) chips.push(`主食材：${state.filters.mainIngredient}`);
  if (state.filters.flavor) chips.push(`口味：${state.filters.flavor}`);
  if (state.filters.difficulty) chips.push(`难度：${state.filters.difficulty}`);
  if (state.filters.time) chips.push(`时长：${state.filters.time}`);
  if (state.filters.favoritesOnly) chips.push("仅收藏");
  els.activeChips.innerHTML = chips
    .map((chip) => `<span class="chip">${escapeHTML(chip)}</span>`)
    .join("");
}

function renderRecipeGrid() {
  const hasIngredientFilters = state.filters.ingredients.length > 0;
  const cards = state.filteredRecipes.map(({ recipe, ingredientMatch }) =>
    createRecipeCard(recipe, hasIngredientFilters ? ingredientMatch : null)
  );

  els.recipeGrid.replaceChildren(...cards);
  els.emptyState.classList.toggle("hidden", cards.length > 0);
  els.resultsSummary.textContent = cards.length
    ? `共找到 ${cards.length} 道菜`
    : "当前没有匹配结果";
}

function createRecipeCard(recipe, ingredientMatch) {
  const fragment = els.recipeCardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".recipe-card");
  const image = fragment.querySelector(".recipe-card__image");
  const meta = fragment.querySelector(".recipe-card__meta");
  const title = fragment.querySelector(".recipe-card__title");
  const summary = fragment.querySelector(".recipe-card__summary");
  const favorite = fragment.querySelector(".recipe-card__favorite");
  const match = fragment.querySelector(".recipe-card__match");
  const detailButton = fragment.querySelector(".button");

  bindImage(image, recipe.images.cover);
  meta.innerHTML = `
    <span class="meta-badge">${escapeHTML(recipe.tags.mainIngredient)}</span>
    <span class="meta-badge">${escapeHTML(recipe.tags.flavor)}</span>
    <span class="meta-badge">${escapeHTML(recipe.time.label)}</span>
  `;
  title.textContent = recipe.title;
  summary.textContent = recipe.summary;
  setFavoriteButton(favorite, recipe.slug);

  if (ingredientMatch) {
    match.textContent = ingredientMatch.fullMatch
      ? `完全匹配：已命中 ${ingredientMatch.matchedCount}/${ingredientMatch.requestedCount} 项食材`
      : `部分匹配：已命中 ${ingredientMatch.matchedCount}/${ingredientMatch.requestedCount} 项食材`;
  } else {
    match.textContent = recipe.tags.scene.join(" / ");
  }

  const open = () => {
    window.location.hash = `#/recipe/${recipe.slug}`;
    openRecipe(recipe.slug);
  };

  card.addEventListener("click", open);
  detailButton.addEventListener("click", (event) => {
    event.stopPropagation();
    open();
  });
  favorite.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFavorite(recipe.slug, favorite);
  });

  return fragment;
}

function openFromHash() {
  const match = window.location.hash.match(/^#\/recipe\/(.+)$/);
  if (!match) return;
  openRecipe(match[1]);
}

function openRecipe(slug) {
  const recipe = state.recipes.find((item) => item.slug === slug);
  if (!recipe) return;

  const detail = buildRecipeDetail(recipe);
  els.recipeDetail.replaceChildren(detail);
  document.body.classList.add("dialog-open");
  if (!els.recipeDialog.open) els.recipeDialog.showModal();
}

function closeDialog() {
  els.recipeDialog.close();
}

function handleDialogClosed() {
  document.body.classList.remove("dialog-open");
  if (window.location.hash.startsWith("#/recipe/")) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

function buildRecipeDetail(recipe) {
  const wrapper = document.createElement("div");
  wrapper.className = "detail-layout";

  const stepsMarkup = recipe.steps
    .map(
      (step, index) => `
        <article id="step-${index + 1}" class="step-card">
          <div class="step-card__header">
            <span class="step-number">${index + 1}</span>
            <div>
              <h4>${escapeHTML(step.title)}</h4>
              <div class="step-highlights">
                <span class="step-highlight">火候：${escapeHTML(step.heat)}</span>
                <span class="step-highlight">时机：${escapeHTML(step.timing)}</span>
                <span class="step-highlight">判断：${escapeHTML(step.judgement)}</span>
              </div>
            </div>
          </div>
          <p>${escapeHTML(step.content)}</p>
          <p class="detail-note"><strong>注意：</strong>${escapeHTML(step.note)}</p>
        </article>
      `
    )
    .join("");

  const galleryMarkup = recipe.images.gallery.map(renderGalleryItem).join("");
  const ingredientsMarkup = recipe.ingredients
    .map((item) => `<li><strong>${escapeHTML(item.name)}</strong> · ${escapeHTML(item.amount)}</li>`)
    .join("");
  const saucesMarkup = recipe.sauces
    .map((item) => `<li><strong>${escapeHTML(item.name)}</strong> · ${escapeHTML(item.amount)}</li>`)
    .join("");
  const tocMarkup = recipe.steps
    .map(
      (step, index) =>
        `<li><button type="button" class="toc-button" data-step-target="step-${index + 1}">${index + 1}. ${escapeHTML(step.title)}</button></li>`
    )
    .join("");

  wrapper.innerHTML = `
    <section>
      <div class="detail-cover">
        ${renderImage(recipe.images.cover)}
      </div>
      <header class="detail-header">
        <div class="detail-header__top">
          <div>
            <p class="eyebrow">${escapeHTML(recipe.tags.mainIngredient)} / ${escapeHTML(recipe.tags.flavor)}</p>
            <h2 class="detail-title">${escapeHTML(recipe.title)}</h2>
          </div>
          <button class="button button--secondary" type="button" data-favorite-detail>
            ${state.favorites.has(recipe.slug) ? "★ 已收藏" : "☆ 收藏这道菜"}
          </button>
        </div>
        <p class="detail-intro">${escapeHTML(recipe.summary)}</p>
        <div class="detail-tags">
          <span class="tag">难度：${escapeHTML(recipe.difficulty)}</span>
          <span class="tag">预计时长：${escapeHTML(recipe.time.label)}</span>
          <span class="tag">适合：${escapeHTML(recipe.tags.scene.join(" / "))}</span>
        </div>
      </header>

      <div class="detail-columns">
        <section class="detail-block">
          <h3>食材部分</h3>
          <ul class="ingredient-list">${ingredientsMarkup}</ul>
        </section>
        <section class="detail-block">
          <h3>酱料部分</h3>
          <ul class="sauce-list">${saucesMarkup}</ul>
        </section>
      </div>

      <section class="detail-section">
        <div class="detail-section__header">
          <h3>做法部分</h3>
          <span class="meta-badge">共 ${recipe.steps.length} 步</span>
        </div>
        <div class="detail-steps">${stepsMarkup}</div>
      </section>

      <section class="detail-section">
        <div class="detail-gallery__header">
          <h3>相关图片</h3>
          <span class="meta-badge">真实参考图，可替换为你的实拍图</span>
        </div>
        <div class="gallery-grid">${galleryMarkup}</div>
      </section>
    </section>

    <aside class="detail-side">
      <section class="detail-side__panel">
        <h3>步骤目录</h3>
        <ol class="toc-list">${tocMarkup}</ol>
      </section>
      <section class="detail-side__panel">
        <h3>关键信息</h3>
        <div class="detail-side__meta">
          <span class="tag">主食材：${escapeHTML(recipe.tags.mainIngredient)}</span>
          <span class="tag">口味：${escapeHTML(recipe.tags.flavor)}</span>
          <span class="tag">难度：${escapeHTML(recipe.difficulty)}</span>
          <span class="tag">时长：${escapeHTML(recipe.time.label)}</span>
        </div>
      </section>
      <section class="detail-side__panel">
        <h3>烹饪提醒</h3>
        <p class="detail-note">${escapeHTML(recipe.tips)}</p>
      </section>
    </aside>
  `;

  wrapper.querySelector("[data-favorite-detail]").addEventListener("click", () => {
    toggleFavorite(recipe.slug);
    openRecipe(recipe.slug);
    applyFilters();
  });

  wrapper.querySelectorAll("[data-step-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = wrapper.querySelector(`#${button.dataset.stepTarget}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  attachImageFallbacks(wrapper);
  return wrapper;
}

function renderGalleryItem(item) {
  return `
    <figure class="gallery-item">
      ${renderImage(item)}
    </figure>
  `;
}

function renderImage(image) {
  return `<img src="${escapeAttr(image.src)}" ${
    image.fallbackSrc ? `data-fallback-src="${escapeAttr(image.fallbackSrc)}"` : ""
  } alt="${escapeAttr(image.alt || "")}" loading="lazy" />`;
}

function bindImage(imageElement, image) {
  imageElement.src = image.src;
  imageElement.alt = image.alt || "";
  if (image.fallbackSrc) {
    imageElement.dataset.fallbackSrc = image.fallbackSrc;
    attachImageFallback(imageElement);
  }
}

function attachImageFallbacks(root) {
  root.querySelectorAll("img[data-fallback-src]").forEach(attachImageFallback);
}

function attachImageFallback(image) {
  image.addEventListener(
    "error",
    () => {
      const fallback = image.dataset.fallbackSrc;
      if (!fallback || image.src.endsWith(fallback)) return;
      image.src = fallback;
    },
    { once: true }
  );
}

function toggleFavorite(slug, button) {
  if (state.favorites.has(slug)) {
    state.favorites.delete(slug);
  } else {
    state.favorites.add(slug);
  }
  persistFavorites();
  if (button) setFavoriteButton(button, slug);
  applyFilters();
}

function setFavoriteButton(button, slug) {
  const active = state.favorites.has(slug);
  button.textContent = active ? "★" : "☆";
  button.classList.toggle("is-active", active);
}

function getIngredientMatch(recipe, wantedIngredients) {
  if (!wantedIngredients.length) {
    return { fullMatch: false, matchedCount: 0, requestedCount: 0 };
  }

  const allIngredients = [...recipe.ingredients, ...recipe.sauces].map((item) =>
    item.name.toLowerCase()
  );
  const matchedCount = wantedIngredients.filter((wanted) =>
    allIngredients.some((name) => name.includes(wanted) || wanted.includes(name))
  ).length;

  return {
    fullMatch: matchedCount === wantedIngredients.length,
    matchedCount,
    requestedCount: wantedIngredients.length,
  };
}

function normalizeRecipe(recipe) {
  return {
    ...recipe,
    ingredients: recipe.ingredients ?? [],
    sauces: recipe.sauces ?? [],
    steps: recipe.steps ?? [],
    tips: recipe.tips ?? "按步骤操作即可，首次制作建议提前把食材全部准备好。",
    images: {
      cover: recipe.images?.cover ?? {},
      gallery: recipe.images?.gallery ?? [],
    },
  };
}

async function fetchJSON(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

function uniqueValues(items) {
  return [...new Set(items.filter(Boolean))];
}

function splitIngredients(text) {
  return text
    .split(/[\s,，、]+/g)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHTML(value);
}

function loadFavorites() {
  try {
    const saved = localStorage.getItem(favoritesKey);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function persistFavorites() {
  localStorage.setItem(favoritesKey, JSON.stringify([...state.favorites]));
}
