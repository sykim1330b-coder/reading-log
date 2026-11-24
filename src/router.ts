import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'logs' }
  | { name: 'books' }
  | { name: 'book'; id: number }
  | { name: 'settings' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  switch (parts[0]) {
    case 'logs':
      return { name: 'logs' };
    case 'books':
      return parts[1] && Number(parts[1]) ? { name: 'book', id: Number(parts[1]) } : { name: 'books' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'home' };
  }
}

export function navigate(path: string) {
  location.hash = path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
