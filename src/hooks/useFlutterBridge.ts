import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

declare global {
  interface Window {
    flutter_inappwebview?: {
      callHandler: (handlerName: string, ...args: unknown[]) => void;
    };
    navigateTo?: (path: string) => void;
    appBack?: () => void;
    isRootRoute?: () => boolean;
  }
}

const TAB_ROUTES = new Set(['/', '/at-home', '/explore', '/bookings', '/profile']);

/** Internal navigation stack — single source of truth for back navigation. */
const routeStack: string[] = [window.location.pathname || '/'];

/**
 * Remove routes matching a prefix from the stack.
 */
export function cleanRouteStack(prefix: string) {
  for (let i = routeStack.length - 1; i >= 0; i--) {
    if (routeStack[i].startsWith(prefix)) {
      routeStack.splice(i, 1);
    }
  }
  if (routeStack.length === 0) {
    routeStack.push('/');
  }
}

export function useFlutterBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  /** Tracks whether a navigation is currently in progress to prevent re-entry */
  const isNavigating = useRef(false);

  // Clear stale browser history on mount
  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname);
    if (routeStack.length === 0) {
      routeStack.push(window.location.pathname || '/');
    }
  }, []);

  // --- Sync route stack + notify Flutter on every route change ---
  useEffect(() => {
    const path = location.pathname;
    const top = routeStack[routeStack.length - 1];

    if (path === '/') {
      // Landing on home — reset stack, do NOT navigate anywhere else
      routeStack.length = 1;
      routeStack[0] = '/';
    } else if (top !== path) {
      if (TAB_ROUTES.has(path)) {
        if (routeStack.length > 0) {
          routeStack[routeStack.length - 1] = path;
        } else {
          routeStack.push(path);
        }
      } else {
        routeStack.push(path);
      }
    }

    // Reset navigation lock after route settles
    isNavigating.current = false;

    try {
      if (window.flutter_inappwebview) {
        window.flutter_inappwebview.callHandler('routeChanged', path);
      }
    } catch (_) { /* bridge not ready */ }
  }, [location.pathname]);

  // --- Expose navigateTo / appBack / isRootRoute ---
  useEffect(() => {
    window.navigateTo = (path: string) => {
      if (!path) return;

      // GUARD: prevent re-entrant / rapid-fire navigation
      if (isNavigating.current) return;

      const current = window.location.pathname;

      // GUARD: already on this route
      if (current === path) return;

      // GUARD: stack top already matches
      const top = routeStack[routeStack.length - 1];
      if (top === path) return;

      isNavigating.current = true;

      try {
        if (TAB_ROUTES.has(path)) {
          if (routeStack.length > 0) {
            routeStack[routeStack.length - 1] = path;
          } else {
            routeStack.push(path);
          }
        } else {
          routeStack.push(path);
        }
        navigateRef.current(path, { replace: TAB_ROUTES.has(path) });
      } catch (e) {
        isNavigating.current = false;
        console.error('Navigation error:', e);
      }
    };

    window.appBack = () => {
      // GUARD: prevent re-entrant back
      if (isNavigating.current) return;

      const currentPath = routeStack[routeStack.length - 1] || '/';

      isNavigating.current = true;

      // If on a non-home tab, go home
      if (TAB_ROUTES.has(currentPath) && currentPath !== '/') {
        routeStack.length = 1;
        routeStack[0] = '/';
        if (window.location.pathname !== '/') {
          navigateRef.current('/', { replace: true });
        } else {
          isNavigating.current = false;
        }
        try {
          window.flutter_inappwebview?.callHandler('routeChanged', '/');
        } catch (_) { /* bridge not ready */ }
        return;
      }

      // If on home or stack ≤ 1, let Flutter handle exit
      if (currentPath === '/' || routeStack.length <= 1) {
        routeStack.length = 1;
        routeStack[0] = '/';
        isNavigating.current = false;
        return;
      }

      // Inner page — pop and go back
      routeStack.pop();
      const previous = routeStack[routeStack.length - 1];
      if (window.location.pathname !== previous) {
        navigateRef.current(previous, { replace: true });
      } else {
        isNavigating.current = false;
      }
      try {
        window.flutter_inappwebview?.callHandler('routeChanged', previous);
      } catch (_) { /* bridge not ready */ }
    };

    window.isRootRoute = () =>
      routeStack.length <= 1 || window.location.pathname === '/';

    // Block stale popstate events from WebView history
    const blockPopState = (e: PopStateEvent) => {
      e.stopImmediatePropagation();
      e.preventDefault();
      const top = routeStack[routeStack.length - 1];
      if (window.location.pathname !== top) {
        window.history.replaceState(null, '', top);
      }
    };

    window.addEventListener('popstate', blockPopState, true);

    return () => {
      window.removeEventListener('popstate', blockPopState, true);
      delete window.navigateTo;
      delete window.appBack;
      delete window.isRootRoute;
    };
  }, []);
}
