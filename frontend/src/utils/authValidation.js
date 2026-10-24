// Register / Login form checks, mirroring the server's rules
// (backend/src/services/auth.service.js). Returns { field: message } for
// every invalid field; empty when the form can be sent.
// (No imports: this file is also loaded by the Node test runner.)

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;
const MAX_PASSWORD_BYTES = 72;

function utf8Length(value) {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0);
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function emailError(email) {
  const value = String(email ?? '').trim();
  if (!value) return 'Email is required';
  if (value.length > 254 || !EMAIL.test(value)) return 'Enter a valid email address';
  return null;
}

export function validateRegisterForm({ name, email, password, confirmPassword }) {
  const errors = {};
  const cleanName = String(name ?? '').trim();
  if (!cleanName) errors.name = 'Name is required';
  else if (cleanName.length > 80) errors.name = 'Name must be at most 80 characters';
  const emailProblem = emailError(email);
  if (emailProblem) errors.email = emailProblem;
  if (!password) errors.password = 'Password is required';
  else if (password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters`;
  else if (utf8Length(password) > MAX_PASSWORD_BYTES) errors.password = 'Password is too long';
  if (!confirmPassword) errors.confirmPassword = 'Confirm your password';
  else if (password && confirmPassword !== password) errors.confirmPassword = "Passwords don't match";
  return errors;
}

export function validateLoginForm({ email, password }) {
  const errors = {};
  const emailProblem = emailError(email);
  if (emailProblem) errors.email = emailProblem;
  if (!password) errors.password = 'Password is required';
  return errors;
}

// Server error → message for the form (field errors come back in `details`).
export function authErrorMessage(error) {
  if (!error) return null;
  if (error.status === 0) return "Couldn't reach the server. Check your connection and try again.";
  return error.message || 'Something went wrong. Please try again.';
}
