// Thrown by service functions whose backend integration does not exist yet,
// so screens can show an honest "not available" state instead of fake data.
export class ServiceUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}
