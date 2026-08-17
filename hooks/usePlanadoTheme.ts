import { useContext } from 'react';

import { ThemeContext } from '../context/ThemeContext';

export function usePlanadoTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('usePlanadoTheme must be used inside ThemeProvider.');
  }

  return context;
}
