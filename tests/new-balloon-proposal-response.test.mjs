import assert from 'node:assert/strict'
import test from 'node:test'
import { newBalloonProposalResponseLabel, parseNewBalloonProposalResponse } from '../src/utils/new-balloon-proposal-response.mjs'

const form = (type, note = '') => {
  const data = new FormData()
  data.set('response_type', type)
  data.set('response_note', note)
  return data
}

test('proposal responses use a closed non-binding vocabulary', () => {
  assert.deepEqual(parseNewBalloonProposalResponse(form('interested')), { response_type: 'INTERESTED', note: null })
  assert.deepEqual(parseNewBalloonProposalResponse(form('question', 'Does the range include transport?')), { response_type: 'QUESTION', note: 'Does the range include transport?' })
  assert.equal(newBalloonProposalResponseLabel('DECLINED'), 'Not interested in this proposal')
})

test('proposal response rejects unknown choices and empty questions', () => {
  assert.throws(() => parseNewBalloonProposalResponse(form('accept')), /Choose how/)
  assert.throws(() => parseNewBalloonProposalResponse(form('question', 'Why?')), /Write the question/)
})
