import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateUserId, MAX_USER_ID } from './index.mjs'

test('rejects non-integer', () => {
  assert.deepEqual(validateUserId('abc'), { valid: false, reason: 'not_an_integer' })
})

test('rejects id < 1', () => {
  assert.deepEqual(validateUserId(0), { valid: false, reason: 'too_small' })
})

test('accepts id in [1, MAX_USER_ID]', () => {
  assert.deepEqual(validateUserId(1), { valid: true })
  assert.deepEqual(validateUserId(500), { valid: true })
  // This is the assertion that fails today — MAX_USER_ID itself should be valid.
  assert.deepEqual(validateUserId(MAX_USER_ID), { valid: true })
})

test('rejects id > MAX_USER_ID', () => {
  assert.deepEqual(validateUserId(MAX_USER_ID + 1), { valid: false, reason: 'too_large' })
})
