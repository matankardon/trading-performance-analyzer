export function createDataError({ message, source = null, code = "DATA_UNAVAILABLE", cause = null } = {}) {
  return {
    code,
    message: message || "Data unavailable",
    source,
    cause: cause?.message || cause || null,
  };
}

export function createDataResponse({ data = null, error = null, metadata = {} } = {}) {
  return {
    data,
    error: error ? createDataError(error) : null,
    metadata,
  };
}
