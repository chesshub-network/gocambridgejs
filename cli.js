// cli.js
import { Cambridge } from "./cambridge.js";

export class CLI {
  constructor() {
    this.cambridge = null;
  }

  init(org, product, cookie) {
    this.cambridge = new Cambridge(org, product, cookie);
  }

  async loadUnits(classPath) {
    return await this.cambridge.getUnits(classPath);
  }

  async loadLesson(productCode, lessonId) {
    return await this.cambridge.getLessonResponse(productCode, lessonId);
  }
}
