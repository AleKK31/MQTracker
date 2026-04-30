import { getBridge } from './api/vscodeBridge';
import { Store } from './state/store';
import { initRender } from './render';
import type { HostToWebview } from '../../src/ui/webview/protocol';

const bridge = getBridge();
const store = new Store();

initRender(store, (type, id) => {
  switch (type) {
    case 'ack':
      bridge.send({ type: 'ack', id });
      break;
    case 'nack':
      bridge.send({ type: 'nack', id, requeue: false });
      break;
    case 'nack-requeue':
      bridge.send({ type: 'nack', id, requeue: true });
      break;
    case 'replay':
      bridge.send({ type: 'replay', id });
      break;
  }
});

bridge.onMessage((event) => {
  const msg = event.data as HostToWebview;

  switch (msg.type) {
    case 'messagesLoaded':
      store.setMessages(msg.messages);
      break;
    case 'messageAdded':
      store.addMessage(msg.message);
      break;
    case 'messagesBatch':
      store.addBatch(msg.messages);
      break;
    case 'clear':
      store.clear();
      break;
  }
});

// Signal to host that we're ready
bridge.send({ type: 'ready' });