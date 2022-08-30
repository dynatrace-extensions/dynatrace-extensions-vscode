/**
 * Custom error implementation to facilitate passing the Dynatrace error
 * envelope as a parameter.
 */
export class DynatraceAPIError extends Error {
  _errorParams: any;

  /**
   * @param message error message
   * @param errorParams any optional parameters
   */
  constructor(message: string, errorParams?: any) {
    super(message);
    this._errorParams = errorParams;
  }

  get errorParams() {
    return this._errorParams;
  }
}
