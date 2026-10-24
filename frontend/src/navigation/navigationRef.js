import { createNavigationContainerRef } from '@react-navigation/native';

// Lets components outside any navigator (the global login sheet) navigate.
export const navigationRef = createNavigationContainerRef();
