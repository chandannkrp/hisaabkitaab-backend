// Wraps an async Express handler so any rejected promise or thrown error is
// forwarded to next(), reaching globalErrorHandler instead of hanging the
// request or crashing the process via an unhandled rejection.
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
