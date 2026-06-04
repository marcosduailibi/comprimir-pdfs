const STATIC_HASH_ROUTES = {
  "#/": "./",
  "#/ferramentas": "./ferramentas.html",
  "#/privacidade": "./privacidade.html",
  "#/termos": "./termos.html",
};

function sameTarget(target) {
  const url = new URL(target, window.location.href);
  return url.pathname === window.location.pathname;
}

function handleStaticHashRoute() {
  const target = STATIC_HASH_ROUTES[window.location.hash];
  if (!target) return;
  if (sameTarget(target)) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
    return;
  }
  window.location.href = target;
}

export function bindStaticHashRoutes() {
  window.addEventListener("hashchange", handleStaticHashRoute);
  handleStaticHashRoute();
}
