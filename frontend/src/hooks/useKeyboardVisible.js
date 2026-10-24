import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

// True while the on-screen keyboard is open. Used to drop the bottom
// safe-area padding (the keyboard covers the navigation bar area then).
export default function useKeyboardVisible() {
  const [visible, setVisible] = useState(() => Keyboard.isVisible());

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
