import { Platform, useWindowDimensions } from 'react-native';

/** Use the current app window so short screens and split windows can also adapt. */
export function useAppLayout() {
  const { width, height } = useWindowDimensions();
  const compact = Platform.OS === 'android' && (width < 400 || height < 700);

  return { compact };
}
