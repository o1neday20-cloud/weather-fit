import { RouterProvider } from 'react-router';
import { router } from './routes';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

if (!localStorage.getItem('anonymous_id')) {
  localStorage.setItem('anonymous_id', generateUUID());
}

function App() {
  return <RouterProvider router={router} />;
}

export default App;
