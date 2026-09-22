/** Generic HTTP-mappable domain error. Not mission-specific — used across every module and by
 *  main.ts's global exception filter. Formerly `MissionError`, defined inside mission-repository.ts
 *  purely because that's where it was first needed (see ADR-0007). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}
