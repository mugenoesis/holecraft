import { Dashboard } from './Dashboard.tsx';
import { Editor } from './Editor.tsx';
import { NotFound } from './NotFound.tsx';
import { useRoute } from './router.ts';

/** Picks the screen for the current address: the list of designs, one design, or a not-found page. */
export function App() {
  const route = useRoute();
  switch (route.name) {
    case 'home':
      return <Dashboard />;
    case 'design':
      // Keyed by id so moving between designs starts a clean editor each time.
      return <Editor key={route.id} id={route.id} />;
    case 'notfound':
      return <NotFound heading="Page not found">There is nothing at this address.</NotFound>;
  }
}
