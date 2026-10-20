import assert from 'node:assert/strict'
import test from 'node:test'
import { hashRecoveryKeyword, normalizeRecoveryKeyword, verifyRecoveryKeyword } from './security.js'

test('recovery keywords are normalized and hashed with scrypt', async () => {
  assert.equal(normalizeRecoveryKeyword('  My Secret  '), 'my secret')
  assert.equal(normalizeRecoveryKeyword('ＡＢＣ１２３'), 'abc123')

  const { salt, hash } = await hashRecoveryKeyword('我的秘密短语')
  assert.equal(await verifyRecoveryKeyword(' 我的秘密短语 ', salt, hash), true)
  assert.equal(await verifyRecoveryKeyword('另一个短语', salt, hash), false)
})
