export class GreetingService {
  greet(name: string): string {
    return `Hello, ${name}!`;
  }
}

export function formatGreeting(name: string): string {
  return `** ${name} **`;
}

export const GREETING_PREFIX = 'Hello';
