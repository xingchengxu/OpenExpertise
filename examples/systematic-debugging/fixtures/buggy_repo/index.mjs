// validateUserId — checks that a user id falls in the range [1, MAX_USER_ID].
// BUG: the comparison is off-by-one. id === MAX_USER_ID is rejected even
// though MAX_USER_ID is supposed to be inclusive. A real debugger would
// find this by reading the function, noticing the < vs <= mismatch, or by
// running the failing test and looking at the assertion.
export const MAX_USER_ID = 1000

export function validateUserId(id) {
  if (typeof id !== 'number' || !Number.isInteger(id)) {
    return { valid: false, reason: 'not_an_integer' }
  }
  if (id < 1) {
    return { valid: false, reason: 'too_small' }
  }
  if (id >= MAX_USER_ID) {
    // BUG: should be `id > MAX_USER_ID` returns invalid; this rejects MAX itself.
    return { valid: false, reason: 'too_large' }
  }
  return { valid: true }
}
