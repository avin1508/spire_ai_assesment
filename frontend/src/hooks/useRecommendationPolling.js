import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { refreshRecommendations, selectRecommendations } from '../store/profileSlice';
import { isInProgress, nextPollDelay } from '../utils/recommendations';

// While recommendations are being generated (queued / processing / deferred),
// re-checks the status at the server's suggested interval — only while this
// screen is focused and the app is in the foreground. Stops on a final state;
// returning to the app re-checks immediately.
export default function useRecommendationPolling() {
  const dispatch = useDispatch();
  const recommendations = useSelector(selectRecommendations);
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const nowActive = next === 'active';
      setActive(nowActive);
      if (nowActive) dispatch(refreshRecommendations());
    });
    return () => subscription.remove();
  }, [dispatch]);

  const delay = nextPollDelay(recommendations);
  const { status, requestId } = recommendations;

  useEffect(() => {
    if (!focused || !active || delay === null || !isInProgress(status)) return undefined;
    const timer = setTimeout(() => dispatch(refreshRecommendations()), delay);
    return () => clearTimeout(timer);
  }, [focused, active, delay, status, requestId, dispatch]);
}
