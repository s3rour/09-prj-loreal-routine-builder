const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateBtn = document.getElementById("generateRoutine");
const clearSelectionsBtn = document.getElementById("clearSelectionsBtn");
const userInput = document.getElementById("userInput");

const storageKey = "loreal-selected-products";
const workerUrl = "https://worker-bitter-term-60f9.cserour.workers.dev/";
const systemPrompt =
  "You are a polished L'Oréal beauty advisor. Give concise, helpful advice about beauty routines and recommend products naturally. Stay focused on skincare, haircare, makeup, fragrance, and lifestyle-friendly routines.";

let allProducts = [];
let selectedProductIds = [];
let conversationMessages = [];
let routineGenerated = false;

function showInitialState() {
  productsContainer.innerHTML = `
    <div class="placeholder-message">
      Choose a category to browse the collection and start building your routine.
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMessageContent(content) {
  // Escape HTML first so raw markdown can't be used to inject tags
  let html = escapeHtml(content);

  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic: *text* (after bold so it doesn't eat the ** pairs)
  html = html.replace(/(^|[^*])\*(?!\*)([^*]+?)\*(?!\*)/g, "$1<em>$2</em>");

  // Numbered lists: turn consecutive "1. foo" lines into <ol><li>
  html = html.replace(/(?:^|\n)((?:\d+\.\s+.+(?:\n|$))+)/g, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((line) => line.replace(/^\d+\.\s+/, ""))
      .map((item) => `<li>${item}</li>`)
      .join("");
    return `<ol>${items}</ol>`;
  });

  // Bulleted lists: turn consecutive "- foo" or "* foo" lines into <ul><li>
  html = html.replace(/(?:^|\n)((?:[-*]\s+.+(?:\n|$))+)/g, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((line) => line.replace(/^[-*]\s+/, ""))
      .map((item) => `<li>${item}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  });

  // Remaining newlines -> line breaks (skip right after list blocks)
  html = html.replace(/\n(?!<\/?(ul|ol|li))/g, "<br>");

  return html;
}

function formatCategory(category) {
  return category
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  allProducts = data.products;
  restoreSelection();
  renderSelectedProducts();
}

function getSelectedProducts() {
  return allProducts.filter((product) =>
    selectedProductIds.includes(product.id),
  );
}

function renderProducts(products) {
  if (!products.length) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No products found in this category yet.
      </div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProductIds.includes(product.id);
      return `
        <article class="product-card ${isSelected ? "selected" : ""}" data-product-id="${product.id}" tabindex="0" role="button" aria-pressed="${isSelected}">
          <div class="product-card-main">
            <img src="${product.image}" alt="${escapeHtml(product.name)}" />
            <div class="product-info">
              <span class="product-category">${escapeHtml(formatCategory(product.category))}</span>
              <h3>${escapeHtml(product.name)}</h3>
              <p>${escapeHtml(product.brand)}</p>
            </div>
          </div>
          <div class="product-card-actions">
            <button class="info-toggle" type="button" data-action="details" data-product-id="${product.id}">
              Details
            </button>
          </div>
          <div class="description-panel">
            <p>${escapeHtml(product.description)}</p>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSelectedProducts() {
  const selectedProducts = getSelectedProducts();

  if (!selectedProducts.length) {
    selectedProductsList.innerHTML = `
      <div class="empty-selection">
        Choose a few products to start your routine.
      </div>
    `;
    clearSelectionsBtn.style.display = "none";
    generateBtn.disabled = true;
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
        <div class="selected-pill">
          <span>${escapeHtml(product.name)}</span>
          <button class="remove-selection" type="button" data-remove-id="${product.id}" aria-label="Remove ${escapeHtml(product.name)}">
            ×
          </button>
        </div>
      `,
    )
    .join("");

  clearSelectionsBtn.style.display = "inline-flex";
  generateBtn.disabled = false;
}

function saveSelection() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(selectedProductIds));
  } catch (error) {
    console.warn("Could not save selections:", error);
  }
}

function restoreSelection() {
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) {
      return;
    }
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) {
      selectedProductIds = parsed;
    }
  } catch (error) {
    console.warn("Could not restore selections:", error);
  }
}

function toggleSelection(productId) {
  if (selectedProductIds.includes(productId)) {
    selectedProductIds = selectedProductIds.filter((id) => id !== productId);
  } else {
    selectedProductIds = [...selectedProductIds, productId];
  }

  saveSelection();
  renderSelectedProducts();

  if (categoryFilter.value) {
    const categoryProducts = allProducts.filter(
      (product) => product.category === categoryFilter.value,
    );
    renderProducts(categoryProducts);
  }
}

function renderChat() {
  if (!conversationMessages.length) {
    chatWindow.innerHTML = `
      <div class="chat-empty">
        Your routine suggestions and follow-up answers will appear here.
      </div>
    `;
    return;
  }

  chatWindow.innerHTML = conversationMessages
    .map(
      (message) => `
        <div class="chat-bubble ${message.role}">
          <strong>${message.role === "assistant" ? "Advisor" : "You"}</strong>
          <p>${formatMessageContent(message.content)}</p>
        </div>
      `,
    )
    .join("");

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addMessage(role, content) {
  conversationMessages.push({ role, content });
  renderChat();
}

function buildRoutinePrompt(products) {
  const productData = products.map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));

  return `Create a polished beauty routine using only these products. Keep it easy to follow and tailored to the selected items. Include a short morning and evening routine if helpful, and explain how each product contributes.\n\nProducts JSON:\n${JSON.stringify(productData, null, 2)}`;
}

function createFallbackReply(userContent, products) {
  const selectedNames = products.length
    ? products.map((product) => product.name).join(", ")
    : "your selections";

  if (
    userContent.toLowerCase().includes("why") ||
    userContent.toLowerCase().includes("how")
  ) {
    return `A balanced routine usually starts with gentle cleansing, then a treatment or serum, followed by moisturizer and SPF in the morning. For ${selectedNames}, I would keep the steps simple and layer from lightest to richest.`;
  }

  return `This demo response is ready to help you refine your routine. Based on ${selectedNames}, I would suggest a simple order: cleanse, treat, moisturize, and finish with SPF in the morning. If you want, I can also turn this into a more specific skincare, haircare, or makeup plan.`;
}

async function sendToWorker(messages) {
  if (!workerUrl || workerUrl.includes("your-subdomain")) {
    const lastUserMessage = messages[messages.length - 1]?.content || "";
    const selectedProducts = getSelectedProducts();
    return {
      choices: [
        {
          message: {
            content: createFallbackReply(lastUserMessage, selectedProducts),
          },
        },
      ],
    };
  }

  const response = await fetch(workerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    throw new Error("The worker did not return a successful response.");
  }

  return response.json();
}

async function generateRoutine() {
  const selectedProducts = getSelectedProducts();

  if (!selectedProducts.length) {
    addMessage(
      "assistant",
      "Select at least one product before generating a routine.",
    );
    return;
  }

  const userPrompt = buildRoutinePrompt(selectedProducts);
  const requestMessages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  addMessage(
    "assistant",
    "I’m building a tailored routine around your selections now.",
  );

  try {
    const data = await sendToWorker(requestMessages);
    const reply =
      data.choices?.[0]?.message?.content ||
      "I’m ready to help with your routine.";

    conversationMessages = [
      { role: "user", content: userPrompt },
      { role: "assistant", content: reply },
    ];
    routineGenerated = true;
    renderChat();
  } catch (error) {
    conversationMessages = [
      { role: "user", content: userPrompt },
      {
        role: "assistant",
        content:
          "I could not reach the worker right now, so I’m showing a local fallback response instead.",
      },
    ];
    routineGenerated = true;
    renderChat();
    console.error(error);
  }
}

async function handleChatSubmit(event) {
  event.preventDefault();

  const message = userInput.value.trim();
  if (!message) {
    return;
  }

  if (!routineGenerated) {
    addMessage(
      "assistant",
      "Generate a routine first so I can help you with follow-up questions.",
    );
    userInput.value = "";
    return;
  }

  addMessage("user", message);
  userInput.value = "";

  const requestMessages = [
    { role: "system", content: systemPrompt },
    ...conversationMessages,
    { role: "user", content: message },
  ];

  try {
    const data = await sendToWorker(requestMessages);
    const reply = data.choices?.[0]?.message?.content || "I’m here to help.";
    addMessage("assistant", reply);
  } catch (error) {
    addMessage(
      "assistant",
      "I could not reach the worker right now, so I’m using a local fallback response instead.",
    );
    console.error(error);
  }
}

categoryFilter.addEventListener("change", async (event) => {
  const selectedCategory = event.target.value;

  if (!selectedCategory) {
    showInitialState();
    return;
  }

  const filteredProducts = allProducts.filter(
    (product) => product.category === selectedCategory,
  );

  renderProducts(filteredProducts);
});

productsContainer.addEventListener("click", (event) => {
  const card = event.target.closest(".product-card");
  if (!card) {
    return;
  }

  if (event.target.closest(".info-toggle")) {
    event.preventDefault();
    const panel = card.querySelector(".description-panel");
    panel.classList.toggle("open");
    return;
  }

  const productId = Number(card.dataset.productId);
  toggleSelection(productId);
});

productsContainer.addEventListener("keydown", (event) => {
  const card = event.target.closest(".product-card");
  if (!card) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    const productId = Number(card.dataset.productId);
    toggleSelection(productId);
  }
});

selectedProductsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-selection");
  if (!removeButton) {
    return;
  }

  const productId = Number(removeButton.dataset.removeId);
  selectedProductIds = selectedProductIds.filter((id) => id !== productId);
  saveSelection();
  renderSelectedProducts();

  if (categoryFilter.value) {
    const categoryProducts = allProducts.filter(
      (product) => product.category === categoryFilter.value,
    );
    renderProducts(categoryProducts);
  }
});

generateBtn.addEventListener("click", generateRoutine);
clearSelectionsBtn.addEventListener("click", () => {
  selectedProductIds = [];
  saveSelection();
  renderSelectedProducts();

  if (categoryFilter.value) {
    const categoryProducts = allProducts.filter(
      (product) => product.category === categoryFilter.value,
    );
    renderProducts(categoryProducts);
  }
});
chatForm.addEventListener("submit", handleChatSubmit);

showInitialState();
loadProducts().then(() => {
  renderChat();
});
