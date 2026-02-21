import { v4 as uuid } from 'uuid';

export class Machine {
  constructor({ id, type, tileX, tileZ, processing }) {
    this.id = id || uuid();
    this.type = type;
    this.tileX = tileX;
    this.tileZ = tileZ;
    this.processing = processing || null;
  }

  startProcessing(inputItem, outputItem, outputValue, durationMs) {
    const now = Date.now();
    this.processing = {
      inputItem,
      outputItem,
      outputValue,
      startTime: now,
      endTime: now + durationMs,
    };
  }

  isReady() {
    return this.processing && Date.now() >= this.processing.endTime;
  }

  collect() {
    if (!this.isReady()) return null;
    const result = { itemId: this.processing.outputItem, value: this.processing.outputValue };
    this.processing = null;
    return result;
  }

  getState() {
    return {
      id: this.id,
      type: this.type,
      tileX: this.tileX,
      tileZ: this.tileZ,
      processing: this.processing ? {
        outputItem: this.processing.outputItem,
        endTime: this.processing.endTime,
        ready: this.isReady(),
      } : null,
    };
  }
}
