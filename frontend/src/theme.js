export const colors = {
  primary: '#1F5BD6',
  primaryDark: '#1A49B0',
  primaryLight: '#E8F0FD',
  pin: '#1D4FC4',
  gold: '#E3A21A',
  text: '#111418',
  textMuted: '#6B7280',
  border: '#E4E7EC',
  surface: '#FFFFFF',
  background: '#F5F7FB',
  danger: '#E5484D',
  success: '#1E9E4A',
  accent: '#5B3FD9',
  cta: '#4A4AE8',
  fitBackground: '#F1EFC4',
  fitText: '#5F5A1E',
  gapDot: '#E5262B',
  chipBackground: '#F2F4F7',
  warningBackground: '#FFF7E6',
  warningBorder: '#F5D28A',
  map: {
    land: '#BDE5CF',
    landLight: '#EFEEE3',
    landDark: '#A6DABF',
    water: '#9AD3EE',
    road: '#A3B1BE',
    border: '#7F8C98',
    region: '#56616B',
    city: '#24282C',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const typography = {
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  caption: { fontSize: 12, color: colors.textMuted },
};

export const shadow = {
  shadowColor: '#0B1B3F',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.12,
  shadowRadius: 6,
  elevation: 4,
};

// Minimum comfortable touch target (Material / HIG guidance).
export const TOUCH_TARGET = 44;
