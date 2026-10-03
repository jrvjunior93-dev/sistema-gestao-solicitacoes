function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function suportaWebPush() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function obterAssinaturaPush() {
  if (!suportaWebPush()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function criarAssinaturaPush(publicKey) {
  if (!suportaWebPush()) throw new Error('Este navegador não oferece notificações push para o PWA.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('A permissão de notificações não foi concedida.');
  const registration = await navigator.serviceWorker.ready;
  const current = await registration.pushManager.getSubscription();
  return current || registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
}
