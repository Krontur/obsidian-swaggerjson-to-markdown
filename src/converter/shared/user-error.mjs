export class UserError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = "UserError";
    this.details = details;
  }
}
