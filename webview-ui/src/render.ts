import type { Store } from './state/store';
import type { WebviewMessage } from '../../src/ui/webview/protocol';

type ActionCallback = (type: 'ack' | 'nack' | 'nack-requeue' | 'replay', id: string) => void;

export function initRender(store: Store, onAction: ActionCallback): void {
  const filterInput = document.getElementById('filter-input') as HTMLInputElement;
  const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
  const messageList = document.getElementById('message-list') as HTMLDivElement;
  const detail = document.getElementById('detail') as HTMLDivElement;
  const detailRoutingKey = document.getElementById('detail-routing-key') as HTMLHeadingElement;
  const detailMeta = document.getElementById('detail-meta') as HTMLDivElement;
  const detailBody = document.getElementById('detail-body') as HTMLPreElement;
  const btnAck = document.getElementById('btn-ack') as HTMLButtonElement;
  const btnNack = document.getElementById('btn-nack') as HTMLButtonElement;
  const btnNackRequeue = document.getElementById('btn-nack-requeue') as HTMLButtonElement;
  const btnReplay = document.getElementById('btn-replay') as HTMLButtonElement;

  filterInput.addEventListener('input', () => {
    store.setFilter(filterInput.value);
  });

  clearBtn.addEventListener('click', () => {
    store.clear();
  });

  btnAck.addEventListener('click', () => {
    const id = store.getState().selectedId;
    if (id) onAction('ack', id);
  });

  btnNack.addEventListener('click', () => {
    const id = store.getState().selectedId;
    if (id) onAction('nack', id);
  });

  btnNackRequeue.addEventListener('click', () => {
    const id = store.getState().selectedId;
    if (id) onAction('nack-requeue', id);
  });

  btnReplay.addEventListener('click', () => {
    const id = store.getState().selectedId;
    if (id) onAction('replay', id);
  });

  store.subscribe(() => render());

  function render(): void {
    const filtered = store.getFiltered();
    const selectedId = store.getState().selectedId;

    renderList(filtered, selectedId);
    renderDetail(store.getSelected());
  }

  function renderList(messages: WebviewMessage[], selectedId: string | null): void {
    if (messages.length === 0) {
      messageList.innerHTML = '<div id="empty">No messages</div>';
      return;
    }

    // Virtualized rendering: only render visible rows (simple approach)
    const fragment = document.createDocumentFragment();

    for (const msg of messages) {
      const row = document.createElement('div');
      row.className = 'msg-row' + (msg.id === selectedId ? ' selected' : '');
      row.dataset['id'] = msg.id;

      const rk = document.createElement('span');
      rk.className = 'rk';
      rk.textContent = msg.routingKey || '(no routing key)';

      const ts = document.createElement('span');
      ts.className = 'ts';
      ts.textContent = ` · ${formatTime(msg.timestamp)}`;

      const bodyPreview = document.createElement('span');
      bodyPreview.textContent = ` ${msg.body.slice(0, 60)}`;

      row.appendChild(rk);
      row.appendChild(ts);
      row.appendChild(bodyPreview);

      row.addEventListener('click', () => store.setSelected(msg.id));
      fragment.appendChild(row);
    }

    messageList.replaceChildren(fragment);
  }

  function renderDetail(msg: WebviewMessage | undefined): void {
    if (!msg) {
      detail.classList.remove('visible');
      return;
    }

    detail.classList.add('visible');
    detailRoutingKey.textContent = msg.routingKey || '(no routing key)';
    detailMeta.textContent = `exchange: ${msg.exchange || '(default)'} · ${formatTime(msg.timestamp)}${msg.redelivered ? ' · redelivered' : ''}`;

    let bodyText = msg.body;
    if (msg.contentType.includes('json')) {
      try {
        bodyText = JSON.stringify(JSON.parse(msg.body), null, 2);
      } catch {
        // leave as-is
      }
    }
    detailBody.textContent = bodyText;
  }

  function formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString();
    } catch {
      return iso;
    }
  }
}