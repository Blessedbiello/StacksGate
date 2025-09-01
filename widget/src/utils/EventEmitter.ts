// Simple EventEmitter implementation for the widget
export class EventEmitter {
  private events: Map<string, Function[]> = new Map();

  // Add event listener
  on(event: string, listener: Function): this {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(listener);
    return this;
  }

  // Add one-time event listener
  once(event: string, listener: Function): this {
    const onceWrapper = (...args: any[]) => {
      this.off(event, onceWrapper);
      listener.apply(this, args);
    };
    return this.on(event, onceWrapper);
  }

  // Remove event listener
  off(event: string, listener: Function): this {
    if (!this.events.has(event)) {
      return this;
    }

    const listeners = this.events.get(event)!;
    const index = listeners.indexOf(listener);
    
    if (index !== -1) {
      listeners.splice(index, 1);
    }

    if (listeners.length === 0) {
      this.events.delete(event);
    }

    return this;
  }

  // Emit event
  emit(event: string, data?: any): boolean {
    if (!this.events.has(event)) {
      return false;
    }

    const listeners = this.events.get(event)!.slice(); // Copy array to avoid issues with modifications during iteration
    
    listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`Error in event listener for "${event}":`, error);
      }
    });

    return true;
  }

  // Get all event names
  eventNames(): string[] {
    return Array.from(this.events.keys());
  }

  // Get listener count for event
  listenerCount(event: string): number {
    return this.events.get(event)?.length || 0;
  }

  // Remove all listeners
  removeAllListeners(event?: string): this {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
    return this;
  }
}