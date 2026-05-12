import type { Store } from "./state/store";
import type {
  WebviewMessage,
  HistoryEntry,
} from "../../src/ui/webview/protocol";

type ActionCallback = (
  type: "ack" | "nack" | "nack-requeue" | "replay",
  id: string
) => void;
type PublishCallback = (
  exchange: string,
  routingKey: string,
  body: string,
  contentType: string,
  deliveryMode: 1 | 2,
  headers: Record<string, string>,
  properties: Record<string, string>
) => void;
export function initRender(
  store: Store,
  onAction: ActionCallback,
  onPublish: PublishCallback
): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".tab");
  const mainPanel = document.getElementById("main") as HTMLDivElement;
  const historyPanel = document.getElementById("tab-history") as HTMLDivElement;
  const historyEmpty = document.getElementById(
    "history-empty"
  ) as HTMLDivElement;
  const filterInput = document.getElementById(
    "filter-input"
  ) as HTMLInputElement;
  const modalTitle = document.getElementById(
    "modal-title"
  ) as HTMLHeadingElement;
  const pubSendBtn = document.getElementById("pub-send") as HTMLButtonElement;
  const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;
  const publishBtn = document.getElementById(
    "publish-btn"
  ) as HTMLButtonElement;
  const messageList = document.getElementById("message-list") as HTMLDivElement;
  const detail = document.getElementById("detail") as HTMLDivElement;
  const detailRoutingKey = document.getElementById(
    "detail-routing-key"
  ) as HTMLHeadingElement;
  const detailMeta = document.getElementById("detail-meta") as HTMLDivElement;
  const detailBody = document.getElementById("detail-body") as HTMLPreElement;
  const btnAck = document.getElementById("btn-ack") as HTMLButtonElement;
  const btnNack = document.getElementById("btn-nack") as HTMLButtonElement;
  const btnNackRequeue = document.getElementById(
    "btn-nack-requeue"
  ) as HTMLButtonElement;
  const btnReplay = document.getElementById("btn-replay") as HTMLButtonElement;
  const modalOverlay = document.getElementById(
    "modal-overlay"
  ) as HTMLDivElement;
  const pubInfo = document.getElementById("pub-info") as HTMLDivElement;
  const pubInfoRk = document.getElementById("pub-info-rk") as HTMLElement;
  const pubExchange = document.getElementById(
    "pub-exchange"
  ) as HTMLInputElement;
  const pubRoutingKey = document.getElementById(
    "pub-routing-key"
  ) as HTMLInputElement;
  const pubDelivery = document.getElementById(
    "pub-delivery-mode"
  ) as HTMLSelectElement;
  const pubContentType = document.getElementById(
    "pub-content-type"
  ) as HTMLSelectElement;
  const pubHeadersCt = document.getElementById("pub-headers") as HTMLDivElement;
  const pubPropsCt = document.getElementById(
    "pub-properties"
  ) as HTMLDivElement;
  const pubPayload = document.getElementById(
    "pub-payload"
  ) as HTMLTextAreaElement;
  const pubCancel = document.getElementById("pub-cancel") as HTMLButtonElement;
  const pubClose = document.getElementById("pub-close") as HTMLButtonElement;
  const pubSend = document.getElementById("pub-send") as HTMLButtonElement;
  const addHeaderBtn = document.getElementById(
    "add-header"
  ) as HTMLButtonElement;
  const addPropBtn = document.getElementById(
    "add-property"
  ) as HTMLButtonElement;

  // ── Tab switching

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const isHistory = tab.dataset["tab"] === "history";
      mainPanel.classList.toggle("hidden", isHistory);
      historyPanel.classList.toggle("active", isHistory);
    });
  });

  // ── KV helpers

  function addKvRow(container: HTMLDivElement, key = "", value = ""): void {
    const row = document.createElement("div");
    row.className = "kv-row";
    row.innerHTML = `
      <input class="field-input kv-key" type="text" placeholder="key" value="${escHtml(
        key
      )}" autocomplete="off" />
      <span class="kv-eq">=</span>
      <input class="field-input kv-val" type="text" placeholder="value" value="${escHtml(
        value
      )}" autocomplete="off" />
      <button class="kv-del" title="Remove">✕</button>`;
    row.querySelector(".kv-del")!.addEventListener("click", () => row.remove());
    container.appendChild(row);
  }

  function collectKv(container: HTMLDivElement): Record<string, string> {
    const result: Record<string, string> = {};
    container.querySelectorAll<HTMLDivElement>(".kv-row").forEach((row) => {
      const k = (row.querySelector(".kv-key") as HTMLInputElement).value.trim();
      const v = (row.querySelector(".kv-val") as HTMLInputElement).value.trim();
      if (k) result[k] = v;
    });
    return result;
  }

  function escHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  // ── Info line

  function updateInfo(): void {
    const ex = pubExchange.value.trim();
    const rk = pubRoutingKey.value.trim();
    if (ex) {
      pubInfo.innerHTML = `Message will be published to exchange <strong>${escHtml(
        ex
      )}</strong>${
        rk ? ` with routing key <strong>${escHtml(rk)}</strong>` : ""
      }.`;
    } else {
      pubInfo.innerHTML = `Message will be published to the <strong>default exchange</strong> with routing key <strong>${
        rk ? escHtml(rk) : pubInfoRk?.textContent ?? ""
      }</strong>.`;
    }
  }

  pubExchange.addEventListener("input", updateInfo);
  pubRoutingKey.addEventListener("input", updateInfo);

  // ── Modal open/close

  let modalMode: "publish" | "replay" = "publish";

  interface ModalPrefill {
    exchange?: string;
    routingKey?: string;
    contentType?: string;
    body?: string;
    headers?: Record<string, unknown>;
  }

  function openModal(
    mode: "publish" | "replay" = "publish",
    prefill?: ModalPrefill
  ): void {
    modalMode = mode;
    modalTitle.textContent =
      mode === "replay" ? "Replay message" : "Publish message";
    pubSendBtn.textContent = mode === "replay" ? "Replay" : "Publish";
    pubHeadersCt.innerHTML = "";
    pubPropsCt.innerHTML = "";

    const data = prefill ?? store.getSelected() ?? null;
    if (data) {
      pubExchange.value = data.exchange ?? "";
      pubRoutingKey.value = data.routingKey ?? "";
      pubContentType.value = data.contentType?.includes("json")
        ? "application/json"
        : data.contentType || "application/json";
      pubPayload.value = data.body ?? "";
      Object.entries(data.headers ?? {}).forEach(([k, v]) =>
        addKvRow(pubHeadersCt, k, String(v))
      );
    } else {
      pubExchange.value = "";
      pubRoutingKey.value = "";
      pubContentType.value = "application/json";
      pubPayload.value = "";
    }
    updateInfo();
    modalOverlay.classList.add("open");
    pubPayload.focus();
  }

  function closeModal(): void {
    modalOverlay.classList.remove("open");
  }

  publishBtn.addEventListener("click", () => openModal("publish"));
  pubCancel.addEventListener("click", closeModal);
  pubClose.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  addHeaderBtn.addEventListener("click", () => addKvRow(pubHeadersCt));
  addPropBtn.addEventListener("click", () => addKvRow(pubPropsCt));

  pubSend.addEventListener("click", () => {
    const payload = pubPayload.value.trim();
    if (!payload) {
      pubPayload.focus();
      return;
    }
    onPublish(
      pubExchange.value.trim(),
      pubRoutingKey.value.trim(),
      payload,
      pubContentType.value,
      Number(pubDelivery.value) as 1 | 2,
      collectKv(pubHeadersCt),
      collectKv(pubPropsCt)
    );
    closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalOverlay.classList.contains("open"))
      closeModal();
    if (
      e.key === "Enter" &&
      (e.ctrlKey || e.metaKey) &&
      modalOverlay.classList.contains("open")
    )
      pubSend.click();
  });

  btnAck.addEventListener("click", () => {
    const id = store.getState().selectedId;
    if (id) onAction("ack", id);
  });

  btnNack.addEventListener("click", () => {
    const id = store.getState().selectedId;
    if (id) onAction("nack", id);
  });

  btnNackRequeue.addEventListener("click", () => {
    const id = store.getState().selectedId;
    if (id) onAction("nack-requeue", id);
  });

  btnReplay.addEventListener("click", () => {
    openModal("replay");
  });

  store.subscribe(() => render());

  function render(): void {
    const state = store.getState();
    const filtered = store.getFiltered();

    renderList(filtered, state.selectedId);
    renderDetail(store.getSelected());
    renderHistory(state.history);
  }

  function renderList(
    messages: WebviewMessage[],
    selectedId: string | null
  ): void {
    if (messages.length === 0) {
      messageList.innerHTML = '<div id="empty">No messages</div>';
      return;
    }

    // Virtualized rendering: only render visible rows (simple approach)
    const fragment = document.createDocumentFragment();

    for (const msg of messages) {
      const row = document.createElement("div");
      row.className = "msg-row" + (msg.id === selectedId ? " selected" : "");
      row.dataset["id"] = msg.id;

      const rk = document.createElement("span");
      rk.className = "rk";
      rk.textContent = msg.routingKey || "(no routing key)";

      const ts = document.createElement("span");
      ts.className = "ts";
      ts.textContent = ` · ${formatTime(msg.timestamp)}`;

      const bodyPreview = document.createElement("span");
      bodyPreview.textContent = ` ${msg.body.slice(0, 60)}`;

      row.appendChild(rk);
      row.appendChild(ts);
      row.appendChild(bodyPreview);

      row.addEventListener("click", () => store.setSelected(msg.id));
      fragment.appendChild(row);
    }

    messageList.replaceChildren(fragment);
  }

  function renderDetail(msg: WebviewMessage | undefined): void {
    if (!msg) {
      detail.classList.remove("visible");
      return;
    }

    detail.classList.add("visible");
    detailRoutingKey.textContent = msg.routingKey || "(no routing key)";
    detailMeta.textContent = `exchange: ${
      msg.exchange || "(default)"
    } · ${formatTime(msg.timestamp)}${msg.redelivered ? " · redelivered" : ""}`;

    let bodyText = msg.body;
    if (msg.contentType.includes("json")) {
      try {
        bodyText = JSON.stringify(JSON.parse(msg.body), null, 2);
      } catch {
        // leave as-is
      }
    }
    detailBody.textContent = bodyText;
  }

  function renderHistory(entries: HistoryEntry[]): void {
    if (entries.length === 0) {
      historyEmpty.style.display = "block";
      const existing = historyPanel.querySelector("table");
      if (existing) existing.remove();
      return;
    }
    historyEmpty.style.display = "none";

    const table = document.createElement("table");
    table.className = "history-table";
    table.innerHTML = `<thead><tr><th>Action</th><th>Routing Key</th><th>Exchange</th><th>Body</th><th>Time</th><th></th></tr></thead>`;
    const tbody = document.createElement("tbody");

    for (const e of entries) {
      const tr = document.createElement("tr");
      const badgeClass =
        e.action === "ack"
          ? "badge-ack"
          : e.action === "nack-requeue"
          ? "badge-nack-requeue"
          : "badge-nack";
      const badgeLabel =
        e.action === "ack"
          ? "ACK ✓"
          : e.action === "nack-requeue"
          ? "NACK ↩"
          : "NACK ✗";
      tr.innerHTML = `
        <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
        <td title="${escHtml(e.routingKey)}">${
        escHtml(e.routingKey) || "(none)"
      }</td>
        <td title="${escHtml(e.exchange)}">${
        escHtml(e.exchange) || "(default)"
      }</td>
        <td title="${escHtml(e.body)}">${escHtml(e.body.slice(0, 40))}${
        e.body.length > 40 ? "…" : ""
      }</td>
        <td>${formatTime(e.actedAt)}</td>
        <td><button class="btn-replay-history" title="Replay this message">↩ Replay</button></td>`;
      tr.querySelector(".btn-replay-history")!.addEventListener("click", () => {
        openModal("replay", {
          exchange: e.exchange,
          routingKey: e.routingKey,
          contentType: e.contentType,
          body: e.body,
        });
      });
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    const existing = historyPanel.querySelector("table");
    if (existing) existing.replaceWith(table);
    else historyPanel.appendChild(table);
  }

  function formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString();
    } catch {
      return iso;
    }
  }
}
