export abstract class BaseSearcher {
    abstract search(queries: string[]): Promise<string>;
    
    protected delay(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    protected getRandomDelay(min: number, max: number): number {
      return Math.random() * (max - min) + min;
    }
}