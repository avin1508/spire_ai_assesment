import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { authSheetOpened, selectIsGuest } from '../store/sessionSlice';

// Gate for protected actions. `requireAuth(action, intent)` runs `action`
// for signed-in users; for guests it opens the shared login sheet and
// remembers `intent` (a screen to open after sign-in), if given.
// `openLogin(intent)` opens the sheet directly (e.g. a "Sign up" button).
export default function useRequireAuth() {
  const dispatch = useDispatch();
  const isGuest = useSelector(selectIsGuest);

  const openLogin = useCallback((intent) => dispatch(authSheetOpened(intent)), [dispatch]);

  const requireAuth = useCallback(
    (action, intent) => {
      if (isGuest) openLogin(intent);
      else action?.();
    },
    [isGuest, openLogin]
  );

  return { isGuest, requireAuth, openLogin };
}
