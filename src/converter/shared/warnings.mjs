export class WarningCollector {
  constructor() { this.items = []; }
  add(message) { if (!this.items.includes(message)) this.items.push(message); }
  hasWarnings() { return this.items.length > 0; }
  print() {
    if (!this.hasWarnings()) return;
    console.warn("\nWarnings:");
    for (const warning of this.items) console.warn(`- ${warning}`);
  }
}
